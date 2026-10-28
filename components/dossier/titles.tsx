'use client';

import { useRef, useState } from 'react';
import QRCode from 'qrcode';
import { FileCheck2, Loader2, QrCode, RefreshCcw, ScanLine, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { askConfirm } from '@/lib/confirm-dialog';
import { confirmTitleUpload, deleteTitle, ensureTitleToken, prepareTitleUpload, titleDownloadUrl } from '@/app/dossier/titres-actions';
import { TITLE_ACCEPT, TITLE_MAX_BYTES, TITLE_SOURCE_LABEL, fileSize, type TitleFile } from '@/lib/titres';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Envoi d'un titre : URL signée délivrée par le serveur (droits vérifiés),
 * puis envoi direct du navigateur vers le stockage privé, puis enregistrement.
 */
export async function sendTitle<T>(
  file: File,
  prepare: (name: string, mime: string, size: number) => Promise<Res<{ path: string; token: string }>>,
  confirm: (path: string, name: string) => Promise<Res<T>>
): Promise<Res<T>> {
  const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  if (file.size > TITLE_MAX_BYTES) return { ok: false, error: 'Fichier trop lourd (10 Mo maximum).' };
  const prep = await prepare(file.name, mime, file.size);
  if (!prep.ok) return prep;
  const { error } = await createClient().storage.from('titres').uploadToSignedUrl(prep.path, prep.token, file, { contentType: mime });
  if (error) return { ok: false, error: 'Envoi interrompu, réessaie.' };
  return confirm(prep.path, file.name);
}

async function openTitle(f: TitleFile, traineeName: string, index: number) {
  const ext = f.file_name.split('.').pop() || 'pdf';
  const res = await titleDownloadUrl(f.id, `Titre d'habilitation - ${traineeName}${index ? ` (${index + 1})` : ''}.${ext}`);
  if (!res.ok) return res.error;
  const a = document.createElement('a');
  a.href = res.url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return null;
}

/** Fichiers d'un stagiaire : téléchargement, suppression, ajout d'un scan. */
export function TitleFiles({
  sessionId,
  traineeId,
  traineeName,
  files,
  canUpload,
  onFiles,
  compact = false,
}: {
  sessionId: string;
  traineeId: string;
  traineeName: string;
  files: TitleFile[];
  canUpload: boolean;
  onFiles: (files: TitleFile[]) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = files.filter((f) => f.trainee_id === traineeId);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(list)) {
      const res = await sendTitle(
        file,
        (n, m, s) => prepareTitleUpload(sessionId, traineeId, n, m, s),
        (p, n) => confirmTitleUpload(sessionId, traineeId, p, n)
      );
      if (!res.ok) {
        setError(res.error);
        break;
      }
      onFiles(res.files);
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className={`title-files${compact ? ' compact' : ''}`}>
      {mine.map((f, i) => (
        <span key={f.id} className="title-file">
          <button type="button" className="link" onClick={async () => setError(await openTitle(f, traineeName, i))} title={`${f.file_name} · ${fileSize(f.size)} · ${TITLE_SOURCE_LABEL[f.source]}`}>
            <FileCheck2 size={13} aria-hidden /> {compact ? `Fichier ${i + 1}` : f.file_name}
          </button>
          {!compact && <small className="hint">{TITLE_SOURCE_LABEL[f.source]}</small>}
          {canUpload && (
            <button
              type="button"
              className="icon ghost small"
              aria-label={`Supprimer ${f.file_name}`}
              onClick={async () => {
                if (!(await askConfirm(`Supprimer ce fichier du titre d’habilitation de ${traineeName} ?`, { confirmLabel: 'Supprimer' }))) return;
                const res = await deleteTitle(f.id);
                if (!res.ok) setError(res.error);
                else onFiles(res.files);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
      ))}
      {canUpload && (
        <>
          <input ref={input} type="file" accept={TITLE_ACCEPT} multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="button" className="small title-add" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" aria-hidden /> : <ScanLine size={13} aria-hidden />} {compact ? 'Scan' : 'Ajouter le scan'}
          </button>
        </>
      )}
      {error && <small className="title-error" role="alert">{error}</small>}
    </div>
  );
}

/** QR code de dépôt du titre par les stagiaires (sans compte). */
export function TitleQrButton({ sessionId, title, className = 'small' }: { sessionId: string; title: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show(renew = false) {
    setBusy(true);
    setError(null);
    const res = await ensureTitleToken(sessionId, renew);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const url = `${window.location.origin}/titre/${res.token}`;
    setQr({ url, image: await QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M' }) });
    if (!ref.current?.open) ref.current?.showModal();
  }

  return (
    <>
      <button type="button" className={className} onClick={() => show()} disabled={busy}>
        {busy ? <Loader2 size={14} className="spin" aria-hidden /> : <QrCode size={14} aria-hidden />} QR code dépôt du titre
      </button>
      {error && <small className="title-error" role="alert">{error}</small>}
      <dialog ref={ref} className="modal qr-modal" aria-label="QR code de dépôt du titre d’habilitation">
        <div className="modal-head">
          <h2><QrCode size={18} aria-hidden /> Titre d’habilitation : {title}</h2>
          <button type="button" className="icon ghost" onClick={() => ref.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        {qr && (
          <div className="modal-body qr-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="QR code de dépôt du titre d’habilitation" className="qr-image" />
            <div className="qr-side">
              <p className="qr-slot">Déposer son titre d’habilitation</p>
              <p className="hint" style={{ margin: 0 }}>Les stagiaires scannent ce QR code, choisissent leur nom et prennent leur titre en photo (ou déposent un PDF). Le titre apparaît aussitôt dans le tour de table.</p>
              <p className="hint" style={{ margin: 0, wordBreak: 'break-all' }}>{qr.url}</p>
              <div className="row-actions">
                <button type="button" className="small" onClick={() => navigator.clipboard?.writeText(qr.url)}>Copier le lien</button>
                <button type="button" className="small" onClick={() => show(true)} disabled={busy}><RefreshCcw size={13} aria-hidden /> Nouveau QR code</button>
              </div>
              <p className="hint" style={{ margin: 0 }}>Valable jusqu’à 30 jours après la fin de la formation. « Nouveau QR code » désactive l’ancien.</p>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Télécharge tous les titres de la session, un fichier après l'autre. */
export async function downloadAllTitles(files: TitleFile[], names: Record<string, string>): Promise<string | null> {
  const by: Record<string, number> = {};
  for (const f of files) {
    const i = (by[f.trainee_id] = (by[f.trainee_id] ?? -1) + 1);
    const err = await openTitle(f, names[f.trainee_id] || 'Stagiaire', i);
    if (err) return err;
    await new Promise((r) => setTimeout(r, 450));
  }
  return null;
}

