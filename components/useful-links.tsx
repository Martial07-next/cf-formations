'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { ExternalLink, Link2, Pencil, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { createUsefulLink, updateUsefulLink, deleteUsefulLink } from '@/app/liens/actions';
import { LINK_CATEGORIES, linkHost, type LinkItem, type UsefulLink } from '@/lib/links';

export type TemplateLinks = { template_id: string; title: string; links: LinkItem[] };

/** Un lien cliquable (nouvel onglet). */
export function LinkRow({ link, note }: { link: LinkItem; note?: string | null }) {
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-row">
      <Link2 size={15} aria-hidden />
      <span>
        <strong>{link.label}</strong>
        <small>{note || linkHost(link.url)}</small>
      </span>
      <ExternalLink size={14} aria-hidden className="link-row-go" />
    </a>
  );
}

function LinkForm({ link, onDone }: { link?: UsefulLink; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="link-form"
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const res = link ? await updateUsefulLink(link.id, fd) : await createUsefulLink(fd);
          if (!res.ok) setError(res.error);
          else onDone();
        });
      }}
    >
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="form-row">
        <label>
          Rubrique
          <input name="category" list="link-categories" required defaultValue={link?.category || LINK_CATEGORIES[0]} />
        </label>
        <label>
          Nom du lien
          <input name="label" required defaultValue={link?.label || ''} placeholder="Ex. Demande de congés" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Adresse (lien)
          <input name="url" required defaultValue={link?.url || ''} placeholder="https://…" inputMode="url" />
        </label>
        <label>
          Précision (facultatif)
          <input name="description" defaultValue={link?.description || ''} placeholder="Ex. à imprimer avant chaque session" />
        </label>
      </div>
      <div className="row-actions">
        <button type="submit" className="primary small" disabled={isPending}>{isPending ? 'Enregistrement…' : link ? 'Enregistrer' : 'Ajouter le lien'}</button>
        <button type="button" className="small" onClick={onDone}>Annuler</button>
      </div>
    </form>
  );
}

/** Bouton « Liens utiles » du planning et sa fenêtre (consultation + gestion par le bureau). */
export function UsefulLinksButton({
  links,
  templateLinks,
  canEdit,
}: {
  links: UsefulLink[];
  templateLinks: TemplateLinks[];
  canEdit: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => {
    const map = new Map<string, UsefulLink[]>();
    for (const l of [...links].sort((a, b) => a.position - b.position)) {
      map.set(l.category, [...(map.get(l.category) || []), l]);
    }
    const order = (c: string) => (LINK_CATEGORIES.indexOf(c) + 1 || 99);
    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
  }, [links]);

  const q = query.trim().toLowerCase();
  const formations = templateLinks.filter(
    (t) => !q || t.title.toLowerCase().includes(q) || t.links.some((l) => l.label.toLowerCase().includes(q))
  );

  function remove(l: UsefulLink) {
    if (!confirm(`Supprimer le lien « ${l.label} » ?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteUsefulLink(l.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <>
      <button onClick={() => ref.current?.showModal()}>
        <Link2 size={16} aria-hidden /> Liens utiles
      </button>
      <dialog ref={ref} className="modal" aria-labelledby="links-title" onClose={() => { setManage(false); setEditing(null); }}>
        <div className="modal-head">
          <h2 id="links-title"><Link2 size={18} aria-hidden /> Liens utiles</h2>
          <div className="row-actions">
            {canEdit && (
              <button className={`small${manage ? ' primary' : ''}`} onClick={() => { setManage((v) => !v); setEditing(null); }} aria-pressed={manage}>
                <Settings2 size={14} aria-hidden /> {manage ? 'Terminer' : 'Gérer'}
              </button>
            )}
            <button className="icon ghost" onClick={() => ref.current?.close()} aria-label="Fermer"><X size={18} /></button>
          </div>
        </div>
        <div className="modal-body" style={{ paddingBottom: 18 }}>
        <datalist id="link-categories">
          {LINK_CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
        {error && <div role="alert" className="alert alert-error">{error}</div>}

        {manage && editing === 'new' && <LinkForm onDone={() => setEditing(null)} />}
        {manage && editing !== 'new' && (
          <button className="small" style={{ marginBottom: 12 }} onClick={() => setEditing('new')}>
            <Plus size={14} aria-hidden /> Ajouter un lien
          </button>
        )}

        {groups.length === 0 && !manage && (
          <p className="empty">
            Aucun lien pour l’instant.{canEdit ? ' Clique sur « Gérer » pour ajouter la plateforme de congés, les attestations…' : ''}
          </p>
        )}
        {groups.map(([category, items]) => (
          <section key={category} className="link-group">
            <h3>{category}</h3>
            {items.map((l) =>
              manage && editing === l.id ? (
                <LinkForm key={l.id} link={l} onDone={() => setEditing(null)} />
              ) : (
                <div key={l.id} className="link-line">
                  <LinkRow link={l} note={l.description} />
                  {manage && (
                    <>
                      <button className="small icon ghost" aria-label={`Modifier ${l.label}`} onClick={() => setEditing(l.id)}><Pencil size={14} /></button>
                      <button className="small icon ghost danger" aria-label={`Supprimer ${l.label}`} disabled={isPending} onClick={() => remove(l)}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              )
            )}
          </section>
        ))}

        {templateLinks.length > 0 && (
          <section className="link-group">
            <h3>Supports des formations</h3>
            <label className="search" style={{ marginBottom: 8, width: '100%', maxWidth: 420 }}>
              <Search size={15} aria-hidden />
              <span className="sr-only">Rechercher une formation</span>
              <input placeholder="Rechercher une formation…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {formations.map((t) => (
              <details key={t.template_id} className="link-formation" open={Boolean(q)}>
                <summary>{t.title} <span className="hint">({t.links.length})</span></summary>
                {t.links.map((l) => <LinkRow key={l.id} link={l} />)}
              </details>
            ))}
            {formations.length === 0 && <p className="hint">Aucune formation trouvée.</p>}
            {manage && <p className="hint">Les supports d’une formation se gèrent dans sa fiche (Formations disponibles › Modifier).</p>}
          </section>
        )}
        </div>
      </dialog>
    </>
  );
}
