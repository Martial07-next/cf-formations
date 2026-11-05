'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { purgeTrainees, trashPlaceholderTrainees, trashTrainees } from '@/app/stagiaires/actions';
import { askConfirm } from '@/lib/confirm-dialog';

/** Bouton « corbeille » d'une ligne du tableau des stagiaires. */
export function TrashRowButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="small icon ghost"
      aria-label={`Mettre ${name} à la corbeille`}
      title="Mettre à la corbeille (fiche fictive ou sans rapport)"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await trashTrainees([id], true);
          if (!r.ok) await askConfirm(r.error, { info: true, title: 'Corbeille' });
          else router.refresh();
        })
      }
    >
      <Trash2 size={14} />
    </button>
  );
}

/** Fiches fictives détectées (« Apprenant A »…) : tout mettre à la corbeille d'un clic. */
export function PlaceholderAlert({ count, examples }: { count: number; examples: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!count) return null;
  return (
    <div role="status" className="alert alert-warning trash-alert">
      <Sparkles size={16} aria-hidden />
      <span>
        <strong>{count} fiche{count > 1 ? 's' : ''} fictive{count > 1 ? 's' : ''}</strong> détectée{count > 1 ? 's' : ''} (noms génériques, ex. {examples.join(', ')}).
        {msg && <> {msg}</>}
      </span>
      <button
        type="button"
        className="small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await trashPlaceholderTrainees();
            if (!r.ok) setMsg(r.error);
            else router.refresh();
          })
        }
      >
        <Trash2 size={14} aria-hidden /> Tout mettre à la corbeille
      </button>
    </div>
  );
}

/** Vue « Corbeille » : restaurer ou supprimer définitivement. */
export function TrashList({ rows }: { rows: { id: string; name: string; company: string | null; reason: string | null; at: string | null; sessions: number }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ids = sel.size ? [...sel] : [];
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error || 'Action impossible.');
      else {
        setError(null);
        setSel(new Set());
        router.refresh();
      }
    });
  if (!rows.length) return <p className="empty">La corbeille est vide.</p>;
  return (
    <div className="trash-list">
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="trash-bar">
        <label className="check-line">
          <input type="checkbox" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Tout sélectionner
        </label>
        <span className="row-actions">
          <button type="button" className="small" disabled={pending || !ids.length} onClick={() => run(() => trashTrainees(ids, false))}>
            <RotateCcw size={14} aria-hidden /> Restaurer{ids.length ? ` (${ids.length})` : ''}
          </button>
          <button
            type="button"
            className="small danger"
            disabled={pending || !ids.length}
            onClick={async () => {
              if (!(await askConfirm(`Supprimer définitivement ${ids.length} fiche${ids.length > 1 ? 's' : ''} ? Leurs inscriptions aux sessions sont retirées.`, { danger: true }))) return;
              run(() => purgeTrainees(ids));
            }}
          >
            <Trash2 size={14} aria-hidden /> Supprimer définitivement
          </button>
        </span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={sel.has(r.id) ? 'on' : ''}>
            <label className="check-line">
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
              <span>
                <strong>{r.name}</strong>
                <small className="hint">
                  {[r.company, r.reason, r.at ? `le ${new Date(r.at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : null, r.sessions ? `${r.sessions} inscription${r.sessions > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                </small>
              </span>
            </label>
            <button type="button" className="small ghost" disabled={pending} onClick={() => run(() => trashTrainees([r.id], false))}>
              <RotateCcw size={13} aria-hidden /> Restaurer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
