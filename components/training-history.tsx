'use client';

import { formatSessionPeriod } from '@/lib/week';

type Entry = {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  start_at: string;
  end_at: string;
  roomName: string | null;
  trainerName: string | null;
  enrollmentStatus: 'validee' | 'en_attente';
};

function TimelineCard({ entry }: { entry: Entry }) {
  return (
    <a href={`/sessions/${entry.id}`} className="history-card">
      <div className="history-date">{formatSessionPeriod(entry.start_at, entry.end_at)}</div>
      <div className="history-body">
        <strong>{entry.title}</strong>
        <span className="history-meta">
          {entry.roomName || 'Salle non définie'}
          {entry.trainerName && ` · ${entry.trainerName}`}
        </span>
      </div>
      <span className={`badge ${entry.enrollmentStatus}`}>
        {entry.enrollmentStatus === 'validee' ? 'Validé' : 'En attente'}
      </span>
    </a>
  );
}

export function TrainingHistory({ entries }: { entries: Entry[] }) {
  const now = new Date().toISOString();
  const upcoming = entries.filter((e) => e.end_at >= now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = entries.filter((e) => e.end_at < now).sort((a, b) => b.start_at.localeCompare(a.start_at));

  return (
    <div className="panel">
      <h2>Historique de formations</h2>
      {entries.length === 0 ? (
        <p className="empty">Ce stagiaire n'est inscrit à aucune formation pour l'instant.</p>
      ) : (
        <>
          <h3 className="sub-heading" style={{ marginTop: 4 }}>À venir</h3>
          {upcoming.length === 0 ? (
            <p className="empty">Aucune formation à venir.</p>
          ) : (
            <div className="history-list">
              {upcoming.map((e) => <TimelineCard key={e.id} entry={e} />)}
            </div>
          )}

          <h3 className="sub-heading">Passées</h3>
          {past.length === 0 ? (
            <p className="empty">Aucune formation passée.</p>
          ) : (
            <div className="history-list">
              {past.map((e) => <TimelineCard key={e.id} entry={e} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
