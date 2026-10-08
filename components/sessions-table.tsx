'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Trash2 } from 'lucide-react';
import { updateSessionStatus, deleteSession } from '@/app/sessions/actions';
import { SESSION_STATUSES, SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

type Row = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  max_trainees: number | null;
  trainer_id: string | null;
  rooms: { name: string; is_holding: boolean | null } | { name: string; is_holding: boolean | null }[] | null;
  trainers: { full_name: string; color: string | null } | { full_name: string; color: string | null }[] | null;
  session_trainees: { status: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionsTable({
  isAdmin,
  canEditStatus = isAdmin,
  myTrainerId,
  rows,
}: {
  /** Gestion complète (suppression) : administrateur et bureau administratif. */
  isAdmin: boolean;
  /** Changement de statut : + référent cadre. */
  canEditStatus?: boolean;
  myTrainerId: string | null;
  rows: Row[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [mine, setMine] = useState(false);

  const now = new Date().toISOString();
  const filtered = useMemo(() => {
    const list = rows.filter((s) => {
      if (period === 'upcoming' && s.end_at < now) return false;
      if (period === 'past' && s.end_at >= now) return false;
      if (status && s.status !== status) return false;
      if (mine && s.trainer_id !== myTrainerId) return false;
      if (!query) return true;
      const hay = `${s.title} ${one(s.trainers)?.full_name ?? ''} ${one(s.rooms)?.name ?? ''}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    return period === 'upcoming' ? [...list].reverse() : list;
  }, [rows, query, status, period, mine, myTrainerId, now]);

  function handleStatus(id: string, value: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateSessionStatus(id, value);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`Supprimer définitivement la session « ${title} » ?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSession(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <div className="toolbar">
        <div className="toggle-group" role="group" aria-label="Période">
          {(['upcoming', 'past', 'all'] as const).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {p === 'upcoming' ? 'À venir' : p === 'past' ? 'Passées' : 'Toutes'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search">
          <Search size={15} aria-hidden />
          <span className="sr-only">Rechercher</span>
          <input placeholder="Formation, formateur, salle…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select aria-label="Filtrer par statut" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {SESSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {myTrainerId && (
          <button className={`small${mine ? ' primary' : ''}`} aria-pressed={mine} onClick={() => setMine((v) => !v)}>
            Mes sessions
          </button>
        )}
      </div>

      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {filtered.length === 0 ? (
        <p className="empty">Aucune session ne correspond.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Statut</th>
                <th>Formation</th>
                <th>Formateur</th>
                <th>Salle</th>
                <th>Début</th>
                <th>Fin</th>
                <th className="num">Stagiaires</th>
                {isAdmin && <th><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const trainer = one(s.trainers);
                const room = one(s.rooms);
                const validated = (s.session_trainees || []).filter((t) => t.status === 'validee').length;
                return (
                  <tr key={s.id}>
                    <td>
                      {canEditStatus ? (
                        <select
                          aria-label={`Statut de ${s.title}`}
                          className="input"
                          value={s.status}
                          onChange={(e) => handleStatus(s.id, e.target.value)}
                          disabled={isPending}
                        >
                          {SESSION_STATUSES.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`status-pill ${s.status}`}>{SESSION_STATUS_LABEL[s.status] ?? s.status}</span>
                      )}
                    </td>
                    <td><Link href={`/sessions/${s.id}`}>{s.title}</Link></td>
                    <td>
                      {trainer ? (
                        <span className="trainer-tag" style={{ fontWeight: 600 }}>
                          <span className="swatch" style={{ background: trainer.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                          {trainer.full_name}
                        </span>
                      ) : (
                        <span className="hint">-</span>
                      )}
                    </td>
                    <td>{room?.is_holding ? <span className="badge en_attente">À affecter</span> : room?.name || '-'}</td>
                    <td>{fmt(s.start_at)}</td>
                    <td>{fmt(s.end_at)}</td>
                    <td className="num">{validated}{s.max_trainees != null ? ` / ${s.max_trainees}` : ''}</td>
                    {isAdmin && (
                      <td className="row-actions">
                        <button
                          className="danger small icon"
                          onClick={() => handleDelete(s.id, s.title)}
                          disabled={isPending}
                          aria-label={`Supprimer ${s.title}`}
                          title="Supprimer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
