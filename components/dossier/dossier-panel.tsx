'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  CircleDashed,
  Download,
  FileText,
  FolderCheck,
  Loader2,
  PenLine,
  QrCode,
  RefreshCw,
  UserX,
  X,
} from 'lucide-react';
import {
  ensureSignToken,
  attendanceState,
  trainerSign,
  setTraineeAttendance,
  staffTraineeSign,
  dossierExport,
} from '@/app/dossier/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { PdfFiller } from '@/components/dossier/pdf-filler';
import { DocumentList, DocumentUploader, FILLED_BY_LABEL } from '@/components/dossier/document-manager';
import { HALF_LABEL, currentSlot, slotKey, type DossierDocument, type DossierEntry, type Half, type Slot } from '@/lib/dossier';
import type { EntryData } from '@/lib/pdf-dossier';

type Row = { signer: string; trainee_id: string | null; day: string; half: Half; status: string };
type Trainee = { id: string; name: string; company: string | null };

const frShort = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  return `${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

/**
 * Dossier de formation dématérialisé d'une session : émargement (QR code,
 * signatures par demi-journée), documents à remplir en ligne, dossier complet en PDF.
 */
export function DossierPanel({
  sessionId,
  title,
  period,
  room,
  trainerName,
  slots,
  trainees,
  expected,
  signatures,
  documents,
  entries,
  canFill,
  canManage,
}: {
  sessionId: string;
  title: string;
  period: string;
  room: string | null;
  trainerName: string | null;
  slots: Slot[];
  trainees: Trainee[];
  expected: Record<string, string[]>;
  signatures: Row[];
  documents: DossierDocument[];
  entries: DossierEntry[];
  canFill: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(signatures);
  const [localEntries, setLocalEntries] = useState<DossierEntry[]>(entries);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [cell, setCell] = useState<{ traineeId: string | null; slot: Slot } | null>(null);
  const [openDoc, setOpenDoc] = useState<DossierDocument | null>(null);
  const [isPending, startTransition] = useTransition();
  const qrRef = useRef<HTMLDialogElement>(null);
  const cellRef = useRef<HTMLDialogElement>(null);
  const docRef = useRef<HTMLDialogElement>(null);
  const pad = useRef<SignaturePadHandle>(null);

  useEffect(() => setRows(signatures), [signatures]);
  useEffect(() => setLocalEntries(entries), [entries]);

  // Documents obligatoires terminés.
  const requiredDocs = documents.filter((d) => d.required && d.filled_by !== 'aucun');
  const docsDone = requiredDocs.filter((d) => localEntries.some((e) => e.document_id === d.id && e.completed)).length;
  const progress = { documents: { done: docsDone, needed: requiredDocs.length } };
  // Signatures attendues : stagiaires présents par demi-journée (modules) + formateur.
  const emargement = useMemo(() => {
    let needed = 0;
    let done = 0;
    for (const s of slots) {
      const exp = expected[slotKey(s)] || trainees.map((t) => t.id);
      for (const id of exp) {
        needed++;
        if (rows.some((r) => r.signer === 'stagiaire' && r.trainee_id === id && r.day === s.day && r.half === s.half)) done++;
      }
      needed++;
      if (rows.some((r) => r.signer === 'formateur' && r.day === s.day && r.half === s.half)) done++;
    }
    return { needed, done, complete: trainees.length > 0 && needed > 0 && done === needed };
  }, [slots, expected, trainees, rows]);
  const complete = emargement.complete && progress.documents.done === progress.documents.needed;
  const remaining = emargement.needed - emargement.done + (progress.documents.needed - progress.documents.done);
  const now = currentSlot(slots);

  const find = (signer: string, traineeId: string | null, s: Slot) =>
    rows.find((r) => r.signer === signer && (r.trainee_id || null) === traineeId && r.day === s.day && r.half === s.half);

  // Rafraîchissement en direct pendant l'affichage du QR code.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      const res = await attendanceState(sessionId);
      if (res.ok) setRows(res.rows as Row[]);
    }, 4000);
    return () => clearInterval(t);
  }, [qr, sessionId]);

  async function showQr(renew = false) {
    setError(null);
    setBusy('qr');
    const res = await ensureSignToken(sessionId, renew);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    const url = `${window.location.origin}/emargement/${res.token}`;
    const image = await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' });
    setQr({ url, image });
    if (!qrRef.current?.open) qrRef.current?.showModal();
  }

  function openCell(traineeId: string | null, slot: Slot) {
    if (!canFill) return;
    setCell({ traineeId, slot });
    cellRef.current?.showModal();
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error || 'Erreur.');
      else {
        cellRef.current?.close();
        const st = await attendanceState(sessionId);
        if (st.ok) setRows(st.rows as Row[]);
        router.refresh();
      }
    });
  }

  function signCell() {
    if (!cell) return;
    const sig = pad.current?.toDataURL();
    if (!sig) return setError('Signe dans le cadre avant de valider.');
    const { traineeId, slot } = cell;
    act(() => (traineeId ? staffTraineeSign(sessionId, traineeId, slot.day, slot.half, sig) : trainerSign(sessionId, slot.day, slot.half, sig)));
  }

  async function exportPdf(full: boolean) {
    setError(null);
    setBusy(full ? 'full' : 'emargement');
    try {
      const { buildEmargementPdf, downloadPdf, fillDocumentPdf, mergePdfs } = await import('@/lib/pdf-dossier');
      const res = await dossierExport(sessionId);
      if (!res.ok) throw new Error(res.error);
      const emarg = await buildEmargementPdf({ title, period, room, trainerName, slots, trainees, expected, signatures: res.signatures });
      if (!full) {
        downloadPdf(emarg, `Emargement - ${title}.pdf`);
        return;
      }
      const parts: Uint8Array[] = [emarg];
      for (const d of documents) {
        const url = res.files[d.id];
        if (!url) continue;
        const file = await fetch(url);
        if (!file.ok) continue;
        const entry = res.entries.find((e: any) => e.document_id === d.id);
        parts.push(await fillDocumentPdf(await file.arrayBuffer(), entry?.data as EntryData));
      }
      downloadPdf(await mergePdfs(parts), `Dossier - ${title} - ${period}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Génération impossible.');
    } finally {
      setBusy(null);
    }
  }

  const cellTrainee = cell?.traineeId ? trainees.find((t) => t.id === cell.traineeId) : null;
  const cellRow = cell ? find(cell.traineeId ? 'stagiaire' : 'formateur', cell.traineeId, cell.slot) : undefined;
  const sessionDocs = documents.filter((d) => d.session_id);
  const entryOf = (id: string) => localEntries.find((e) => e.document_id === id);

  return (
    <div className="panel" id="dossier">
      <div className="panel-head">
        <h2><FolderCheck size={18} aria-hidden /> Dossier de formation</h2>
        {complete ? (
          <span className="badge validee dossier-badge"><CheckCircle2 size={13} aria-hidden /> Dossier complet</span>
        ) : (
          <span className="badge brouillon dossier-badge"><CircleDashed size={13} aria-hidden /> {remaining} élément{remaining > 1 ? 's' : ''} à compléter</span>
        )}
      </div>
      <p className="panel-intro">
        Plus de papier : les stagiaires signent avec leur téléphone (QR code), le formateur remplit les documents en ligne et
        tout s’enregistre automatiquement. Quand tout est signé et rempli, la session affiche « Dossier complet » sur le planning.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      <div className="dossier-actions">
        {canFill && (
          <button className="primary" onClick={() => showQr()} disabled={busy === 'qr' || trainees.length === 0}>
            <QrCode size={16} aria-hidden /> {busy === 'qr' ? 'Ouverture…' : 'QR code d’émargement'}
          </button>
        )}
        <button onClick={() => exportPdf(false)} disabled={!!busy}>
          {busy === 'emargement' ? <Loader2 size={15} className="spin" aria-hidden /> : <Download size={15} aria-hidden />} Feuille d’émargement
        </button>
        <button onClick={() => exportPdf(true)} disabled={!!busy}>
          {busy === 'full' ? <Loader2 size={15} className="spin" aria-hidden /> : <Download size={15} aria-hidden />} Dossier complet (PDF)
        </button>
      </div>

      <h3 className="sub-heading">
        Émargement <span className="hint">({emargement.done}/{emargement.needed} signatures)</span>
      </h3>
      {trainees.length === 0 ? (
        <p className="hint">Ajoute des stagiaires validés : la feuille d’émargement se génère automatiquement.</p>
      ) : (
        <div className="table-wrap">
          <table className="data emarg-table">
            <thead>
              <tr>
                <th>Stagiaire</th>
                {slots.map((s) => (
                  <th key={slotKey(s)} className={now && slotKey(now) === slotKey(s) ? 'current-slot' : ''}>
                    {frShort(s.day)}
                    <small>{HALF_LABEL[s.half]}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trainees.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.company && <small className="hint" style={{ display: 'block' }}>{t.company}</small>}
                  </td>
                  {slots.map((s) => {
                    const exp = expected[slotKey(s)];
                    if (exp && !exp.includes(t.id)) return <td key={slotKey(s)} className="emarg-na" title="Pas de module ce jour-là">-</td>;
                    const r = find('stagiaire', t.id, s);
                    return (
                      <td key={slotKey(s)}>
                        <button
                          type="button"
                          className={`emarg-cell ${r ? (r.status === 'absent' ? 'absent' : 'signed') : 'todo'}`}
                          onClick={() => openCell(t.id, s)}
                          disabled={!canFill}
                          aria-label={`${t.name}, ${HALF_LABEL[s.half]} ${frShort(s.day)} : ${r ? (r.status === 'absent' ? 'absent' : 'signé') : 'à signer'}`}
                        >
                          {r ? (r.status === 'absent' ? <><UserX size={13} aria-hidden /> Absent</> : <><CheckCircle2 size={13} aria-hidden /> Signé</>) : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="emarg-trainer">
                <td><strong>Formateur</strong>{trainerName && <small className="hint" style={{ display: 'block' }}>{trainerName}</small>}</td>
                {slots.map((s) => {
                  const r = find('formateur', null, s);
                  return (
                    <td key={slotKey(s)}>
                      <button type="button" className={`emarg-cell ${r ? 'signed' : 'todo'}`} onClick={() => openCell(null, s)} disabled={!canFill}>
                        {r ? <><CheckCircle2 size={13} aria-hidden /> Signé</> : canFill ? <><PenLine size={13} aria-hidden /> Signer</> : '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h3 className="sub-heading">
        Documents <span className="hint">({progress.documents.done}/{progress.documents.needed} obligatoires terminés)</span>
      </h3>
      {documents.length === 0 ? (
        <p className="hint">
          Aucun document à remplir.{canManage ? ' Ajoute-les une fois pour toutes dans Formations disponibles › Dossier, ou pour cette session ci-dessous.' : ''}
        </p>
      ) : (
        <div className="doc-list">
          {documents.map((d) => {
            const e = entryOf(d.id);
            const mayFill = d.filled_by === 'formateur' ? canFill : d.filled_by === 'bureau' ? canManage : false;
            return (
              <div key={d.id} className="doc-item">
                <FileText size={16} aria-hidden />
                <span className="doc-item-main">
                  <strong>{d.title}</strong>
                  <small className="hint">
                    {FILLED_BY_LABEL[d.filled_by]}
                    {d.required && d.filled_by !== 'aucun' ? ' · obligatoire' : ''}
                    {d.session_id ? ' · propre à cette session' : ''}
                  </small>
                </span>
                {d.filled_by !== 'aucun' &&
                  (e?.completed ? (
                    <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
                  ) : e ? (
                    <span className="badge en_attente">En cours</span>
                  ) : (
                    <span className="badge brouillon">À remplir</span>
                  ))}
                <button
                  type="button"
                  className={`small${mayFill && !e?.completed ? ' primary' : ''}`}
                  onClick={() => {
                    setOpenDoc(d);
                    docRef.current?.showModal();
                  }}
                >
                  {mayFill && !e?.completed ? <><PenLine size={14} aria-hidden /> Remplir</> : 'Ouvrir'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <details className="doc-session-manage">
          <summary>Documents propres à cette session ({sessionDocs.length})</summary>
          <DocumentList documents={sessionDocs} emptyLabel="Aucun document propre à cette session." />
          <DocumentUploader sessionId={sessionId} />
        </details>
      )}

      {/* QR code à afficher en salle */}
      <dialog ref={qrRef} className="modal qr-modal" aria-labelledby="qr-title" onClose={() => { setQr(null); router.refresh(); }}>
        <div className="modal-head">
          <h2 id="qr-title"><QrCode size={18} aria-hidden /> Émargement : {title}</h2>
          <button className="icon ghost" onClick={() => qrRef.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body qr-body">
          {qr && (
            <>
              <img src={qr.image} alt="QR code d’émargement" className="qr-image" />
              <div className="qr-side">
                <p className="qr-slot">{now ? `${HALF_LABEL[now.half]} du ${now.day.split('-').reverse().join('/')}` : 'Aucune demi-journée en cours'}</p>
                <p>Scanne ce QR code avec l’appareil photo de ton téléphone, touche ton nom et signe.</p>
                {now && (
                  <ul className="qr-list" aria-live="polite">
                    {(expected[slotKey(now)] ? trainees.filter((t) => expected[slotKey(now)].includes(t.id)) : trainees).map((t) => {
                      const r = find('stagiaire', t.id, now);
                      return (
                        <li key={t.id} className={r ? 'ok' : ''}>
                          {r ? <CheckCircle2 size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />} {t.name}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="hint" style={{ wordBreak: 'break-all' }}>{qr.url}</p>
                <button className="small" onClick={() => confirm('Créer un nouveau QR code ? L’ancien ne fonctionnera plus.') && showQr(true)}>
                  <RefreshCw size={14} aria-hidden /> Nouveau QR code
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>

      {/* Case d'émargement : signer sur place, absent, effacer */}
      <dialog ref={cellRef} className="modal" aria-labelledby="cell-title" onClose={() => setCell(null)}>
        <div className="modal-head">
          <h2 id="cell-title">
            {cellTrainee ? cellTrainee.name : `Formateur${trainerName ? ` : ${trainerName}` : ''}`}
            {cell && <span className="hint" style={{ fontWeight: 600 }}> · {HALF_LABEL[cell.slot.half]} {frShort(cell.slot.day)}</span>}
          </h2>
          <button className="icon ghost" onClick={() => cellRef.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 12 }}>
          {cellRow && (
            <p className="hint">
              {cellRow.status === 'absent' ? 'Marqué absent.' : 'Déjà signé.'} Tu peux effacer pour faire signer à nouveau.
            </p>
          )}
          {cell && <SignaturePad key={`${cell.traineeId}-${slotKey(cell.slot)}`} ref={pad} height={170} />}
          {cellTrainee && <p className="hint" style={{ marginTop: 6 }}>Le stagiaire n’a pas de téléphone ? Il peut signer ici, sur ton appareil.</p>}
        </div>
        <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
          {cell?.traineeId && (
            <button type="button" onClick={() => act(() => setTraineeAttendance(sessionId, cell.traineeId!, cell.slot.day, cell.slot.half, 'absent'))} disabled={isPending}>
              <UserX size={14} aria-hidden /> Absent
            </button>
          )}
          {cellRow && cell?.traineeId && (
            <button type="button" className="danger" onClick={() => act(() => setTraineeAttendance(sessionId, cell.traineeId!, cell.slot.day, cell.slot.half, 'reset'))} disabled={isPending}>
              Effacer
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="primary" onClick={signCell} disabled={isPending}>
            <PenLine size={14} aria-hidden /> {isPending ? 'Enregistrement…' : 'Valider la signature'}
          </button>
        </div>
      </dialog>

      {/* Document à remplir en ligne */}
      <dialog ref={docRef} className="modal modal-full" aria-label={openDoc?.title || 'Document'} onClose={() => { setOpenDoc(null); router.refresh(); }}>
        {openDoc && (
          <PdfFiller
            key={openDoc.id}
            sessionId={sessionId}
            documentId={openDoc.id}
            title={openDoc.title}
            initialData={(entryOf(openDoc.id)?.data as EntryData) || null}
            initialCompleted={Boolean(entryOf(openDoc.id)?.completed)}
            canEdit={openDoc.filled_by === 'formateur' ? canFill : openDoc.filled_by === 'bureau' ? canManage : false}
            onClose={() => docRef.current?.close()}
            onSaved={(data, completed) =>
              setLocalEntries((list) => [...list.filter((e) => e.document_id !== openDoc.id), { document_id: openDoc.id, data, completed }])
            }
          />
        )}
      </dialog>
    </div>
  );
}
