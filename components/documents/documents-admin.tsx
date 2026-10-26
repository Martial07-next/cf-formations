'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, X, FileText, Pencil, Trash2, Upload, Lock } from 'lucide-react';
import { createDocument, updateDocument, replaceDocumentFile, deleteDocument, documentFileUrl } from '@/app/administration/documents/actions';
import { AUDIENCE_LABEL, SCOPE_LABEL, docStoragePath, type Audience, type SignableDoc } from '@/lib/documents';
import { askConfirm } from '@/lib/confirm-dialog';

type Result = { ok: true } | { ok: false; error: string };

/** Modèles des documents intégrés (non remplaçables : les champs y sont placés au millimètre). */
const BUILTIN_TEMPLATE: Record<string, string> = {
  image: '/templates/autorisation-image.pdf',
  image_salarie: '/templates/autorisation-image.pdf',
  livret: '/templates/remise-livrets.pdf',
  vetements: '/templates/vetements-tst.pdf',
  materiel: '/templates/remise-materiel.pdf',
};

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="modal-body" style={{ paddingBottom: 18 }}>{open && children}</div>
    </dialog>
  );
}

async function upload(path: string, file: File) {
  if (file.type !== 'application/pdf') throw new Error('Le fichier doit être un PDF.');
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF trop lourd (20 Mo maximum).');
  const supabase = createClient();
  const { error } = await supabase.storage.from('dossiers').upload(path, file, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Envoi du PDF impossible : ${error.message}`);
}

export function DocumentsAdmin({ docs, counts }: { docs: SignableDoc[]; counts: Record<string, number> }) {
  const [editing, setEditing] = useState<SignableDoc | 'new' | null>(null);
  const [newAudience, setNewAudience] = useState<Audience>('stagiaire');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error);
        else {
          setError(null);
          after?.();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur');
      }
    });

  const open = async (d: SignableDoc) => {
    if (d.builtin) return window.open(BUILTIN_TEMPLATE[d.builtin], '_blank');
    const r = await documentFileUrl(d.id);
    if (r.ok) window.open(r.url, '_blank');
    else setError(r.error);
  };

  return (
    <>
      {error && !editing && <div role="alert" className="alert alert-error">{error}</div>}
      {(['stagiaire', 'salarie'] as Audience[]).map((aud) => (
        <section key={aud} className="panel">
          <div className="panel-head">
            <h2>Documents à signer · {AUDIENCE_LABEL[aud]}</h2>
            <button type="button" className="small primary" onClick={() => { setError(null); setNewAudience(aud); setEditing('new'); }}>
              <Plus size={14} aria-hidden /> Ajouter un document
            </button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Document</th><th>Type</th><th>Signature</th><th>Signés</th><th>État</th><th></th></tr></thead>
              <tbody>
                {docs.filter((d) => d.audience === aud).map((d) => (
                  <tr key={d.id} className={d.active ? '' : 'muted-row'}>
                    <td>
                      <strong>{d.title}</strong>
                      {d.description && <div className="hint">{d.description}</div>}
                    </td>
                    <td>{d.builtin ? <span className="badge brouillon"><Lock size={11} aria-hidden /> Intégré</span> : <span className="badge bureau">Ajouté · v{d.version}</span>}</td>
                    <td className="hint">{d.builtin === 'vetements' ? 'Au prêt et au retour' : d.builtin === 'materiel' ? 'À la remise' : d.builtin ? 'Une seule fois' : SCOPE_LABEL[d.scope]}</td>
                    <td>{counts[d.id] ?? '—'}</td>
                    <td>
                      {d.active ? <span className="badge validee">Actif</span> : <span className="badge brouillon">Inactif</span>}
                      {!d.builtin && !d.storage_path && <div className="hint">PDF à déposer</div>}
                    </td>
                    <td className="row-actions">
                      {(d.builtin || d.storage_path) && <button type="button" className="small" onClick={() => open(d)}><FileText size={14} aria-hidden /> Voir</button>}
                      <button type="button" className="small" onClick={() => { setError(null); setEditing(d); }}><Pencil size={14} aria-hidden /> Modifier</button>
                      {!d.builtin && (
                        <button
                          type="button"
                          className="small icon ghost"
                          aria-label={`Supprimer ${d.title}`}
                          disabled={isPending}
                          onClick={async () => (await askConfirm(`Supprimer « ${d.title} » et toutes ses signatures ? Action définitive.`)) && run(() => deleteDocument(d.id))}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouveau document à signer' : editing ? editing.title : ''}>
        {editing && (
          <DocForm
            doc={editing === 'new' ? null : editing}
            audience={editing === 'new' ? newAudience : editing.audience}
            error={error}
            isPending={isPending}
            onSubmit={(input, file, resign) =>
              run(async () => {
                if (editing === 'new') {
                  if (!file) return { ok: false, error: 'Choisis le PDF du document.' };
                  const id = crypto.randomUUID();
                  const path = docStoragePath(id, 1);
                  await upload(path, file);
                  return createDocument(id, input, path);
                }
                if (file && !editing.builtin) {
                  const version = resign || !editing.storage_path ? editing.version + (editing.storage_path ? 1 : 0) : editing.version;
                  const path = docStoragePath(editing.id, version);
                  await upload(path, file);
                  const r = await replaceDocumentFile(editing.id, path, resign && !!editing.storage_path);
                  if (!r.ok) return r;
                }
                return updateDocument(editing.id, input);
              }, () => setEditing(null))
            }
          />
        )}
      </Modal>
    </>
  );
}

function DocForm({
  doc,
  audience,
  error,
  isPending,
  onSubmit,
}: {
  doc: SignableDoc | null;
  audience: Audience;
  error: string | null;
  isPending: boolean;
  onSubmit: (input: { title: string; description: string; audience: Audience; scope: 'once' | 'session'; active: boolean }, file: File | null, resign: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [resign, setResign] = useState(true);
  const builtin = !!doc?.builtin;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit(
          {
            title: String(fd.get('title') || ''),
            description: String(fd.get('description') || ''),
            audience: (String(fd.get('audience') || audience) as Audience),
            scope: fd.get('scope') === 'session' ? 'session' : 'once',
            active: fd.get('active') === 'on',
          },
          file,
          resign
        );
      }}
    >
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {builtin && <p className="hint" style={{ marginTop: 0 }}><Lock size={12} aria-hidden /> Document intégré : son modèle est fixe (les champs y sont placés au bon endroit). Tu peux le renommer, le décrire ou le désactiver.</p>}
      <div className="form-row">
        <label style={{ gridColumn: '1 / -1' }}>Titre *<input name="title" required defaultValue={doc?.title || ''} placeholder="Ex. Règlement intérieur" /></label>
      </div>
      <div className="form-row">
        <label style={{ gridColumn: '1 / -1' }}>Description (affichée avant la signature)<textarea name="description" rows={2} defaultValue={doc?.description || ''} /></label>
      </div>
      {!builtin && (
        <div className="form-row">
          <label>
            Signé par
            <select name="audience" defaultValue={doc?.audience || audience}>
              <option value="stagiaire">Les stagiaires</option>
              <option value="salarie">Les salariés</option>
            </select>
          </label>
          <label>
            Fréquence (stagiaires)
            <select name="scope" defaultValue={doc?.scope || 'once'}>
              <option value="once">Une seule fois (repris sur les formations suivantes)</option>
              <option value="session">À chaque formation</option>
            </select>
          </label>
        </div>
      )}
      {!builtin && (
        <div className="field" style={{ marginBottom: 12 }}>
          {doc?.storage_path ? 'Remplacer le PDF (facultatif)' : 'PDF du document *'}
          <label className="btn small" style={{ alignSelf: 'flex-start' }}>
            <Upload size={14} aria-hidden /> {file ? file.name : 'Choisir le PDF'}
            <input type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {file && doc?.storage_path && (
            <label className="check-line">
              <input type="checkbox" checked={resign} onChange={(e) => setResign(e.target.checked)} /> Nouvelle version : tout le monde doit signer à nouveau
            </label>
          )}
        </div>
      )}
      <label className="check-line" style={{ marginBottom: 12 }}>
        <input type="checkbox" name="active" defaultChecked={doc ? doc.active : true} /> Actif (demandé à la signature)
      </label>
      <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button></div>
    </form>
  );
}
