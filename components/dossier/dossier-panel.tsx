'use client';

import { DigiformaDocs } from '@/components/dossier/digiforma-docs';

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
  Award,
  IdCard,
} from 'lucide-react';
import {
  ensureSignToken,
  attendanceState,
  trainerSign,
  setTraineeAttendance,
  staffTraineeSign,
  dossierExport,
  documentUrl,
} from '@/app/dossier/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { PdfFiller } from '@/components/dossier/pdf-filler';
import { TourDeTable } from '@/components/dossier/tour-de-table';
import type { TdtData } from '@/lib/tdt';
import type { Legal } from '@/lib/pdf-brand';
import { EMARGEMENT_ENABLED } from '@/lib/features';
import { AppreciationEditor } from '@/components/dossier/appreciation-editor';
import { ReussiteEditor, reussiteInputs, type ReussiteSession } from '@/components/dossier/reussite-editor';
import { TitleFiles, TitleQrButton, downloadAllTitles } from '@/components/dossier/titles';
import { titleOk, type TitleFile } from '@/lib/titres';
import { reussiteCount, reussiteDone, type ReussiteData } from '@/lib/reussite';
import { setSessionAppreciation } from '@/app/dossier/actions';
import { appreciationDone, type AppreciationData } from '@/lib/appreciation';
import { DocumentList, DocumentUploader, FILLED_BY_LABEL } from '@/components/dossier/document-manager';
import { HALF_LABEL, currentSlot, slotKey, type DossierDocument, type DossierEntry, type Half, type Slot } from '@/lib/dossier';
import type { EntryData } from '@/lib/pdf-dossier';
import { askConfirm } from '@/lib/confirm-dialog';

type Row = { signer: string; trainee_id: string | null; day: string; half: Half; status: string };
type Trainee = { id: string; name: string; company: string | null; cursus?: 'initial' | 'recyclage' | null };

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
  tourDeTable,
  place = null,
  legal = null,
  dayTrainerNames = {},
  billingDone = null,
  appreciation = null,
  digiforma = null,
  reussite = null,
  titleFiles = null,
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
  /** Tour de table intégré (null si désactivé pour cette formation). */
  tourDeTable: { data: TdtData | null; completed: boolean; completedAt: string | null } | null;
  /** Lieu de formation complet (feuille d'émargement). */
  place?: string | null;
  /** SIRET, déclaration d'activité, ville du « Fait à ». */
  legal?: Legal | null;
  /** Remplaçant certains jours : jour → nom du formateur ce jour-là. */
  dayTrainerNames?: Record<string, string>;
  /** Lien Digiforma des autres documents à remplir (null si la migration 36 manque). */
  digiforma?: { url: string | null; done: boolean } | null;
  /** Facturation faite (migration 30) ; null = pas de suivi de facturation. */
  billingDone?: boolean | null;
  /** Attestations de réussite (formation avec un modèle choisi, migration 39). */
  reussite?: { session: Omit<ReussiteSession, 'sessionId' | 'title' | 'legal'>; data: ReussiteData | null } | null;
  /** Titres d'habilitation déposés (null si la migration 46 manque). */
  titleFiles?: TitleFile[] | null;
  /** Fiches d'appréciation individuelle (null si la migration 21 manque). */
  appreciation?: {
    required: boolean;
    sessionFlag: boolean | null;
    templateFlag: boolean;
    data: AppreciationData | null;
    codification: string;
    startDate: string;
    endDate: string;
    lieu: string | null;
    trainerNames: string | null;
    /** Documents de fin de formation (bureau) : null si pas les droits. */
    finFormation: {
      actionTitle: string;
      formationTitle: string;
      objectifs: string | null;
      competences: string | null;
      objectifsRecyclage?: string | null;
      competencesRecyclage?: string | null;
      days: number;
      hours: number;
      address: string | null;
      signataire: string;
      agrement: string;
      cachet: string | null;
    } | null;
  } | null;
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
  const tdtRef = useRef<HTMLDialogElement>(null);
  const [tdt, setTdt] = useState(tourDeTable);
  const [tdtOpen, setTdtOpen] = useState(false);
  const faiRef = useRef<HTMLDialogElement>(null);
  const [faiOpen, setFaiOpen] = useState(false);
  const [faiData, setFaiData] = useState<AppreciationData | null>(appreciation?.data || null);
  useEffect(() => setFaiData(appreciation?.data || null), [appreciation]);
  const faiOn = Boolean(appreciation?.required);
  const faiDone = faiOn && appreciationDone(faiData, trainees.map((t) => t.id));
  const faiCount = trainees.filter((t) => faiData?.trainees?.[t.id]?.avis).length;
  // Titres d'habilitation (migration 46) : sans titre, pas d'attestation remise.
  const [titles, setTitles] = useState<TitleFile[]>(titleFiles || []);
  useEffect(() => setTitles(titleFiles || []), [titleFiles]);
  const titleOn = Boolean(tdt) && titleFiles !== null && !tdt?.data?.noTitle;
  const hasTitle = (id: string) => !titleOn || titleOk(id, tdt, titles);
  const titleMissing = trainees.filter((t) => !hasTitle(t.id));
  // Stagiaires dont la fiche d'appréciation a un avis : documents de fin de formation prêts.
  const finReady = trainees.filter((t) => faiData?.trainees?.[t.id]?.avis);
  // Attestation de fin de formation : en plus, titre d'habilitation fourni.
  const attReady = finReady.filter((t) => hasTitle(t.id));
  const fin = appreciation?.finFormation || null;
  async function downloadFin(kind: 'attestation' | 'competences', only?: string) {
    if (!fin || !appreciation) return;
    setError(null);
    setBusy(`${kind}-${only || 'all'}`);
    try {
      const m = await import('@/lib/pdf-fin-formation');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const pool = kind === 'attestation' ? attReady : finReady;
      const list = only ? pool.filter((t) => t.id === only) : pool;
      if (!list.length) throw new Error('Titre d’habilitation manquant : attestation bloquée.');
      const input = {
        ...fin,
        trainees: list,
        entries: faiData?.trainees || {},
        startDate: appreciation.startDate,
        endDate: appreciation.endDate,
        legal,
      };
      const bytes = kind === 'attestation' ? await m.buildAttestationsPdf(input) : await m.buildCompetencesPdf(input);
      const what = kind === 'attestation' ? 'Attestation de fin de formation' : 'Appréciation des compétences';
      downloadPdf(bytes, `${what}${only ? ` - ${list[0]?.name}` : 's'} - ${title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Génération impossible.');
    } finally {
      setBusy(null);
    }
  }

  // Attestations de réussite.
  const arRef = useRef<HTMLDialogElement>(null);
  const [arOpen, setArOpen] = useState(false);
  const [arData, setArData] = useState<ReussiteData | null>(reussite?.data || null);
  useEffect(() => setArData(reussite?.data || null), [reussite]);
  const arOn = Boolean(reussite?.session.series.length);
  const arSession: ReussiteSession | null = arOn && reussite ? { ...reussite.session, sessionId, title, legal } : null;
  const arGroups = (arSession?.series || []).map((s) => ({ key: s.model.key, traineeIds: s.trainees.map((t) => t.id) }));
  const arDone = arOn && reussiteDone(arData, arGroups);
  const { done: arCount, total: arTotal } = reussiteCount(arData, arGroups);
  const arLabels = (arSession?.series || []).map((s) => s.model.label).join(' · ');

  const faiSession = appreciation
    ? {
        sessionId,
        title,
        codification: appreciation.codification,
        startDate: appreciation.startDate,
        endDate: appreciation.endDate,
        lieu: appreciation.lieu,
        trainerName: appreciation.trainerNames,
        legal,
        trainees,
      }
    : null;
  useEffect(() => setTdt(tourDeTable), [tourDeTable]);

  useEffect(() => setRows(signatures), [signatures]);
  useEffect(() => setLocalEntries(entries), [entries]);

  // Documents à remplir sur Digiforma (lien renseigné) : coché par le formateur.
  const [dfDone, setDfDone] = useState(Boolean(digiforma?.done));
  useEffect(() => setDfDone(Boolean(digiforma?.done)), [digiforma?.done]);
  const dfOn = Boolean(digiforma?.url);
  // Documents obligatoires terminés.
  const requiredDocs = documents.filter((d) => d.required && d.filled_by !== 'aucun');
  const docsDone =
    requiredDocs.filter((d) => localEntries.some((e) => e.document_id === d.id && e.completed)).length +
    (tdt?.completed ? 1 : 0) +
    (faiDone ? 1 : 0) +
    (arDone ? 1 : 0) +
    (dfOn && dfDone ? 1 : 0);
  const progress = { documents: { done: docsDone, needed: requiredDocs.length + (tdt ? 1 : 0) + (faiOn ? 1 : 0) + (arOn ? 1 : 0) + (dfOn ? 1 : 0) } };
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
  // Émargement masqué (géré dans Digiforma) : il ne compte plus dans le dossier.
  const emargOk = EMARGEMENT_ENABLED ? emargement.complete : true;
  const pedagogyComplete =
    emargOk &&
    progress.documents.done === progress.documents.needed &&
    (EMARGEMENT_ENABLED || progress.documents.needed > 0);
  // Le dossier n'est complet qu'une fois la facturation faite.
  const complete = pedagogyComplete && billingDone !== false;
  const remaining =
    (EMARGEMENT_ENABLED ? emargement.needed - emargement.done : 0) +
    (progress.documents.needed - progress.documents.done) +
    (billingDone === false ? 1 : 0);
  const now = currentSlot(slots);
  const lastDay = slots.length ? slots[slots.length - 1].day.split('-').reverse().join('/') : null;

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
      const parts: Uint8Array[] = [];
      if (EMARGEMENT_ENABLED) {
        const emarg = await buildEmargementPdf({ title, period, room, trainerName, slots, trainees, expected, signatures: res.signatures, place, legal, dayTrainerNames });
        if (!full) {
          downloadPdf(emarg, `Emargement - ${title}.pdf`);
          return;
        }
        parts.push(emarg);
      }
      if (tdt) {
        const { buildTourDeTablePdf } = await import('@/lib/tour-de-table');
        parts.push(
          await buildTourDeTablePdf({
            title, period, room, trainerName, trainees, place, legal, lastDay,
            data: tdt.data || {},
            completedAt: tdt.completed ? tdt.completedAt : null,
          })
        );
      }
      if (faiOn && faiSession && trainees.length) {
        const { buildAppreciationPdf } = await import('@/lib/pdf-appreciation');
        parts.push(await buildAppreciationPdf({ ...faiSession, entries: faiData?.trainees || {} }));
        if (fin && finReady.length && appreciation) {
          const m = await import('@/lib/pdf-fin-formation');
          const input = { ...fin, trainees: finReady, entries: faiData?.trainees || {}, startDate: appreciation.startDate, endDate: appreciation.endDate, legal };
          if (attReady.length) parts.push(await m.buildAttestationsPdf({ ...input, trainees: attReady }));
          parts.push(await m.buildCompetencesPdf(input));
        }
      }
      if (arSession && arTotal) {
        const { buildReussitePdf } = await import('@/lib/pdf-reussite');
        const ar = reussiteInputs(arSession, arData, undefined, titleMissing.map((t) => t.id));
        if (ar.length) parts.push(await buildReussitePdf(ar));
      }
      for (const d of documents) {
        const url = res.files[d.id];
        if (!url) continue;
        const file = await fetch(url);
        if (!file.ok) continue;
        const entry = res.entries.find((e: any) => e.document_id === d.id);
        parts.push(await fillDocumentPdf(await file.arrayBuffer(), entry?.data as EntryData));
      }
      // Page de garde : récapitulatif, lieu, mentions légales.
      const { buildDossierCover } = await import('@/lib/dossier-cover');
      const cover = await buildDossierCover({
        title, period, room, trainerName, place, legal, lastDay,
        complete,
        items: [
          ...(EMARGEMENT_ENABLED
            ? [{ title: 'Feuille d’émargement', detail: `${emargement.done}/${emargement.needed} signatures`, done: emargement.complete }]
            : []),
          ...(tdt ? [{ title: `Tour de table · ${title}`, detail: tdt.completed ? `Terminé le ${tdt.completedAt || ''}` : 'En cours', done: tdt.completed }] : []),
          ...(faiOn ? [{ title: 'Fiches d’appréciation individuelle', detail: `${faiCount}/${trainees.length} avis donnés`, done: faiDone }] : []),
          ...(titleOn
            ? [{ title: 'Titres d’habilitation', detail: `${trainees.length - titleMissing.length}/${trainees.length} fournis`, done: titleMissing.length === 0 }]
            : []),
          ...(faiOn && fin
            ? [{ title: 'Attestations de fin de formation et appréciations des compétences', detail: `${attReady.length}/${trainees.length} attestations générées`, done: faiDone && !titleMissing.length }]
            : []),
          ...(arSession
            ? [{ title: `Attestations de réussite · ${arLabels}`, detail: `${arCount}/${arTotal} avis donnés${arData?.signature ? ' · signées' : ''}`, done: arDone }]
            : []),
          ...documents.map((d) => {
            const e = entryOf(d.id);
            return {
              title: d.title,
              detail: d.filled_by === 'aucun' ? 'Document à consulter' : FILLED_BY_LABEL[d.filled_by],
              done: d.filled_by === 'aucun' || Boolean(e?.completed),
            };
          }),
        ],
      });
      downloadPdf(await mergePdfs([cover, ...parts]), `Dossier - ${title} - ${period}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Génération impossible.');
    } finally {
      setBusy(null);
    }
  }

  /** Tour de table terminé : PDF à la charte. */
  async function downloadTdt() {
    if (!tdt) return;
    setError(null);
    setBusy('tdt');
    try {
      const { buildTourDeTablePdf } = await import('@/lib/tour-de-table');
      const { downloadPdf } = await import('@/lib/pdf-dossier');
      const bytes = await buildTourDeTablePdf({
        title, period, room, trainerName, trainees, place, legal, lastDay,
        data: tdt.data || {},
        completedAt: tdt.completed ? tdt.completedAt : null,
      });
      downloadPdf(bytes, `Tour de table - ${title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Téléchargement impossible.');
    } finally {
      setBusy(null);
    }
  }

  /** Document terminé : le PDF avec tout ce qui a été rempli. */
  async function downloadDoc(d: DossierDocument) {
    setError(null);
    setBusy(d.id);
    try {
      const res = await documentUrl(d.id);
      if (!res.ok) throw new Error(res.error);
      const file = await fetch(res.url);
      if (!file.ok) throw new Error('Fichier introuvable.');
      const { fillDocumentPdf, downloadPdf } = await import('@/lib/pdf-dossier');
      downloadPdf(await fillDocumentPdf(await file.arrayBuffer(), entryOf(d.id)?.data as EntryData), `${d.title} - ${title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Téléchargement impossible.');
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
        ) : pedagogyComplete && billingDone === false ? (
          <span className="badge planifiee dossier-badge"><CircleDashed size={13} aria-hidden /> Reste la facturation</span>
        ) : (
          <span className="badge brouillon dossier-badge"><CircleDashed size={13} aria-hidden /> {remaining} élément{remaining > 1 ? 's' : ''} à compléter</span>
        )}
      </div>
      <p className="panel-intro">
        {EMARGEMENT_ENABLED
          ? 'Plus de papier : les stagiaires signent avec leur téléphone (QR code), le formateur remplit les documents en ligne et tout s’enregistre automatiquement. Quand tout est signé et rempli, la session affiche « Dossier complet » sur le planning.'
          : 'Plus de papier : le formateur remplit les documents en ligne et tout s’enregistre automatiquement. Quand tout est rempli, la session affiche « Dossier complet » sur le planning. L’émargement se fait dans Digiforma.'}
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {digiforma && (
        <DigiformaDocs sessionId={sessionId} url={digiforma.url} done={dfDone} canEdit={canManage} canFill={canFill} onDone={setDfDone} />
      )}

      <div className="dossier-actions">
        {EMARGEMENT_ENABLED && canFill && (
          <button className="primary" onClick={() => showQr()} disabled={busy === 'qr' || trainees.length === 0}>
            <QrCode size={16} aria-hidden /> {busy === 'qr' ? 'Ouverture…' : 'QR code d’émargement'}
          </button>
        )}
        {EMARGEMENT_ENABLED && (
          <button onClick={() => exportPdf(false)} disabled={!!busy}>
            {busy === 'emargement' ? <Loader2 size={15} className="spin" aria-hidden /> : <Download size={15} aria-hidden />} Feuille d’émargement
          </button>
        )}
        <button onClick={() => exportPdf(true)} disabled={!!busy}>
          {busy === 'full' ? <Loader2 size={15} className="spin" aria-hidden /> : <Download size={15} aria-hidden />} Dossier complet (PDF)
        </button>
      </div>

      {EMARGEMENT_ENABLED && (
        <>
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
                  const sub = dayTrainerNames[s.day];
                  return (
                    <td key={slotKey(s)}>
                      <button type="button" className={`emarg-cell ${r ? 'signed' : 'todo'}`} onClick={() => openCell(null, s)} disabled={!canFill}>
                        {r ? <><CheckCircle2 size={13} aria-hidden /> Signé</> : canFill ? <><PenLine size={13} aria-hidden /> Signer</> : '·'}
                      </button>
                      {sub && <small className="emarg-sub" title="Remplaçant ce jour-là">{sub}</small>}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

        </>
      )}

      <h3 className="sub-heading">
        Documents <span className="hint">({progress.documents.done}/{progress.documents.needed} obligatoires terminés)</span>
      </h3>
      {tdt && (
        <div className="doc-list" style={{ marginBottom: documents.length ? 6 : 10 }}>
          <div className="doc-item">
            <FileText size={16} aria-hidden />
            <span className="doc-item-main">
              <strong>Tour de table · {title}</strong>
              <small className="hint">Rempli par le formateur à l’ordinateur · obligatoire</small>
            </span>
            {tdt.completed ? (
              <>
                <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
                <button type="button" className="small primary" onClick={downloadTdt} disabled={busy === 'tdt'}>
                  {busy === 'tdt' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Télécharger
                </button>
              </>
            ) : tdt.data ? (
              <span className="badge en_attente">En cours</span>
            ) : (
              <span className="badge brouillon">À remplir</span>
            )}
            <button
              type="button"
              className={`small${canFill && !tdt.completed ? ' primary' : ''}`}
              onClick={() => {
                setTdtOpen(true);
                tdtRef.current?.showModal();
              }}
            >
              {canFill && !tdt.completed ? <><PenLine size={14} aria-hidden /> Remplir</> : 'Ouvrir'}
            </button>
          </div>
        </div>
      )}
      {titleOn && trainees.length > 0 && (
        <div className="fin-docs titles-docs">
          <div className="fin-docs-head">
            <span className="doc-item-main">
              <strong><IdCard size={15} aria-hidden style={{ verticalAlign: '-2px' }} /> Titres d’habilitation</strong>
              <small className="hint">
                Déposés par les stagiaires (QR code) ou scannés par le formateur. À télécharger pour Digiforma. Sans titre, l’attestation du stagiaire n’est pas remise.
              </small>
            </span>
            <span className={`badge ${titleMissing.length ? 'en_attente' : 'validee'}`}>
              {trainees.length - titleMissing.length}/{trainees.length} fournis
            </span>
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', margin: '8px 0' }}>
            {canFill && <TitleQrButton sessionId={sessionId} title={title} />}
            <button
              className="small primary"
              disabled={!titles.length || busy === 'titles'}
              onClick={async () => {
                setBusy('titles');
                setError(await downloadAllTitles(titles, Object.fromEntries(trainees.map((t) => [t.id, t.name]))));
                setBusy(null);
              }}
            >
              {busy === 'titles' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Télécharger tous les titres ({titles.length})
            </button>
          </div>
          <details open={titleMissing.length > 0}>
            <summary>Par stagiaire</summary>
            <div className="fin-list">
              {trainees.map((t) => {
                const files = titles.filter((f) => f.trainee_id === t.id);
                return (
                  <div key={t.id} className="fin-row">
                    <span>
                      <strong>{t.name}</strong>
                      <small className="hint">
                        {files.length
                          ? `${files.length} fichier${files.length > 1 ? 's' : ''}`
                          : hasTitle(t.id)
                            ? 'Fourni (case cochée), pas de fichier déposé'
                            : 'Titre manquant'}
                      </small>
                    </span>
                    <TitleFiles sessionId={sessionId} traineeId={t.id} traineeName={t.name} files={titles} canUpload={canFill} onFiles={setTitles} />
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}
      {appreciation && (faiOn || (canManage && appreciation.templateFlag)) && (
        <div className="doc-list" style={{ marginBottom: 6 }}>
          <div className={`doc-item${faiOn ? '' : ' doc-off'}`}>
            <FileText size={16} aria-hidden />
            <span className="doc-item-main">
              <strong>Fiches d’appréciation individuelle</strong>
              <small className="hint">
                {faiOn
                  ? `Une fiche par stagiaire, remplie par le formateur · ${faiCount}/${trainees.length} avis donnés`
                  : 'Non demandées pour cette session'}
              </small>
            </span>
            {canManage && (
              <select
                className="input"
                aria-label="Fiches d’appréciation pour cette session"
                value={appreciation.sessionFlag === null ? 'auto' : appreciation.sessionFlag ? 'oui' : 'non'}
                onChange={(e) => {
                  const v = e.target.value;
                  startTransition(async () => {
                    const res = await setSessionAppreciation(sessionId, v === 'auto' ? null : v === 'oui');
                    if (!res.ok) setError(res.error);
                  });
                }}
              >
                <option value="auto">Selon la formation ({appreciation.templateFlag ? 'oui' : 'non'})</option>
                <option value="oui">Oui pour cette session</option>
                <option value="non">Non pour cette session</option>
              </select>
            )}
            {faiOn &&
              (faiDone ? (
                <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
              ) : faiCount ? (
                <span className="badge en_attente">En cours</span>
              ) : (
                <span className="badge brouillon">À remplir</span>
              ))}
            {faiOn && (
              <button
                type="button"
                className={`small${canFill && !faiDone ? ' primary' : ''}`}
                onClick={() => {
                  setFaiOpen(true);
                  faiRef.current?.showModal();
                }}
              >
                {canFill && !faiDone ? <><PenLine size={14} aria-hidden /> Remplir</> : 'Ouvrir'}
              </button>
            )}
          </div>
        </div>
      )}
      {arSession && (
        <div className="doc-list" style={{ marginBottom: 6 }}>
          <div className="doc-item">
            <Award size={16} aria-hidden />
            <span className="doc-item-main">
              <strong>Attestations de réussite · {arLabels}</strong>
              <small className="hint">
                {arSession.series.length > 1 ? 'Une attestation par stagiaire et par module' : 'Une attestation par stagiaire'}, remplie et signée par le formateur · {arCount}/{arTotal} avis donnés
                {arData?.signature ? ' · signées' : ''}
                {titleMissing.length > 0 && <><br /><span className="fin-warn-inline">Titre d’habilitation manquant : {titleMissing.length} attestation{titleMissing.length > 1 ? 's' : ''} bloquée{titleMissing.length > 1 ? 's' : ''}</span></>}
              </small>
            </span>
            {arDone ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
            ) : arCount || arData?.signature ? (
              <span className="badge en_attente">En cours</span>
            ) : (
              <span className="badge brouillon">À remplir</span>
            )}
            <button
              type="button"
              className={`small${canFill && !arDone ? ' primary' : ''}`}
              onClick={() => {
                setArOpen(true);
                arRef.current?.showModal();
              }}
            >
              {canFill && !arDone ? <><PenLine size={14} aria-hidden /> Remplir</> : 'Ouvrir'}
            </button>
          </div>
        </div>
      )}
      {faiOn && fin && (
        <div className="fin-docs">
          <div className="fin-docs-head">
            <span className="doc-item-main">
              <strong><Award size={15} aria-hidden style={{ verticalAlign: '-2px' }} /> Documents de fin de formation (bureau administratif)</strong>
              <small className="hint">
                Attestation de fin de formation et appréciation des compétences, générées automatiquement dès que le formateur a donné
                son avis sur la fiche d’appréciation du stagiaire.
              </small>
            </span>
            <span className={`badge ${finReady.length === trainees.length && trainees.length ? 'validee' : 'en_attente'}`}>
              {finReady.length}/{trainees.length} prêts
            </span>
          </div>
          {!fin.objectifs && (
            <p className="hint fin-warn">Objectifs de la formation non renseignés : ajoute-les dans Formations disponibles › Modifier.</p>
          )}
          {trainees.some((t) => t.cursus === 'recyclage') && !fin.objectifsRecyclage && (
            <p className="hint fin-warn">
              Stagiaires en recyclage : les objectifs du recyclage ne sont pas renseignés, ceux de l’initiale sont repris. Ajoute-les dans Formations › Modifier › « Objectifs de fin de formation · RECYCLAGE ».
            </p>
          )}
          {!fin.cachet && <p className="hint fin-warn">Cachet et signature non ajoutés : Administration › Paramètres.</p>}
          {titleMissing.length > 0 && (
            <p className="hint fin-warn">
              Titre d’habilitation manquant pour {titleMissing.map((t) => t.name).join(', ')} : leur attestation n’est pas générée tant que le titre n’est pas fourni (tour de table).
            </p>
          )}
          <div className="row-actions" style={{ flexWrap: 'wrap', margin: '8px 0' }}>
            <button className="small primary" disabled={!attReady.length || !!busy} onClick={() => downloadFin('attestation')}>
              {busy === 'attestation-all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les attestations
            </button>
            <button className="small primary" disabled={!finReady.length || !!busy} onClick={() => downloadFin('competences')}>
              {busy === 'competences-all' ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Toutes les appréciations des compétences
            </button>
          </div>
          <details>
            <summary>Par stagiaire</summary>
            <div className="fin-list">
              {trainees.map((t) => {
                const e = faiData?.trainees?.[t.id];
                return (
                  <div key={t.id} className="fin-row">
                    <span>
                      <strong>{t.name}</strong>
                      <small className="hint">
                        {e?.avis === 'favorable' ? (e.recommandations ? 'Avis favorable avec recommandations' : 'Avis favorable') : e?.avis === 'defavorable' ? 'Avis défavorable' : 'En attente de la fiche d’appréciation'}
                      </small>
                    </span>
                    <span className="row-actions">
                      <button className="small" disabled={!e?.avis || !hasTitle(t.id) || !!busy} onClick={() => downloadFin('attestation', t.id)} title={hasTitle(t.id) ? undefined : 'Titre d’habilitation manquant'}>
                        <Download size={13} aria-hidden /> {hasTitle(t.id) ? 'Attestation' : 'Attestation (titre manquant)'}
                      </button>
                      <button className="small" disabled={!e?.avis || !!busy} onClick={() => downloadFin('competences', t.id)}>
                        <Download size={13} aria-hidden /> Appréciation des compétences
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}
      {documents.length === 0 ? (
        !tdt && !faiOn && !arOn && <p className="hint">
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
                    <>
                      <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
                      <button type="button" className="small primary" onClick={() => downloadDoc(d)} disabled={busy === d.id}>
                        {busy === d.id ? <Loader2 size={14} className="spin" aria-hidden /> : <Download size={14} aria-hidden />} Télécharger
                      </button>
                    </>
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

      {/* Fiches d'appréciation individuelle */}
      <dialog ref={faiRef} className="modal modal-full" aria-label="Fiches d’appréciation individuelle" onClose={() => { setFaiOpen(false); router.refresh(); }}>
        {faiOpen && faiSession && (
          <AppreciationEditor
            session={faiSession}
            initialData={faiData}
            canEdit={canFill}
            onClose={() => faiRef.current?.close()}
            onSaved={(data) => setFaiData(data)}
          />
        )}
      </dialog>

      {/* Attestations de réussite */}
      <dialog ref={arRef} className="modal modal-full" aria-label="Attestations de réussite" onClose={() => { setArOpen(false); router.refresh(); }}>
        {arOpen && arSession && (
          <ReussiteEditor
            session={arSession}
            initialData={arData}
            canEdit={canFill}
            blocked={titleMissing.map((t) => t.id)}
            onClose={() => arRef.current?.close()}
            onSaved={(data) => setArData(data)}
          />
        )}
      </dialog>

      {/* Tour de table intégré */}
      <dialog ref={tdtRef} className="modal modal-full" aria-label="Tour de table" onClose={() => { setTdtOpen(false); router.refresh(); }}>
        {tdtOpen && tdt && (
          <TourDeTable
            session={{ sessionId, title, period, room, trainerName, trainees, place, legal, lastDay }}
            initialData={tdt.data}
            initialCompleted={tdt.completed}
            completedAt={tdt.completedAt}
            canEdit={canFill}
            canExempt={canManage}
            titleFiles={titleFiles === null ? undefined : titles}
            onTitleFiles={setTitles}
            onClose={() => tdtRef.current?.close()}
            onSaved={(data, completed) =>
              setTdt((x) => (x ? { ...x, data, completed, completedAt: completed ? x.completedAt || new Date().toLocaleDateString('fr-FR') : null } : x))
            }
          />
        )}
      </dialog>

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
                <button className="small" onClick={async () => (await askConfirm('Créer un nouveau QR code ? L’ancien ne fonctionnera plus.')) && showQr(true)}>
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
            {cellTrainee
              ? cellTrainee.name
              : `Formateur : ${(cell && dayTrainerNames[cell.slot.day]) || trainerName || ''}`}
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
