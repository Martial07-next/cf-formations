'use client';

import { submitWith } from '@/lib/form-submit';
import { AUTH_KINDS } from '@/lib/autorisations';
import { REUSSITE_MODELS, reussiteModels } from '@/lib/reussite';
import { FontsKit } from '@/components/fonts-kit';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, FileText, Folder, FolderPlus, Link2, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { isSupportFile, supportFileName, SUPPORT_BUCKET } from '@/lib/links';
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
import { askConfirm } from '@/lib/confirm-dialog';

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
  tour_de_table?: boolean;
  titre_habilitation?: boolean;
  fiche_appreciation?: boolean;
  attestation_reussite?: string | null;
  authorizations?: string[] | null;
  recyclage_available?: boolean;
  objectifs_recyclage?: string | null;
  competences_recyclage?: string | null;
  codification?: string | null;
  objectifs?: string | null;
  competences?: string | null;
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
  const [fai, setFai] = useState(Boolean(t?.fiche_appreciation));
  const [recyclage, setRecyclage] = useState(Boolean(t?.recyclage_available));
  const [links, setLinks] = useState<{ label: string; url: string }[]>((t?.links || []).map((l) => ({ label: l.label, url: l.url })));
  const linksJson = JSON.stringify(links.filter((l) => l.label.trim() || l.url.trim()));
  const updateLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    setLinks((list) => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Fichiers des supports (PDF, PowerPoint…) : envoyés directement dans le stockage.
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        setUploadError(`« ${file.name} » dépasse 50 Mo.`);
        continue;
      }
      setUploading(file.name);
      // Nom sans accents ni caractères spéciaux (exigé par le stockage).
      const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-150) || 'fichier';
      const id = crypto.randomUUID();
      const { error } = await supabase.storage.from(SUPPORT_BUCKET).upload(`${id}/${safe}`, file, { contentType: file.type || undefined });
      if (error) {
        setUploadError(
          /bucket|not found/i.test(error.message)
            ? 'Exécute d’abord la migration 41 (supabase/migration_phase41.sql) dans Supabase.'
            : `« ${file.name} » : envoi impossible (${error.message}).`
        );
        continue;
      }
      const label = file.name.replace(/\.[^.]+$/, '');
      setLinks((list) => [...list, { label, url: `/supports/${id}/${safe}` }]);
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <>
      <section className="tf-section">
        <h3><span className="tf-num">1</span> Informations générales</h3>
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

      <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
        <label>
          Description / objectifs
          <textarea name="description" rows={2} defaultValue={t?.description || ''} />
        </label>
      </div>
      </section>
      <section className="tf-section">
        <h3><span className="tf-num">2</span> Modules</h3>
      <div className="field" style={{ marginBottom: 14 }}>
        <span className="hint">Facultatif. Ex. P1, P2, P3 ou MA1, MA2, MA3 : un stagiaire peut ne suivre qu’une partie des modules, et la durée totale devient la somme des modules.</span>
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

      </section>
      <section className="tf-section">
        <h3><span className="tf-num">3</span> Formateurs habilités</h3>
      <div className="field" style={{ marginBottom: 14 }}>
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

      </section>
      <section className="tf-section">
        <h3><span className="tf-num">4</span> Documents du dossier de session</h3>
          <p className="hint">Ce que le formateur remplit pendant la session.</p>
      <div className="field" style={{ marginBottom: 14 }}>
        <input type="hidden" name="tdt_present" value="1" />
        <label className="check-line">
          <input type="checkbox" name="tour_de_table" defaultChecked={t?.tour_de_table !== false} />
          Tour de table à remplir par le formateur dans le dossier de chaque session
        </label>
        <input type="hidden" name="titre_present" value="1" />
        <label className="check-line">
          <input type="checkbox" name="titre_habilitation" defaultChecked={Boolean(t?.titre_habilitation)} />
          Titre d’habilitation exigé : case au tour de table, dépôt par QR code, attestation bloquée tant que le titre n’est pas fourni
        </label>
        <input type="hidden" name="recyclage_present" value="1" />
        <label className="check-line">
          <input type="checkbox" name="recyclage_available" checked={recyclage} onChange={(e) => setRecyclage(e.target.checked)} />
          Formation disponible en recyclage (boutons Initial / Recyclage pour chaque stagiaire de la session)
        </label>
        <input type="hidden" name="reussite_present" value="1" />
        <fieldset className="ar-models">
          <legend>Attestations de réussite (remplies et signées par le formateur)</legend>
          <span className="hint">
            Coche chaque niveau couvert par la formation : chaque stagiaire reçoit une attestation séparée par niveau. Si la session a un module du même nom (P1, P2…), ses dates et ses stagiaires sont repris.
          </span>
          <div className="ar-models-list">
            {REUSSITE_MODELS.map((m) => (
              <label key={m.key} className="check-line">
                <input type="checkbox" name="attestation_reussite" value={m.key} defaultChecked={reussiteModels(t?.attestation_reussite).some((x) => x.key === m.key)} />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
        <input type="hidden" name="fai_present" value="1" />
        <label className="check-line">
          <input type="checkbox" name="fiche_appreciation" checked={fai} onChange={(e) => setFai(e.target.checked)} />
          Fiche d’appréciation individuelle (une par stagiaire) à remplir par le formateur
        </label>
        <div className="fai-template-fields" hidden={!fai}>
          <label style={{ fontWeight: 600 }}>
            Codification SERECT (fiche d’appréciation)
            <input name="codification" defaultValue={t?.codification || ''} placeholder="Vide = intitulé de la formation en majuscules" />
          </label>
          <label style={{ fontWeight: 600 }}>
            Objectifs de fin de formation (attestation de fin de formation)
            <span className="hint" style={{ fontWeight: 500 }}>Une ligne commençant par « - » devient une puce.</span>
            <textarea
              name="objectifs"
              rows={4}
              defaultValue={t?.objectifs || ''}
              placeholder={'Ex. Actualiser et maintenir les compétences nécessaires pour… :\n- sur des conducteurs à isolation synthétique…\n- sur des branchements…'}
            />
          </label>
          <label style={{ fontWeight: 600 }}>
            Compétences évaluées (appréciation des compétences)
            <span className="hint" style={{ fontWeight: 500 }}>Une compétence par ligne. Vide = les objectifs ci-dessus.</span>
            <textarea
              name="competences"
              rows={4}
              defaultValue={t?.competences || ''}
              placeholder={'Ex. Comprendre et identifier le rôle de l’Exécutant sur l’ouvrage concerné ;\nIdentifier et maîtriser les risques liés aux travaux sous tension…'}
            />
          </label>
          {recyclage && (
            <>
              <label style={{ fontWeight: 600 }}>
                Objectifs de fin de formation · RECYCLAGE
                <span className="hint" style={{ fontWeight: 500 }}>Utilisés pour les stagiaires en recyclage. Vide = les objectifs ci-dessus.</span>
                <textarea name="objectifs_recyclage" rows={4} defaultValue={t?.objectifs_recyclage || ''} placeholder={'Ex. Maintenir et actualiser les compétences…\n- …'} />
              </label>
              <label style={{ fontWeight: 600 }}>
                Compétences évaluées · RECYCLAGE
                <span className="hint" style={{ fontWeight: 500 }}>Une compétence par ligne. Vide = les objectifs recyclage.</span>
                <textarea name="competences_recyclage" rows={4} defaultValue={t?.competences_recyclage || ''} />
              </label>
            </>
          )}
        </div>
        <input type="hidden" name="auth_present" value="1" />
        <div className="autor-kinds" role="group" aria-label="Autorisations à faire remplir aux stagiaires">
          <span className="hint" style={{ fontWeight: 700 }}>Autorisations stagiaire (QR code, une seule fois par stagiaire) :</span>
          {AUTH_KINDS.map((k) => (
            <label key={k.kind} className="check-line">
              <input type="checkbox" name="authorizations" value={k.kind} defaultChecked={(t?.authorizations ?? ['image']).includes(k.kind)} />
              {k.short}
            </label>
          ))}
        </div>
      </div>

      </section>
      <section className="tf-section">
        <h3><span className="tf-num">5</span> Supports de cours</h3>
      <div className="field" style={{ marginBottom: 14 }}>
        <FontsKit compact />
        <span className="hint">Ajoute un lien ou un fichier (PDF, PowerPoint, Word…) et nomme-le : les formateurs le retrouvent sur la fiche de session et dans « Liens utiles » du planning. Pense à « Enregistrer ».</span>
        {uploadError && <div role="alert" className="alert alert-error">{uploadError}</div>}
        <input type="hidden" name="links_json" value={linksJson} />
        <div className="link-editor">
          {links.map((l, i) => (
            <div className="link-editor-row" key={i}>
              <input aria-label={`Nom du lien ${i + 1}`} placeholder="Ex. Support stagiaire (PDF)" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} />
              {isSupportFile(l.url) ? (
                <a className="link-file-chip" href={l.url} target="_blank" rel="noopener noreferrer" title="Ouvrir le fichier">
                  <FileText size={14} aria-hidden /> <span>{supportFileName(l.url)}</span>
                </a>
              ) : (
                <input aria-label={`Adresse du lien ${i + 1}`} placeholder="https://…" inputMode="url" value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} />
              )}
              <button type="button" className="small icon ghost" aria-label={`Retirer le lien ${i + 1}`} onClick={() => setLinks((list) => list.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <span className="row-actions" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className="small" onClick={() => setLinks((list) => [...list, { label: '', url: '' }])}>
              <Plus size={14} aria-hidden /> Ajouter un lien
            </button>
            <button type="button" className="small" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()}>
              {uploading ? <><Loader2 size={14} className="spin" aria-hidden /> Envoi de « {uploading} »…</> : <><Upload size={14} aria-hidden /> Ajouter un fichier</>}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.odp,.odt,.ods,.png,.jpg,.jpeg,.zip,.mp4"
              onChange={(e) => addFiles(e.target.files)}
            />
          </span>
        </div>
      </div>

      </section>
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
  // Fenêtre de la fiche formation : ouverte dès qu'on ajoute ou modifie.
  const editorRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const editing = editingId ? templates.find((t) => t.id === editingId) || null : null;
  const editorOpen = addIn !== null || Boolean(editing);
  useEffect(() => {
    const d = editorRef.current;
    if (!d) return;
    if (editorOpen && !d.open) {
      setError(null);
      d.showModal();
    } else if (!editorOpen && d.open) d.close();
  }, [editorOpen]);

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
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function renderNewFolder(parentId: string | null) {
    return (
      <form
        className="inline-form"
        onSubmit={submitWith((fd) => run(() => createFolder(String(fd.get('name') || ''), parentId), () => setNewFolder(null)))}
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
                {list.map((t, i) => (
                    <tr
                      key={t.id}
                      className={canEdit ? 'row-link' : undefined}
                      onClick={(e) => {
                        // Toute la ligne ouvre la fiche de la formation (sauf boutons et liens).
                        if (!canEdit || (e.target as HTMLElement).closest('a, button, input, select, label, dialog')) return;
                        setEditingId(t.id);
                      }}
                    >
                      <td>
                        <strong>{t.title}</strong>
                        <div className="tpl-flags">
                          {t.tour_de_table !== false && <span className="tpl-flag">Tour de table</span>}
                          {t.titre_habilitation && <span className="tpl-flag">Titre d’habilitation</span>}
                          {t.fiche_appreciation && <span className="tpl-flag">Fiche d’appréciation</span>}
                          {reussiteModels(t.attestation_reussite).length > 0 && (
                            <span className="tpl-flag">Attestations {reussiteModels(t.attestation_reussite).map((m) => m.label.replace(/^IRVE\s+/, '')).join(' · ')}</span>
                          )}
                          {t.recyclage_available && <span className="tpl-flag">Recyclage</span>}
                        </div>
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
                            onClick={async () => (await askConfirm(`Supprimer la formation « ${t.title} » du catalogue ?`)) && run(() => deleteTemplate(t.id))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                ))}
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
        onSubmit={submitWith((fd) => run(() => renameFolder(f.id, String(fd.get('name') || '')), () => setRenaming(null)))}
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
              onClick={async () => (await askConfirm(`Supprimer le dossier « ${f.name} » ? (il doit être vide)`)) && run(() => deleteFolder(f.id))}
            >
              <Trash2 size={14} />
            </button>
            <button className="small primary" aria-label={`Ajouter une formation dans ${f.name}`} title="Ajouter une formation dans ce dossier" onClick={() => { setAddIn(f.id); setEditingId(null); }}>
              <Plus size={14} aria-hidden /> Formation
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
            <button className="primary" onClick={() => { setAddIn(''); setEditingId(null); }}>
              <Plus size={16} aria-hidden /> Nouvelle formation
            </button>
            <button onClick={() => setNewFolder('')}>
              <FolderPlus size={16} aria-hidden /> Nouveau dossier
            </button>
          </span>
        )}
      </div>
      {canEdit && templates.length > 0 && (
        <p className="hint" style={{ margin: '-4px 0 12px' }}>Clique sur une formation pour la modifier (durée, modules, formateurs habilités, documents du dossier…).</p>
      )}

      {/* Fiche d'une formation (création / modification) */}
      <dialog
        ref={editorRef}
        className="modal tpl-modal"
        aria-label={editing ? `Modifier ${editing.title}` : 'Nouvelle formation'}
        onClose={() => {
          setEditingId(null);
          setAddIn(null);
        }}
      >
        {editorOpen && (
          <form
            key={editing?.id || `new-${addIn}`}
            className="tpl-form"
            onSubmit={submitWith((fd) =>
              run(() => (editing ? updateTemplate(editing.id, fd) : createTemplate(fd)), () => editorRef.current?.close())
            )}
          >
            <div className="modal-head">
              <h2>{editing ? `Modifier · ${editing.title}` : 'Nouvelle formation'}</h2>
              <button type="button" className="icon ghost" onClick={() => editorRef.current?.close()} aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {error && <div role="alert" className="alert alert-error">{error}</div>}
              <TemplateFields t={editing || undefined} folders={folderOptions} trainers={trainers} folder={addIn || null} />
            </div>
            <div className="modal-foot">
              <button type="button" onClick={() => editorRef.current?.close()}>Annuler</button>
              <button type="submit" className="primary" disabled={isPending}>
                {isPending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter la formation'}
              </button>
            </div>
          </form>
        )}
      </dialog>

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
            {countDeep(f.id) === 0 && subs.length === 0 && addIn !== f.id && <p className="hint" style={{ padding: '0 18px 14px' }}>Dossier vide : ajoute une formation avec « + Formation ».</p>}
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
