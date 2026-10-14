import Link from 'next/link';
import { Briefcase, GraduationCap } from 'lucide-react';
import { mondaysBetween, frShort, type PoecPeriod } from '@/lib/poec';
import type { ProgramSession } from '@/lib/poec-data';
import { formatHours } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

const plus = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Programme du parcours semaine par semaine : formations (sessions du
 * planning) et périodes de stage en entreprise.
 */
export function ProgramTimeline({
  start,
  end,
  sessions,
  periods,
  linkSessions = false,
}: {
  start: string;
  end: string;
  sessions: ProgramSession[];
  periods: PoecPeriod[];
  linkSessions?: boolean;
}) {
  const weeks = mondaysBetween(start, end);
  let total = 0;
  return (
    <ol className="poec-weeks">
      {weeks.map((monday, i) => {
        const friday = plus(monday, 4);
        const ws = sessions.filter((s) => s.start_at.slice(0, 10) <= friday && s.end_at.slice(0, 10) >= monday);
        const wp = periods.filter((p) => p.start_date <= friday && p.end_date >= monday);
        const hours = ws.filter((s) => s.start_at.slice(0, 10) >= monday).reduce((n, s) => n + s.hours, 0);
        total += hours;
        return (
          <li key={monday} className={!ws.length && !wp.length ? 'is-empty' : ''}>
            <div className="poec-week-head">
              <strong>Semaine {i + 1}</strong>
              <span>{dm(monday)} → {dm(friday)}</span>
            </div>
            <div className="poec-week-items">
              {wp.map((p) => (
                <div key={p.id} className="poec-item stage">
                  <Briefcase size={14} aria-hidden />
                  <span><strong>{p.label}</strong> · du {frShort(p.start_date)} au {frShort(p.end_date)}</span>
                </div>
              ))}
              {ws.map((s) => {
                const body = (
                  <>
                    <GraduationCap size={14} aria-hidden />
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.start_at.slice(0, 10) === s.end_at.slice(0, 10)
                          ? frShort(s.start_at)
                          : `du ${frShort(s.start_at)} au ${frShort(s.end_at)}`}
                        {' · '}{formatHours(s.hours)}
                        {s.trainer ? ` · ${s.trainer}` : ''}
                        {s.room ? ` · ${s.room}` : ''}
                      </small>
                    </span>
                  </>
                );
                return linkSessions ? (
                  <Link key={s.id} href={`/sessions/${s.id}`} className="poec-item" style={{ ['--c' as any]: s.trainerColor || DEFAULT_TRAINER_COLOR }}>
                    {body}
                  </Link>
                ) : (
                  <div key={s.id} className="poec-item" style={{ ['--c' as any]: s.trainerColor || DEFAULT_TRAINER_COLOR }}>
                    {body}
                  </div>
                );
              })}
              {!ws.length && !wp.length && <span className="hint">Rien de prévu pour l’instant.</span>}
            </div>
          </li>
        );
      })}
      <li className="poec-total">
        <strong>Total en centre</strong> <span>{formatHours(Math.round(total * 10) / 10)}</span>
      </li>
    </ol>
  );
}
