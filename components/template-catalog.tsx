'use client';

import { useMemo, useState, useTransition } from 'react';
import { ChevronRight, Folder, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { createTemplate, updateTemplate, deleteTemplate } from '@/app/modeles/actions';
import { groupByFolder } from '@/components/session-form';
import { formatHours } from '@/lib/week';
import { splitHours } from '@/lib/schedule';

type Template = {
  id: string;
  title: string;
  category: string | null;
  duration_hours: number;
  max_trainees: number | null;
  description: string | null;
  sessions_count: number;
  modules: { name: string; duration_hours: number }[];
  trainer_ids: string[];
};
type TrainerOption = { id: string; full_name: string; color: string | null };

type ModuleRow = { name: string; h: string; m: string };

function TemplateFields({
  t,
  folders,
  folder,
  trainers,
}: {
  t?: Template;
  folders: string[];
  folder?: string;
  trainers: TrainerOption[];
}) {
  const [modules, setModules] = useState<ModuleRow[]>(
    (t?.modules || []).map((m) => ({ name: m.name, h: String(splitHours(m.duration_hours).h), m: String(splitHours(m.duration_hours).m) }))
  );
  const moduleMinutes = modules.reduce((n, m) => n + (Number(m.h) || 0) * 60 + (Number(m.m) || 0), 0);
  const hasModules = modules.some((m) => m.name.trim());
  const total = hasModules ? moduleMinutes : null;
  const modulesJson = JSON.stringify(
    modules
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), duration_hours: ((Number(m.h) || 0) * 60 + (Number(m.m) || 0)) / 60 }))
  );
  const update = (i: number, patch: Partial<ModuleRow>) => setModules((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));

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

      <div className="field" style={{ marginBottom: 14 }}>
        Modules (facultatif), ex. MA1, MA2, MA3 : un stagiaire peut ne suivre qu’une partie des modules
        <input type="hidden" name="modules_json" value={modulesJson} />
        <div className="module-rows">
          {modules.map((m, i) => (
            <div className="module-row" key={i}>
              <span className="module-num">{i + 1}</span>
              <input aria-label={`Nom du module ${i + 1}`} placeholder="Ex. MA1" value={m.name} onChange={(e) => update(i, { name: e.target.value })} />
              <span className="duration-input">
                <input type="number" min={0} aria-label="Heures" value={m.h} onChange={(e) => update(i, { h: e.target.value })} />
                <span>h</span>
                <select aria-label="Minutes" value={m.m} onChange={(e) => update(i, { m: e.target.value })}>
                  {['0', '15', '30', '45'].map((x) => <option key={x} value={x}>{x.padStart(2, '0')}</option>)}
                </select>
              </span>
              <button type="button" className="small icon ghost" aria-label={`Retirer le module ${i + 1}`} onClick={() => setModules((l) => l.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="small" onClick={() => setModules((l) => [...l, { name: `MA${l.length + 1}`, h: '7', m: '0' }])}>
            <Plus size={14} aria-hidden /> Ajouter un module
          </button>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          Durée totale {total != null && <span className="hint">(somme des modules)</span>}
          {total != null ? (
            <>
              <input type="hidden" name="duration_h" value={Math.floor(total / 60)} />
              <input type="hidden" name="duration_min" value={total % 60} />
              <strong style={{ padding: '9px 0' }}>{formatHours(total / 60)}</strong>
            </>
          ) : (
            <span className="duration-input">
              <input name="duration_h" type="number" min={0} inputMode="numeric" required aria-label="Heures" defaultValue={t ? splitHours(Number(t.duration_hours)).h : ''} />
              <span>h</span>
              <select name="duration_min" aria-label="Minutes" defaultValue={t ? String(splitHours(Number(t.duration_hours)).m) : '0'}>
                {['0', '15', '30', '45'].map((m) => (
                  <option key={m} value={m}>{m.padStart(2, '0')}</option>
                ))}
              </select>
              <span>min</span>
            </span>
          )}
        </div>
        <label>
          Max. stagiaires
          <input name="max_trainees" type="number" min="0" defaultValue={t?.max_trainees ?? ''} />
        </label>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        Formateurs habilités à animer cette formation
        <span className="hint">Seuls ceux-là seront proposés à la création d’une session. Aucun coché = tous les formateurs.</span>
        <div className="check-grid">
          {trainers.map((tr) => (
            <label key={tr.id} className="check-chip">
              <input type="checkbox" name="trainer_ids" value={tr.id} defaultChecked={t?.trainer_ids.includes(tr.id)} />
              <span className="swatch" style={{ background: tr.color || '#64748b' }} aria-hidden />
              {tr.full_name}
            </label>
          ))}
          {trainers.length === 0 && <span className="hint">Aucun formateur enregistré.</span>}
        </div>
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

export function TemplateCatalog({ templates, canEdit, trainers }: { templates: Template[]; canEdit: boolean; trainers: TrainerOption[] }) {
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
            <TemplateFields folders={folderNames} trainers={trainers} />
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
                    <TemplateFields folders={folderNames} trainers={trainers} folder={folder === 'Sans dossier' ? '' : folder} />
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
                              <TemplateFields t={t} folders={folderNames} trainers={trainers} />
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
                            {t.modules.length > 0 && (
                              <div className="module-tags">
                                {t.modules.map((m) => (
                                  <span key={m.name} className="badge brouillon">{m.name} · {formatHours(m.duration_hours)}</span>
                                ))}
                              </div>
                            )}
                            {t.trainer_ids.length > 0 && (
                              <div className="hint">
                                Habilités : {trainers.filter((tr) => t.trainer_ids.includes(tr.id)).map((tr) => tr.full_name).join(', ')}
                              </div>
                            )}
                            {t.description && <div className="hint">{t.description}</div>}
                          </td>
                          <td className="num">{formatHours(Number(t.duration_hours))}</td>
                          <td className="num">{t.max_trainees ?? '-'}</td>
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
