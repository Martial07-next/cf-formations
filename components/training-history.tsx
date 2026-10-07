import Link from 'next/link';
import { formatSessionPeriod, formatHours, isMultiDay } from '@/lib/week';
import { SESSION_STATUS_LABEL } from '@/lib/status';

export type HistoryEntry = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  roomName: string | null;
  trainerName: string | null;
  color: string | null;
  hours: number;
  /** Ligne secondaire (ex. "12 stagiaires") */
  extra?: string | null;
  /** Statut d'inscription du stagiaire (historique stagiaire) */
  enrollmentStatus?: 'validee' | 'en_attente';
};

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  return (
    <Link href={`/sessions/${entry.id}`} className="history-card" style={entry.color ? { ['--c' as any]: entry.color } : undefined}>
      <div className="history-date">
        {!isMultiDay(entry.start_at, entry.end_at) && <>{entry.start_at.slice(0, 10).split('-').reverse().join('/')}<br /></>}
        {formatSessionPeriod(entry.start_at, entry.end_at)}
      </div>
      <div className="history-body">
        <strong>{entry.title}</strong>
        <span className="history-meta">
          {entry.roomName || 'Salle non définie'}
          {entry.trainerName && ` · ${entry.trainerName}`}
          {entry.extra && ` · ${entry.extra}`}
        </span>
      </div>
      <div className="history-side">
        {entry.enrollmentStatus ? (
          <span className={`badge ${entry.enrollmentStatus}`}>{entry.enrollmentStatus === 'validee' ? 'Validé' : 'En attente'}</span>
        ) : (
          <span className={`status-pill ${entry.status}`}>{SESSION_STATUS_LABEL[entry.status] ?? entry.status}</span>
        )}
        <span className="history-hours">{formatHours(entry.hours)}</span>
      </div>
    </Link>
  );
}

export function TrainingHistory({ entries, emptyLabel }: { entries: HistoryEntry[]; emptyLabel: string }) {
  const now = new Date().toISOString();
  const upcoming = entries.filter((e) => e.end_at >= now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = entries.filter((e) => e.end_at < now).sort((a, b) => b.start_at.localeCompare(a.start_at));

  return (
    <div className="panel">
      <h2>Historique de formations</h2>
      {entries.length === 0 ? (
        <p className="empty">{emptyLabel}</p>
      ) : (
        <>
          <h3 className="sub-heading" style={{ marginTop: 4 }}>À venir ({upcoming.length})</h3>
          {upcoming.length === 0 ? (
            <p className="hint">Aucune formation à venir.</p>
          ) : (
            <div className="history-list">
              {upcoming.map((e) => <HistoryCard key={e.id} entry={e} />)}
            </div>
          )}

          <h3 className="sub-heading">Réalisées ({past.length})</h3>
          {past.length === 0 ? (
            <p className="hint">Aucune formation passée.</p>
          ) : (
            <div className="history-list">
              {past.map((e) => <HistoryCard key={e.id} entry={e} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
