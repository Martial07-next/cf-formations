'use client';

import { useState, useTransition } from 'react';
import { History, PhoneCall, UserRound } from 'lucide-react';
import { setSessionManager, setFollowupOwner, recordFollowup } from '@/app/suivi/actions';
import { ACTIVITY_LABEL, activityDetail, frShortDate, since, type Staff } from '@/lib/tracking';

export type TraineeTracking = {
  addedBy: string | null;
  addedAt: string | null;
  statusBy: string | null;
  statusAt: string | null;
  followupBy: string | null;
  followupCount: number;
  lastFollowupAt: string | null;
  lastFollowupBy: string | null;
  followupNote: string | null;
};

const nameOf = (staff: Staff[], id: string | null | undefined) => (id ? staff.find((s) => s.id === id)?.full_name || 'Compte supprimé' : null);

/** « Créée par … le … · Gestionnaire : … » sous le titre de la session. */
export function SessionTrackingBar({
  sessionId,
  createdBy,
  createdAt,
  managerId,
  staff,
  canManage,
}: {
  sessionId: string;
  createdBy: string | null;
  createdAt: string | null;
  managerId: string | null;
  staff: Staff[];
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const internal = staff.filter((p) => ['admin', 'bureau', 'referent'].includes(p.role) || p.id === managerId);
  return (
    <p className="tracking-bar">
      <span>
        <UserRound size={13} aria-hidden /> Créée par <strong>{nameOf(staff, createdBy) || 'import / ancien enregistrement'}</strong>
        {createdAt ? ` le ${new Date(createdAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''}
      </span>
      <span>
        Gestionnaire :{' '}
        {canManage ? (
          <select
            aria-label="Gestionnaire de la session"
            value={managerId || ''}
            disabled={isPending}
            onChange={(e) =>
              startTransition(async () => {
                const res = await setSessionManager(sessionId, e.target.value || null);
                setError(res.ok ? null : res.error);
              })
            }
          >
            <option value="">— personne —</option>
            {internal.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        ) : (
          <strong>{nameOf(staff, managerId) || '—'}</strong>
        )}
      </span>
      {error && <span className="field-error">{error}</span>}
    </p>
  );
}

/** Petit rappel sous le nom d'un stagiaire : qui l'a inscrit / validé. */
export function AddedBy({ t, staff }: { t?: TraineeTracking; staff: Staff[] }) {
  if (!t) return null;
  const added = nameOf(staff, t.addedBy);
  const status = nameOf(staff, t.statusBy);
  if (!added && !status) return null;
  return (
    <span className="tracking-who">
      {added ? `ajouté par ${added}${t.addedAt ? ` le ${frShortDate(t.addedAt)}` : ''}` : ''}
      {status && status !== added ? `${added ? ' · ' : ''}statut par ${status}${t.statusAt ? ` le ${frShortDate(t.statusAt)}` : ''}` : ''}
    </span>
  );
}

/** Suivi d'un stagiaire en attente : qui relance, combien de fois, quand. */
export function FollowupCell({
  sessionId,
  traineeId,
  t,
  staff,
  canManage,
}: {
  sessionId: string;
  traineeId: string;
  t?: TraineeTracking;
  staff: Staff[];
  canManage: boolean;
}) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const internal = staff.filter((p) => ['admin', 'bureau', 'referent'].includes(p.role) || p.id === t?.followupBy);
  const last = t?.lastFollowupAt;
  const stale = !last || Date.now() - new Date(last).getTime() > 3 * 86400000;

  return (
    <div className="followup">
      {canManage ? (
        <select
          aria-label="Qui relance"
          value={t?.followupBy || ''}
          disabled={isPending}
          onChange={(e) =>
            startTransition(async () => {
              const res = await setFollowupOwner(sessionId, traineeId, e.target.value || null);
              setError(res.ok ? null : res.error);
            })
          }
        >
          <option value="">Qui relance ?</option>
          {internal.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      ) : (
        <span>{nameOf(staff, t?.followupBy) || 'Personne'}</span>
      )}
      <span className={`followup-state${stale ? ' stale' : ''}`}>
        {t?.followupCount
          ? `${t.followupCount} relance${t.followupCount > 1 ? 's' : ''} · ${since(last)}${t.lastFollowupBy ? ` (${nameOf(staff, t.lastFollowupBy)})` : ''}`
          : 'jamais relancé'}
      </span>
      {t?.followupNote && <span className="hint followup-note">« {t.followupNote} »</span>}
      {canManage &&
        (open ? (
          <span className="followup-form">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif) : ex. rappeler lundi" aria-label="Note de relance" />
            <button
              type="button"
              className="small primary"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await recordFollowup(sessionId, traineeId, note);
                  if (!res.ok) setError(res.error);
                  else {
                    setError(null);
                    setNote('');
                    setOpen(false);
                  }
                })
              }
            >
              Enregistrer
            </button>
          </span>
        ) : (
          <button type="button" className="small" onClick={() => setOpen(true)}><PhoneCall size={13} aria-hidden /> Relancé</button>
        ))}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export type ActivityItem = { id: string; action: string; detail: string | null; created_at: string; actor_id: string | null };

/** Historique de la session (replié par défaut). */
export function SessionHistory({ items, staff }: { items: ActivityItem[]; staff: Staff[] }) {
  if (!items.length) return null;
  return (
    <details className="panel history">
      <summary>
        <History size={16} aria-hidden /> <strong>Historique</strong> <span className="hint">· {items.length} action{items.length > 1 ? 's' : ''} · qui a fait quoi</span>
      </summary>
      <ol className="history-list">
        {items.map((a) => (
          <li key={a.id}>
            <time>{new Date(a.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
            <span>
              <strong>{nameOf(staff, a.actor_id) || 'Automatique / stagiaire'}</strong> {ACTIVITY_LABEL[a.action] || a.action}{' '}
              {activityDetail(a.action, a.detail)}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
