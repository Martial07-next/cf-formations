import Link from 'next/link';
import { PHASE_LABEL, sessionPhase } from '@/lib/session-phase';
import { CalendarCheck, Clock, MapPin, Users } from 'lucide-react';

export type MySession = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  room: string | null;
  location: string | null;
  trainees: number;
  /** Jours où il remplace le formateur prévu (sinon : sa session). */
  replacementDays: string[];
};

const day = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Formateur : ses formations en premier sur le planning (en cours et à venir),
 * avec la salle bien visible ; le planning des collègues suit en dessous.
 */
export function MySessions({ sessions, nowKey }: { sessions: MySession[]; nowKey: string }) {
  return (
    <section className="my-sessions" aria-labelledby="my-sessions-title">
      <h2 id="my-sessions-title"><CalendarCheck size={18} aria-hidden /> Mes formations</h2>
      {!sessions.length ? (
        <p className="hint" style={{ margin: 0 }}>Aucune formation prévue pour toi pour l’instant.</p>
      ) : (
        <ul>
          {sessions.map((s) => {
            const phase = sessionPhase(s.start_at, s.end_at, nowKey);
            const live = phase === 'en-cours';
            const oneDay = s.start_at.slice(0, 10) === s.end_at.slice(0, 10);
            return (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className={`my-session${live ? ' live' : ''}${phase === 'terminee' ? ' ended' : ''}`}>
                  <span className="my-session-when">
                    {phase && <span className={`status-pill ${phase}`}>{PHASE_LABEL[phase]}</span>}
                    {oneDay ? day(s.start_at) : `${day(s.start_at)} → ${day(s.end_at)}`}
                  </span>
                  <strong className="my-session-title">{s.title}</strong>
                  <span className="my-session-room">
                    <MapPin size={15} aria-hidden /> {s.room || 'Salle à définir'}
                    {s.location && <small> · {s.location}</small>}
                  </span>
                  <span className="my-session-meta">
                    <span><Clock size={13} aria-hidden /> {s.start_at.slice(11, 16)} – {s.end_at.slice(11, 16)}</span>
                    <span><Users size={13} aria-hidden /> {s.trainees} stagiaire{s.trainees > 1 ? 's' : ''}</span>
                    {s.replacementDays.length > 0 && <span className="my-repl">Remplacement : {s.replacementDays.map(day).join(', ')}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="my-sessions-next">Planning de toute l’équipe ci-dessous</p>
    </section>
  );
}
