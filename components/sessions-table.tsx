'use client';

import { SessionStatus } from '@/components/session-status';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Pencil, Search, Trash2 } from 'lucide-react';
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

/** Dates et horaires sur une ligne : « 27/10 → 02/11/26 · 8h–16h ». */
function datesLabel(startIso: string, endIso: string) {
  const [sd, st] = startIso.slice(0, 16).split('T');
  const [ed, et] = endIso.slice(0, 16).split('T');
  const day = (d: string, year: boolean) => {
    const [y, m, dd] = d.split('-');
    return year ? `${dd}/${m}/${y.slice(2)}` : `${dd}/${m}`;
  };
  const hm = (t: string) => t.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
  const hours = `${hm(st)}–${hm(et)}`;
  if (sd === ed) return `${day(sd, true)} · ${hours}`;
  return `${day(sd, sd.slice(0, 4) !== ed.slice(0, 4))} → ${day(ed, true)} · ${hours}`;
}

export function SessionsTable({
  isAdmin,
  canEditStatus = isAdmin,
  myTrainerId,
  nowKey = '',
  rows,
}: {
  /** Gestion complète (suppression) : administrateur et bureau administratif. */
  isAdmin: boolean;
  /** Changement de statut : + référent cadre. */
  canEditStatus?: boolean;
  myTrainerId: string | null;
  /** Heure de Paris (en cours / terminée). */
  nowKey?: string;
  rows: Row[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [mine, setMine] = useState(false);
  const router = useRouter();
  // Changements instantanés à l'écran (statut, suppression), confirmés ensuite par le serveur.
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const now = new Date().toISOString();
  const filtered = useMemo(() => {
    const list = rows.filter((s) => {
      if (hidden.has(s.id)) return false;
      if (period === 'upcoming' && s.end_at < now) return false;
      if (period === 'past' && s.end_at >= now) return false;
      if (status && s.status !== status) return false;
      if (mine && s.trainer_id !== myTrainerId) return false;
      if (!query) return true;
      const hay = `${s.title} ${one(s.trainers)?.full_name ?? ''} ${one(s.rooms)?.name ?? ''}`.toLowerCase();
      return hay.includes(query.toLowerCase());
    });
    return period === 'upcoming' ? [...list].reverse() : list;
  }, [rows, query, status, period, mine, myTrainerId, now, hidden]);

  function handleStatus(id: string, value: string) {
    setError(null);
    const before = localStatus[id];
    setLocalStatus((s) => ({ ...s, [id]: value }));
    startTransition(async () => {
      const result = await updateSessionStatus(id, value);
      if (!result.ok) {
        setError(result.error);
        setLocalStatus((s) => ({ ...s, [id]: before as string }));
      } else router.refresh();
    });
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`Supprimer définitivement la session « ${title} » ?`)) return;
    setError(null);
    setHidden((h) => new Set(h).add(id));
    startTransition(async () => {
      const result = await deleteSession(id);
      if (!result.ok) {
        setError(result.error);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(id);
          return n;
        });
      } else router.refresh();
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
        <>
        <p className="hint" style={{ margin: '0 0 8px' }}>Clique sur une session (ou sur « {isAdmin ? 'Modifier' : 'Ouvrir'} ») pour voir sa fiche{isAdmin ? ', la modifier et ajouter les stagiaires' : ''}.</p>
        <div className="table-wrap">
          <table className="data sessions-list">
            <thead>
              <tr>
                <th>Statut</th>
                <th>Formation</th>
                <th>Formateur</th>
                <th>Salle</th>
                <th>Dates</th>
                <th className="num">Stag.</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const trainer = one(s.trainers);
                const room = one(s.rooms);
                const validated = (s.session_trainees || []).filter((t) => t.status === 'validee').length + ((s as any).reserved || 0);
                return (
                  <tr
                    key={s.id}
                    className="row-link"
                    onClick={(e) => {
                      // Toute la ligne ouvre la fiche, sauf les commandes (statut, boutons).
                      if ((e.target as HTMLElement).closest('a, button, select, input, label')) return;
                      router.push(`/sessions/${s.id}`);
                    }}
                  >
                    <td>
                      {canEditStatus ? (
                        <select
                          aria-label={`Statut de ${s.title}`}
                          className="input"
                          value={localStatus[s.id] ?? s.status}
                          onChange={(e) => handleStatus(s.id, e.target.value)}
                          disabled={isPending}
                        >
                          {SESSION_STATUSES.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <SessionStatus status={s.status} startAt={s.start_at} endAt={s.end_at} nowKey={nowKey} />
                      )}
                    </td>
                    <td className="col-title"><Link href={`/sessions/${s.id}`} className="row-title" title={s.title}>{s.title}</Link></td>
                    <td className="col-trainer">
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
                    <td>{datesLabel(s.start_at, s.end_at)}</td>
                    <td className="num" title={(s as any).reserved ? `dont ${(s as any).reserved} place(s) réservée(s) sans nom` : undefined}>{validated}{s.max_trainees != null ? ` / ${s.max_trainees}` : ''}</td>
                    <td className="col-actions">
                      <span className="row-actions">
                      <Link href={`/sessions/${s.id}`} className="btn small">
                        {isAdmin ? <><Pencil size={14} aria-hidden /> Modifier</> : <>Ouvrir <ChevronRight size={14} aria-hidden /></>}
                      </Link>
                      {isAdmin && (
                        <button
                          className="danger small icon"
                          onClick={() => handleDelete(s.id, s.title)}
                          disabled={isPending}
                          aria-label={`Supprimer ${s.title}`}
                          title="Supprimer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
}
