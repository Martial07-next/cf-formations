'use client';

import { useMemo, useState, useTransition } from 'react';
import { ChevronRight, Folder, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { createTemplate, updateTemplate, deleteTemplate } from '@/app/modeles/actions';
import { groupByFolder } from '@/components/session-form';
import { formatHours } from '@/lib/week';

type Template = {
  id: string;
  title: string;
  category: string | null;
  duration_hours: number;
  max_trainees: number | null;
  description: string | null;
  sessions_count: number;
};

function TemplateFields({ t, folders, folder }: { t?: Template; folders: string[]; folder?: string }) {
  return (
    <>
      <div className="form-row">
        <label>
          Dossier
          <input name="category" list="template-folders" defaultValue={t?.category ?? folder ?? ''} placeholder="Ex. Sécurité, Électricité…" />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          Nom de la formation
          <input name="title" required defaultValue={t?.title || ''} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Nombre d’heures
          <input name="duration_hours" type="number" step="0.5" min="0.5" required defaultValue={t?.duration_hours ?? ''} />
        </label>
        <label>
          Max. stagiaires
          <input name="max_trainees" type="number" min="0" defaultValue={t?.max_trainees ?? ''} />
        </label>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
        <label>
          Description / objectifs
          <textarea name="description" rows={2} defaultValue={t?.description || ''} />
        </label>
      </div>
      <datalist id="template-folders">
        {folders.map((f) => <option key={f} value={f} />)}
      </datalist>
    </>
  );
}

export function TemplateCatalog({ templates, canEdit }: { templates: Template[]; canEdit: boolean }) {
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFolder, setAddFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.title} ${t.category ?? ''}`.toLowerCase().includes(q));
  }, [templates, query]);
  const folders = useMemo(() => groupByFolder(filtered), [filtered]);
  const folderNames = useMemo(
    () => [...new Set(templates.map((t) => t.category?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr')),
    [templates]
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Une erreur est survenue.');
      else after?.();
    });
  }

  return (
    <>
      <div className="panel-head">
        <label className="search">
          <Search size={15} aria-hidden />
          <span className="sr-only">Rechercher une formation</span>
          <input placeholder="Rechercher une formation…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {canEdit && (
          <button className={addOpen ? '' : 'primary'} onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
            <Plus size={16} aria-hidden /> {addOpen ? 'Fermer' : 'Nouveau dossier / formation'}
          </button>
        )}
      </div>

      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {canEdit && addOpen && (
        <div className="panel">
          <h2>Nouvelle formation</h2>
          <p className="panel-intro">Pour créer un nouveau dossier, tape simplement son nom dans « Dossier ».</p>
          <form action={(fd) => run(() => createTemplate(fd), () => setAddOpen(false))}>
            <TemplateFields folders={folderNames} />
            <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
          </form>
        </div>
      )}

      {folders.length === 0 ? (
        <p className="empty">{templates.length === 0 ? 'Aucune formation enregistrée.' : 'Aucun résultat.'}</p>
      ) : (
        folders.map(([folder, items]) => {
          const total = items.reduce((n, t) => n + Number(t.duration_hours), 0);
          return (
            <details className="folder" key={folder} open>
              <summary>
                <ChevronRight size={16} className="chev" aria-hidden />
                <Folder size={17} aria-hidden />
                {folder}
                <small>{items.length} formation{items.length > 1 ? 's' : ''} · {formatHours(total)}</small>
                {canEdit && (
                  <button
                    type="button"
                    className="small icon primary"
                    aria-label={`Ajouter une formation dans ${folder}`}
                    title="Ajouter une formation dans ce dossier"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setError(null);
                      setAddFolder(addFolder === folder ? null : folder);
                      (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.setAttribute('open', '');
                    }}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </summary>
              {canEdit && addFolder === folder && (
                <div style={{ padding: '16px 18px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
                  <form action={(fd) => run(() => createTemplate(fd), () => setAddFolder(null))}>
                    <TemplateFields folders={folderNames} folder={folder === 'Sans dossier' ? '' : folder} />
                    <div className="row-actions">
                      <button type="submit" className="primary" disabled={isPending}>
                        {isPending ? 'Enregistrement…' : `Ajouter dans « ${folder} »`}
                      </button>
                      <button type="button" onClick={() => setAddFolder(null)}>Annuler</button>
                    </div>
                  </form>
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Formation</th>
                      <th className="num">Heures</th>
                      <th className="num">Places</th>
                      <th className="num">Sessions</th>
                      {canEdit && <th><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) =>
                      editingId === t.id ? (
                        <tr key={t.id}>
                          <td colSpan={canEdit ? 5 : 4} style={{ background: 'var(--surface-2)', padding: 16 }}>
                            <form action={(fd) => run(() => updateTemplate(t.id, fd), () => setEditingId(null))}>
                              <TemplateFields t={t} folders={folderNames} />
                              <div className="row-actions">
                                <button type="submit" className="primary" disabled={isPending}>Enregistrer</button>
                                <button type="button" onClick={() => setEditingId(null)}>Annuler</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      ) : (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.title}</strong>
                            {t.description && <div className="hint">{t.description}</div>}
                          </td>
                          <td className="num">{formatHours(Number(t.duration_hours))}</td>
                          <td className="num">{t.max_trainees ?? '—'}</td>
                          <td className="num">{t.sessions_count}</td>
                          {canEdit && (
                            <td className="row-actions">
                              <button className="small" onClick={() => setEditingId(t.id)} disabled={isPending}>
                                <Pencil size={14} aria-hidden /> Modifier
                              </button>
                              <button
                                className="danger small icon"
                                aria-label={`Supprimer ${t.title}`}
                                title="Supprimer"
                                disabled={isPending}
                                onClick={() => {
                                  if (confirm(`Supprimer la formation « ${t.title} » du catalogue ?`)) run(() => deleteTemplate(t.id));
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })
      )}
    </>
  );
}
