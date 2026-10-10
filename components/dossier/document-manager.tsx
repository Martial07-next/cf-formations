'use client';

import { useRef, useState, useTransition } from 'react';
import { FileText, FolderOpen, Trash2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { registerDocument, updateDocument, deleteDocument } from '@/app/dossier/actions';
import type { DossierDocument } from '@/lib/dossier';

export const FILLED_BY_LABEL: Record<string, string> = {
  formateur: 'Rempli par le formateur',
  bureau: 'Rempli par le bureau',
  aucun: 'À consulter (rien à remplir)',
};

const slug = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';

/** Dépôt d'un PDF dans le dossier d'une formation (toutes ses sessions) ou d'une seule session. */
export function DocumentUploader({ templateId, sessionId, onDone }: { templateId?: string; sessionId?: string; onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function submit(fd: FormData) {
    setError(null);
    if (!file) return setError('Choisis un fichier PDF.');
    if (file.type && file.type !== 'application/pdf') return setError('Seuls les fichiers PDF sont acceptés.');
    if (file.size > 25 * 1024 * 1024) return setError('Fichier trop lourd (25 Mo maximum).');
    setBusy(true);
    try {
      const owner = templateId ? `templates/${templateId}` : `sessions/${sessionId}`;
      const path = `${owner}/${Date.now()}-${slug(file.name.replace(/\.pdf$/i, ''))}.pdf`;
      const supabase = createClient();
      const up = await supabase.storage.from('dossiers').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (up.error) {
        setError(/bucket/i.test(up.error.message) ? 'Exécute d’abord la migration 16 dans Supabase.' : up.error.message);
        return;
      }
      const res = await registerDocument({
        template_id: templateId || null,
        session_id: sessionId || null,
        title: String(fd.get('title') || ''),
        storage_path: path,
        file_name: file.name,
        filled_by: String(fd.get('filled_by') || 'formateur'),
        required: fd.get('required') === 'on',
      });
      if (!res.ok) return setError(res.error);
      setFile(null);
      setTitle('');
      if (input.current) input.current.value = '';
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="doc-upload">
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="form-row">
        <label>
          Fichier PDF
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
            }}
          />
        </label>
        <label>
          Nom du document
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Tour de table" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Qui le remplit ?
          <select name="filled_by" defaultValue="formateur">
            <option value="formateur">Le formateur, pendant la session</option>
            <option value="bureau">Le bureau administratif</option>
            <option value="aucun">Personne : document à consulter</option>
          </select>
        </label>
        <label className="check-line">
          <input type="checkbox" name="required" defaultChecked />
          Obligatoire pour que le dossier soit complet
        </label>
      </div>
      <button type="submit" className="primary small" disabled={busy}>
        <Upload size={14} aria-hidden /> {busy ? 'Envoi…' : 'Ajouter au dossier'}
      </button>
    </form>
  );
}

/** Liste modifiable des documents (bureau). */
export function DocumentList({ documents, emptyLabel }: { documents: DossierDocument[]; emptyLabel: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error || 'Erreur.');
    });

  if (!documents.length) return <p className="hint">{emptyLabel}</p>;
  return (
    <div className="doc-list">
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {documents.map((d) => (
        <div key={d.id} className="doc-item">
          <FileText size={16} aria-hidden />
          <span className="doc-item-main">
            <strong>{d.title}</strong>
            <small className="hint">{d.file_name}</small>
          </span>
          <select
            aria-label={`Qui remplit ${d.title}`}
            className="input"
            value={d.filled_by}
            disabled={isPending}
            onChange={(e) => run(() => updateDocument(d.id, { filled_by: e.target.value }))}
          >
            {Object.entries(FILLED_BY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="check-line" title="Obligatoire pour que le dossier soit complet">
            <input
              type="checkbox"
              checked={d.required}
              disabled={isPending || d.filled_by === 'aucun'}
              onChange={(e) => run(() => updateDocument(d.id, { required: e.target.checked }))}
            />
            Obligatoire
          </label>
          <button
            type="button"
            className="small icon ghost danger"
            aria-label={`Supprimer ${d.title}`}
            disabled={isPending}
            onClick={() => confirm(`Supprimer « ${d.title} » du dossier ? Les saisies déjà faites sur ce document seront perdues.`) && run(() => deleteDocument(d.id))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Bouton « Dossier » d'une formation du catalogue : documents remis à chaque session. */
export function TemplateDossierButton({ templateId, title, documents }: { templateId: string; title: string; documents: DossierDocument[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="small" onClick={() => ref.current?.showModal()} title="Documents du dossier de formation">
        <FolderOpen size={14} aria-hidden /> Dossier{documents.length ? ` (${documents.length})` : ''}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={`dossier-${templateId}`}>
        <div className="modal-head">
          <h2 id={`dossier-${templateId}`}><FolderOpen size={18} aria-hidden /> Dossier : {title}</h2>
          <button className="icon ghost" onClick={() => ref.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 18 }}>
          <p className="panel-intro">
            Ces documents (tour de table, évaluations, autorisations…) sont ajoutés automatiquement au dossier de
            <strong> chaque session</strong> de cette formation. Le formateur les remplit directement en ligne depuis la fiche
            de session. La feuille d’émargement, elle, est générée automatiquement : inutile de la déposer.
          </p>
          <DocumentList documents={documents} emptyLabel="Aucun document pour l’instant." />
          <h3 className="sub-heading">Ajouter un document</h3>
          <DocumentUploader templateId={templateId} />
        </div>
      </dialog>
    </>
  );
}
