'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSession } from '@/app/sessions/actions';
import {
  addDays,
  isoDate,
  weekDayLabels,
  weekRangeLabel,
  monthWeekGrid,
  monthLabel,
  isSameMonth,
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
  trainers: { full_name: string } | { full_name: string }[] | null;
  rooms?: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const statusLabel: Record<string, string> = { confirmee: 'Confirmée', planifiee: 'Planifiée', brouillon: 'Brouillon' };

export function Planning({
  view,
  isAdmin,
  rooms,
  trainers,
  templates,
  sessions,
  mondayIso,
  monthAnchorIso,
}: {
  view: 'week' | 'month';
  isAdmin: boolean;
  rooms: Room[];
  trainers: Trainer[];
  templates: Template[];
  sessions: SessionRow[];
  mondayIso: string;
  monthAnchorIso: string;
}) {
  const monday = new Date(mondayIso + 'T00:00:00Z');
  const monthAnchor = new Date(monthAnchorIso + 'T00:00:00Z');
  const days = weekDayLabels(monday);
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

  function dayIndexOf(iso: string) {
    const d = new Date(iso);
    return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - monday.getTime()) / 86400000);
  }
  function hourOf(iso: string) {
    const d = new Date(iso);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/?${params.toString()}`);
  }

  function goToWeek(offsetDays: number) {
    setParam('week', isoDate(addDays(monday, offsetDays)));
  }

  function switchView(next: 'week' | 'month') {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    router.push(`/?${params.toString()}`);
  }

  function goToMonth(offsetMonths: number) {
    const d = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + offsetMonths, 1));
    const params = new URLSearchParams(searchParams);
    params.set('view', 'month');
    params.set('month', isoDate(d).slice(0, 7));
    router.push(`/?${params.toString()}`);
  }

  function goToday() {
    const params = new URLSearchParams(searchParams);
    params.delete('week');
    params.delete('month');
    router.push(`/?${params.toString()}`);
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

  const weeks = view === 'month' ? monthWeekGrid(monthAnchor) : [];
  const monthDayLabels = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];

  return (
    <section className="content">
      <header>
        <div>
          <p className="eyebrow">Organisation des formations</p>
          <h1>Planning des salles</h1>
          <p>Vue {view === 'week' ? 'semaine, salle par salle' : 'mois, compacte'}, avec détection automatique des conflits.</p>
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
              <label>
                Modèle
                <select name="template_id">
                  <option value="">—</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Début
                <input name="start_at" type="datetime-local" required />
              </label>
              <label>
                Fin
                <input name="end_at" type="datetime-local" required />
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
            <div className="row-actions">
              <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" onClick={() => setShowForm(false)}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <div className="period">
          {view === 'week' ? (
            <>
              <button onClick={() => goToWeek(-7)} aria-label="Semaine précédente">‹</button>
              <strong>{weekRangeLabel(monday)}</strong>
              <button onClick={() => goToWeek(7)} aria-label="Semaine suivante">›</button>
            </>
          ) : (
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
          <button className={view === 'week' ? 'active' : ''} onClick={() => switchView('week')}>Semaine</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => switchView('month')}>Mois</button>
        </div>
      </div>

      {message && (
        <div role="alert" className={`alert ${message.isError ? 'alert-error' : ''}`}>
          {message.text}
        </div>
      )}

      <div className="availability">
        <strong>Salles</strong>
        <span>{rooms.length} salles actives</span>
        <Link href="/salles">Consulter</Link>
      </div>

      {view === 'week' ? (
        <>
          <div className="schedule">
            <div className="corner">Salles</div>
            {days.map((d) => (
              <div className="day" key={d}>{d}</div>
            ))}
            {rooms.map((room) => (
              <div className="row" key={room.id}>
                <div className="room">
                  <strong>{room.name}</strong>
                  <small>{room.capacity} places</small>
                </div>
                {days.map((_, dayIdx) => (
                  <div className="cell" key={dayIdx}>
                    {shown
                      .filter((s) => s.room_id === room.id && dayIndexOf(s.start_at) === dayIdx)
                      .map((s) => {
                        const start = hourOf(s.start_at);
                        const end = hourOf(s.end_at);
                        const trainer = one(s.trainers)?.full_name;
                        return (
                          <article
                            key={s.id}
                            className={`event ${s.status}`}
                            style={{ top: `${(start - 8) * 22}px`, height: `${(end - start) * 22}px` }}
                          >
                            <strong>{s.title}</strong>
                            <span>{start}h–{end}h{trainer ? ` · ${trainer}` : ''}</span>
                            <em>{statusLabel[s.status]}</em>
                          </article>
                        );
                      })}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="legend">
            <i className="confirmed" /> Confirmée <i className="planned" /> Planifiée <i className="draft" /> Brouillon · Les chevauchements de salles et de formateurs sont bloqués.
          </p>
        </>
      ) : (
        <>
          <div className="month-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 8 }}>
            {monthDayLabels.map((d) => (
              <div className="month-day-label" key={d}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="month-grid" key={wi} style={{ marginBottom: 10 }}>
              {week.map((day) => {
                const dayIso = isoDate(day);
                const daySessions = shown.filter((s) => s.start_at.slice(0, 10) === dayIso);
                const visible = daySessions.slice(0, 4);
                const extra = daySessions.length - visible.length;
                const muted = !isSameMonth(day, monthAnchor);
                return (
                  <div className={`month-cell${muted ? ' muted' : ''}`} key={dayIso} style={muted ? { opacity: 0.45 } : undefined}>
                    <span className="date-num">{day.getUTCDate()}</span>
                    {visible.map((s) => {
                      const room = one(s.rooms)?.name || '—';
                      return (
                        <div key={s.id} className={`month-chip ${s.status}`}>
                          <span className="chip-room">{room}</span>
                          <span className="chip-title">{s.title}</span>
                        </div>
                      );
                    })}
                    {extra > 0 && <span className="month-more">+{extra} autre{extra > 1 ? 's' : ''}</span>}
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
