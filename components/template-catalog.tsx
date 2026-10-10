'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Folder, FolderPlus, Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  moveTemplate,
} from '@/app/modeles/actions';
import { formatHours } from '@/lib/week';
import { splitHours } from '@/lib/schedule';
import type { DossierDocument } from '@/lib/dossier';
import { TemplateDossierButton } from '@/components/dossier/document-manager';

type Template = {
  id: string;
  title: string;
  category: string | null;
  duration_hours: number;
  max_trainees: number | null;
  description: string | null;
  sessions_count: number;
  folder_id: string | null;
  position: number;
  modules: { name: string; duration_hours: number }[];
  trainer_ids: string[];
  links: { id: string; label: string; url: string }[];
  documents: DossierDocument[];
};
type TrainerOption = { id: string; full_name: string; color: string | null };
export type FolderRow = { id: string; name: string; parent_id: string | null; position: number };
type FolderOption = { id: string; label: string };

type ModuleRow = { name: string; h: string; m: string };

function TemplateFields({
  t,
  folders,
  folder,
  trainers,
}: {
  t?: Template;
  folders: FolderOption[];
  /** Dossier présélectionné (bouton + d'un dossier). */
  folder?: string | null;
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
  const [links, setLinks] = useState<{ label: string; url: string }[]>((t?.links || []).map((l) => ({ label: l.label, url: l.url })));
  const linksJson = JSON.stringify(links.filter((l) => l.label.trim() || l.url.trim()));
  const updateLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    setLinks((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <>
      <div className="form-row">
        <label>
          Dossier
          <select name="folder_id" defaultValue={t ? t.folder_id ?? '' : folder ?? ''}>
            <option value="">Sans dossier</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
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

      <div className="field" style={{ marginBottom: 14 }}>
        <span className="trainer-tag"><Link2 size={15} aria-hidden /> Supports de cours et documents utiles</span>
        <span className="hint">Nomme chaque lien : les formateurs les retrouvent sur la fiche de session et dans « Liens utiles » du planning.</span>
        <input type="hidden" name="links_json" value={linksJson} />
        <div className="link-editor">
          {links.map((l, i) => (
            <div className="link-editor-row" key={i}>
              <input aria-label={`Nom du lien ${i + 1}`} placeholder="Ex. Support stagiaire (PDF)" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} />
              <input aria-label={`Adresse du lien ${i + 1}`} placeholder="https://…" inputMode="url" value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} />
              <button type="button" className="small icon ghost" aria-label={`Retirer le lien ${i + 1}`} onClick={() => setLinks((list) => list.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="small" style={{ alignSelf: 'flex-start' }} onClick={() => setLinks((list) => [...list, { label: '', url: '' }])}>
            <Plus size={14} aria-hidden /> Ajouter un lien
          </button>
        </div>
      </div>

      <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
        <label>
          Description / objectifs
          <textarea name="description" rows={2} defaultValue={t?.description || ''} />
        </label>
      </div>
    </>
  );
}

export function TemplateCatalog({
  templates,
  folders,
  canEdit,
  trainers,
  initialClosed = [],
  stateCookie,
}: {
  templates: Template[];
  folders: FolderRow[];
  canEdit: boolean;
  trainers: TrainerOption[];
  /** Dossiers fermés lors de la dernière visite de ce collaborateur. */
  initialClosed?: string[];
  /** Nom du cookie qui mémorise les dossiers fermés (propre à chaque compte). */
  stateCookie: string;
}) {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(() => new Set(initialClosed));

  // Ouvrir / fermer un dossier est mémorisé : on retrouve la page telle qu'on l'a laissée.
  function toggleFolder(id: string, open: boolean) {
    setClosed((prev) => {
      if (open === !prev.has(id)) return prev;
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      document.cookie = `${stateCookie}=${encodeURIComponent([...next].join(','))}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }
  // Pendant une recherche, tout est déplié pour voir les résultats.
  const folderProps = (id: string) => ({
    open: query.trim() ? true : !closed.has(id),
    onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (!query.trim()) toggleFolder(id, e.currentTarget.open);
    },
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addIn, setAddIn] = useState<string | null>(null); // id du dossier où l'on ajoute une formation ('' = sans dossier)
  const [newFolder, setNewFolder] = useState<string | null>(null); // '' = dossier principal, sinon id du parent
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const roots = useMemo(() => folders.filter((f) => !f.parent_id).sort(byPos), [folders]);
  const childrenOf = (id: string) => folders.filter((f) => f.parent_id === id).sort(byPos);
  const folderOptions: FolderOption[] = useMemo(
    () => roots.flatMap((r) => [{ id: r.id, label: r.name }, ...childrenOf(r.id).map((c) => ({ id: c.id, label: `${r.name} › ${c.name}` }))]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders]
  );

  const q = query.trim().toLowerCase();
  const visible = (t: Template) => !q || `${t.title} ${t.category ?? ''}`.toLowerCase().includes(q);
  const templatesIn = (folderId: string | null) =>
    templates.filter((t) => (t.folder_id ?? null) === folderId && visible(t)).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'fr'));
  const knownIds = new Set(folders.map((f) => f.id));
  const orphans = templates
    .filter((t) => (!t.folder_id || !knownIds.has(t.folder_id)) && visible(t))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'fr'));
  const countDeep = (id: string): number => templatesIn(id).length + childrenOf(id).reduce((n, c) => n + templatesIn(c.id).length, 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Une erreur est survenue.');
      else after?.();
    });
  }

  function renderNewFolder(parentId: string | null) {
    return (
      <form
        className="inline-form"
        action={(fd) => run(() => createFolder(String(fd.get('name') || ''), parentId), () => setNewFolder(null))}
        style={{ padding: '10px 18px' }}
      >
        <input name="name" required autoFocus className="input" placeholder={parentId ? 'Nom du sous-dossier' : 'Nom du dossier'} aria-label="Nom" />
        <button type="submit" className="primary small" disabled={isPending}>Créer</button>
        <button type="button" className="small" onClick={() => setNewFolder(null)}>Annuler</button>
      </form>
    );
  }

  function renderRows(list: Template[], folderId: string | null) {
    return (
      <>
        {canEdit && addIn === (folderId ?? '') && (
          <div className="folder-add">
            <form action={(fd) => run(() => createTemplate(fd), () => setAddIn(null))}>
              <TemplateFields folders={folderOptions} trainers={trainers} folder={folderId} />
              <div className="row-actions">
                <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Ajouter la formation'}</button>
                <button type="button" onClick={() => setAddIn(null)}>Annuler</button>
              </div>
            </form>
          </div>
        )}
        {list.length > 0 && (
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
                {list.map((t, i) =>
                  editingId === t.id ? (
                    <tr key={t.id}>
                      <td colSpan={canEdit ? 5 : 4} style={{ background: 'var(--surface-2)', padding: 16 }}>
                        <form action={(fd) => run(() => updateTemplate(t.id, fd), () => setEditingId(null))}>
                          <TemplateFields t={t} folders={folderOptions} trainers={trainers} />
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
                        {t.links.length > 0 && (
                          <div className="link-chips">
                            {t.links.map((l) => (
                              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="link-chip">
                                <ExternalLink size={12} aria-hidden /> {l.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="num">{formatHours(Number(t.duration_hours))}</td>
                      <td className="num">{t.max_trainees ?? '-'}</td>
                      <td className="num">{t.sessions_count}</td>
                      {canEdit && (
                        <td className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          {!q && (
                            <>
                              <button className="small icon ghost" aria-label={`Monter ${t.title}`} disabled={isPending || i === 0} onClick={() => run(() => moveTemplate(t.id, -1))}>
                                <ArrowUp size={14} />
                              </button>
                              <button className="small icon ghost" aria-label={`Descendre ${t.title}`} disabled={isPending || i === list.length - 1} onClick={() => run(() => moveTemplate(t.id, 1))}>
                                <ArrowDown size={14} />
                              </button>
                            </>
                          )}
                          <TemplateDossierButton templateId={t.id} title={t.title} documents={t.documents} />
                          <button className="small" onClick={() => setEditingId(t.id)} disabled={isPending}>
                            <Pencil size={14} aria-hidden /> Modifier
                          </button>
                          <button
                            className="danger small icon"
                            aria-label={`Supprimer ${t.title}`}
                            title="Supprimer"
                            disabled={isPending}
                            onClick={() => confirm(`Supprimer la formation « ${t.title} » du catalogue ?`) && run(() => deleteTemplate(t.id))}
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
        )}
      </>
    );
  }

  function renderRename(f: FolderRow) {
    return (
      <form
        className="inline-form"
        style={{ padding: '0 18px 12px 46px' }}
        action={(fd) => run(() => renameFolder(f.id, String(fd.get('name') || '')), () => setRenaming(null))}
      >
        <input name="name" required autoFocus defaultValue={f.name} className="input" aria-label="Nouveau nom du dossier" />
        <button type="submit" className="primary small" disabled={isPending}>Renommer</button>
        <button type="button" className="small" onClick={() => setRenaming(null)}>Annuler</button>
      </form>
    );
  }

  function renderHeader(f: FolderRow, index: number, siblings: number, isSub: boolean) {
    const count = isSub ? templatesIn(f.id).length : countDeep(f.id);
    return (
      <summary>
        <ChevronRight size={16} className="chev" aria-hidden />
        <Folder size={isSub ? 15 : 17} aria-hidden />
        <span>{f.name}</span>
        <small>{count} formation{count > 1 ? 's' : ''}</small>
        {canEdit && renaming !== f.id && (
          <span className="folder-tools" onClick={(e) => e.preventDefault()}>
            {!q && (
              <>
                <button className="small icon ghost" aria-label={`Monter le dossier ${f.name}`} disabled={isPending || index === 0} onClick={() => run(() => moveFolder(f.id, -1))}>
                  <ArrowUp size={14} />
                </button>
                <button className="small icon ghost" aria-label={`Descendre le dossier ${f.name}`} disabled={isPending || index === siblings - 1} onClick={() => run(() => moveFolder(f.id, 1))}>
                  <ArrowDown size={14} />
                </button>
              </>
            )}
            <button className="small icon ghost" aria-label={`Renommer ${f.name}`} onClick={() => setRenaming(f.id)}>
              <Pencil size={14} />
            </button>
            {!isSub && (
              <button className="small icon ghost" aria-label={`Créer un sous-dossier dans ${f.name}`} title="Sous-dossier" onClick={() => setNewFolder(f.id)}>
                <FolderPlus size={15} />
              </button>
            )}
            <button
              className="small icon ghost"
              aria-label={`Supprimer le dossier ${f.name}`}
              disabled={isPending}
              onClick={() => confirm(`Supprimer le dossier « ${f.name} » ? (il doit être vide)`) && run(() => deleteFolder(f.id))}
            >
              <Trash2 size={14} />
            </button>
            <button className="small icon primary" aria-label={`Ajouter une formation dans ${f.name}`} title="Ajouter une formation" onClick={() => { setAddIn(f.id); setEditingId(null); }}>
              <Plus size={16} />
            </button>
          </span>
        )}
      </summary>
    );
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
          <span className="row-actions">
            <button className="primary" onClick={() => setNewFolder('')}>
              <FolderPlus size={16} aria-hidden /> Nouveau dossier
            </button>
          </span>
        )}
      </div>

      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {canEdit && newFolder === '' && (
        <div className="folder">{renderNewFolder(null)}</div>
      )}

      {roots.map((f, i) => {
        const subs = childrenOf(f.id);
        if (q && countDeep(f.id) === 0) return null;
        return (
          <details className="folder" key={f.id} {...folderProps(f.id)}>
            {renderHeader(f, i, roots.length, false)}
            {renaming === f.id && renderRename(f)}
            {canEdit && newFolder === f.id && renderNewFolder(f.id)}
            {subs.map((c, j) => {
              if (q && templatesIn(c.id).length === 0) return null;
              return (
                <details className="folder subfolder" key={c.id} {...folderProps(c.id)}>
                  {renderHeader(c, j, subs.length, true)}
                  {renaming === c.id && renderRename(c)}
                  {renderRows(templatesIn(c.id), c.id)}
                  {templatesIn(c.id).length === 0 && addIn !== c.id && <p className="hint" style={{ padding: '0 18px 12px' }}>Sous-dossier vide.</p>}
                </details>
              );
            })}
            {renderRows(templatesIn(f.id), f.id)}
            {countDeep(f.id) === 0 && subs.length === 0 && addIn !== f.id && <p className="hint" style={{ padding: '0 18px 14px' }}>Dossier vide : ajoute une formation avec +.</p>}
          </details>
        );
      })}

      {(orphans.length > 0 || addIn === '') && (
        <details className="folder" {...folderProps('sans-dossier')}>
          <summary>
            <ChevronRight size={16} className="chev" aria-hidden />
            <Folder size={17} aria-hidden /> <span>Sans dossier</span>
            <small>{orphans.length} formation{orphans.length > 1 ? 's' : ''}</small>
          </summary>
          {renderRows(orphans, null)}
        </details>
      )}

      {roots.length === 0 && orphans.length === 0 && (
        <p className="empty">{templates.length === 0 ? 'Aucune formation : crée d’abord un dossier, puis ajoute des formations avec +.' : 'Aucun résultat.'}</p>
      )}
    </>
  );
}
