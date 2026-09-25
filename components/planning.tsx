'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSession } from '@/app/sessions/actions';
import {
  addDays,
  isoDate,
  weekDayRows,
  weekRangeLabel,
  monthWeekGrid,
  monthLabel,
  isSameMonth,
  dayIsInRange,
  effectiveDayTime,
  type DayOverride,
  fullDateLabel,
} from '@/lib/week';

type Room = { id: string; name: string; capacity: number };
type Trainer = { id: string; full_name: string };
type Template = { id: string; title: string; duration_hours: number };
type SessionRow = {
  id: string;
  title: string;
  status: 'confirmee' | 'planifiee' | 'brouillon';
  start_at: string;
  end_at: string;
  room_id: string;
  trainer_id: string | null;
  max_trainees: number | null;
  trainers: { full_name: string } | { full_name: string }[] | null;
  rooms?: { name: string } | { name: string }[] | null;
  session_trainees?: { status: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function validatedCount(s: SessionRow): number {
  return (s.session_trainees || []).filter((t) => t.status === 'validee').length;
}

const statusLabel: Record<string, string> = { confirmee: 'Confirmée', planifiee: 'Planifiée', brouillon: 'Brouillon' };

export function Planning({
  view,
  isAdmin,
  rooms,
  trainers,
  templates,
  sessions,
  dayOverrides,
  mondayIso,
  monthAnchorIso,
  dayIso,
}: {
  view: 'day' | 'week' | 'month';
  isAdmin: boolean;
  rooms: Room[];
  trainers: Trainer[];
  templates: Template[];
  sessions: SessionRow[];
  dayOverrides: Record<string, DayOverride[]>;
  mondayIso: string;
  monthAnchorIso: string;
  dayIso: string;
}) {
  const monday = new Date(mondayIso + 'T00:00:00Z');
  const monthAnchor = new Date(monthAnchorIso + 'T00:00:00Z');
  const dayAnchor = new Date(dayIso + 'T00:00:00Z');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const shown = useMemo(
    () =>
      sessions.filter((s) => {
        if (!filter) return true;
        const trainer = one(s.trainers)?.full_name ?? '';
        return `${s.title} ${trainer}`.toLowerCase().includes(filter.toLowerCase());
      }),
    [sessions, filter]
  );

  function setParams(mut: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    mut(params);
    router.push(`/?${params.toString()}`);
  }

  function goToWeek(offsetDays: number) {
    setParams((p) => {
      p.set('view', 'week');
      p.set('week', isoDate(addDays(monday, offsetDays)));
    });
  }

  function goToDay(offsetDays: number) {
    let d = addDays(dayAnchor, offsetDays);
    const weekday = d.getUTCDay(); // 0=dim, 6=sam
    if (weekday === 6) d = addDays(d, offsetDays > 0 ? 2 : -1);
    else if (weekday === 0) d = addDays(d, offsetDays > 0 ? 1 : -2);
    setParams((p) => {
      p.set('view', 'day');
      p.set('day', isoDate(d));
    });
  }

  function goToMonth(offsetMonths: number) {
    const d = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + offsetMonths, 1));
    setParams((p) => {
      p.set('view', 'month');
      p.set('month', isoDate(d).slice(0, 7));
    });
  }

  function switchView(next: 'day' | 'week' | 'month') {
    setParams((p) => p.set('view', next));
  }

  function goToday() {
    setParams((p) => {
      p.delete('week');
      p.delete('month');
      p.delete('day');
    });
  }

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createSession(formData);
      if (result.ok) {
        setMessage({ text: 'Session ajoutée.', isError: false });
        setShowForm(false);
      } else {
        setMessage({ text: result.error, isError: true });
      }
    });
  }

  const dayRows = view === 'day' ? [{ iso: dayIso, full: fullDateLabel(dayAnchor), short: '', dateLabel: '' }] : weekDayRows(monday);
  const weeks = view === 'month' ? monthWeekGrid(monthAnchor) : [];
  const monthDayLabels = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];

  function sessionsFor(dayIso: string, roomId: string) {
    return shown.filter((s) => s.room_id === roomId && dayIsInRange(dayIso, s.start_at, s.end_at));
  }

  function SessionCard({ s, dIso }: { s: SessionRow; dIso: string }) {
    const isStart = s.start_at.slice(0, 10) === dIso;
    const trainer = one(s.trainers)?.full_name;
    const count = validatedCount(s);
    const { start, end } = effectiveDayTime(dIso, s.start_at, s.end_at, dayOverrides[s.id] || []);
    const timeLabel = `${start} → ${end}`;
    return (
      <Link href={`/sessions/${s.id}`} className={`session-card ${s.status}${isStart ? '' : ' continuation'}`}>
        <span className="sc-title">{isStart ? s.title : `↳ ${s.title}`}</span>
        <span className="sc-meta">
          <span>{timeLabel}</span>
          {trainer && <span>· {trainer}</span>}
          <span className="sc-count">{count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}</span>
        </span>
      </Link>
    );
  }

  return (
    <section className="content">
      <header>
        <div>
          <p className="eyebrow">Organisation des formations</p>
          <h1>Planning des salles</h1>
          <p>Vue {view === 'day' ? 'jour' : view === 'week' ? 'semaine' : 'mois'} — salles en colonnes, jours en lignes.</p>
        </div>
        {isAdmin && (
          <div className="header-actions">
            <button className="primary" onClick={() => setShowForm((v) => !v)}>+ Nouvelle session</button>
          </div>
        )}
      </header>

      {showForm && (
        <div className="panel">
          <h2>Nouvelle session</h2>
          <form action={handleCreate}>
            <div className="form-row">
              <label>
                Titre
                <input name="title" required placeholder="Ex. Habilitation électrique B0" />
              </label>
              <label>
                Référence
                <input name="reference" placeholder="Ex. HAB-B0-2026" />
              </label>
              <label>
                Salle
                <select name="room_id" required>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.capacity} places)</option>
                  ))}
                </select>
              </label>
              <label>
                Formateur
                <select name="trainer_id">
                  <option value="">—</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Modèle
                <select name="template_id">
                  <option value="">—</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Max. stagiaires
                <input name="max_trainees" type="number" min={0} />
              </label>
              <label>
                Statut
                <select name="status" defaultValue="planifiee">
                  <option value="brouillon">Brouillon</option>
                  <option value="planifiee">Planifiée</option>
                  <option value="confirmee">Confirmée</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Début (date + heure)
                <input name="start_at" type="datetime-local" required />
              </label>
              <label>
                Fin (date + heure)
                <input name="end_at" type="datetime-local" required />
              </label>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '-6px 0 12px' }}>
              Pour une formation sur plusieurs jours, choisis simplement une date de fin différente de la date de début.
            </p>
            <div className="row-actions">
              <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" onClick={() => setShowForm(false)}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <div className="period">
          {view === 'day' && (
            <>
              <button onClick={() => goToDay(-1)} aria-label="Jour précédent">‹</button>
              <strong style={{ textTransform: 'capitalize' }}>{fullDateLabel(dayAnchor)}</strong>
              <button onClick={() => goToDay(1)} aria-label="Jour suivant">›</button>
            </>
          )}
          {view === 'week' && (
            <>
              <button onClick={() => goToWeek(-7)} aria-label="Semaine précédente">‹</button>
              <strong>{weekRangeLabel(monday)}</strong>
              <button onClick={() => goToWeek(7)} aria-label="Semaine suivante">›</button>
            </>
          )}
          {view === 'month' && (
            <>
              <button onClick={() => goToMonth(-1)} aria-label="Mois précédent">‹</button>
              <strong style={{ textTransform: 'capitalize' }}>{monthLabel(monthAnchor)}</strong>
              <button onClick={() => goToMonth(1)} aria-label="Mois suivant">›</button>
            </>
          )}
          <button onClick={goToday}>Aujourd’hui</button>
        </div>
        <input
          aria-label="Rechercher"
          placeholder="Rechercher une formation…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="toggle-group">
          <button className={view === 'day' ? 'active' : ''} onClick={() => switchView('day')}>Jour</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => switchView('week')}>Semaine</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => switchView('month')}>Mois</button>
        </div>
      </div>

      {message && (
        <div role="alert" className={`alert ${message.isError ? 'alert-error' : ''}`}>
          {message.text}
        </div>
      )}

      {(view === 'day' || view === 'week') && (
        <>
          <div className="grid-scroll">
            <div className="plan-grid" style={{ gridTemplateColumns: `140px repeat(${rooms.length || 1}, minmax(160px, 1fr))` }}>
              <div className="plan-head" style={{ background: '#fff', borderLeft: 'none' }}>
                {view === 'day' ? 'Jour' : 'Jours'}
              </div>
              {rooms.map((r) => (
                <div className="plan-head" key={r.id}>{r.name}<br /><small style={{ fontWeight: 500 }}>{r.capacity} places</small></div>
              ))}

              {dayRows.map((d) => (
                <div key={d.iso} style={{ display: 'contents' }}>
                  <div className="plan-day-label">
                    {view === 'day' ? 'Aujourd’hui' : d.full}
                    <small>{view === 'day' ? d.iso : d.dateLabel}</small>
                  </div>
                  {rooms.map((r) => (
                    <div className="plan-cell" key={r.id}>
                      {sessionsFor(d.iso, r.id).map((s) => (
                        <SessionCard key={s.id} s={s} dIso={d.iso} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              {rooms.length === 0 && (
                <div className="plan-cell" style={{ gridColumn: '2 / -1' }}>
                  Aucune salle enregistrée — <Link href="/salles">ajoutes-en une</Link>.
                </div>
              )}
            </div>
          </div>
          <p className="legend" style={{ marginTop: 10 }}>
            <i className="confirmed" /> Confirmée <i className="planned" /> Planifiée <i className="draft" /> Brouillon · une formation qui se poursuit un jour suivant est marquée ↳
          </p>
        </>
      )}

      {view === 'month' && (
        <>
          <div className="month-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 8 }}>
            {monthDayLabels.map((d) => (
              <div className="month-day-label" key={d}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="month-grid" key={wi} style={{ marginBottom: 10 }}>
              {week.map((day) => {
                const dIso = isoDate(day);
                const daySessions = shown.filter((s) => dayIsInRange(dIso, s.start_at, s.end_at));
                const muted = !isSameMonth(day, monthAnchor);
                return (
                  <div className={`month-cell${muted ? ' muted' : ''}`} key={dIso} style={muted ? { opacity: 0.45 } : undefined}>
                    <span className="date-num">{day.getUTCDate()}</span>
                    {daySessions.map((s) => {
                      const room = one(s.rooms)?.name || '—';
                      const trainer = one(s.trainers)?.full_name;
                      const count = validatedCount(s);
                      return (
                        <Link key={s.id} href={`/sessions/${s.id}`} className={`month-chip ${s.status}`}>
                          <span className="chip-room">{room} — {s.title}</span>
                          {trainer && <span className="chip-trainer">{trainer}</span>}
                          <span className="chip-count">{count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="legend" style={{ marginTop: 10 }}>
            <i className="confirmed" /> Confirmée <i className="planned" /> Planifiée <i className="draft" /> Brouillon
          </p>
        </>
      )}
    </section>
  );
}
