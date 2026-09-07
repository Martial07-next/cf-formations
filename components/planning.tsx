'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSession } from '@/app/sessions/actions';
import { addDays, isoDate, weekDayLabels, weekRangeLabel } from '@/lib/week';

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
};

function trainerName(t: SessionRow['trainers']): string | null {
  if (!t) return null;
  return Array.isArray(t) ? t[0]?.full_name ?? null : t.full_name;
}

const statusLabel: Record<string, string> = { confirmee: 'Confirmée', planifiee: 'Planifiée', brouillon: 'Brouillon' };

export function Planning({
  isAdmin,
  rooms,
  trainers,
  templates,
  sessions,
  mondayIso,
}: {
  isAdmin: boolean;
  rooms: Room[];
  trainers: Trainer[];
  templates: Template[];
  sessions: SessionRow[];
  mondayIso: string;
}) {
  const monday = new Date(mondayIso + 'T00:00:00Z');
  const days = weekDayLabels(monday);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const shown = useMemo(
    () =>
      sessions.filter(
        (s) => !filter || `${s.title} ${trainerName(s.trainers) ?? ''}`.toLowerCase().includes(filter.toLowerCase())
      ),
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

  function goToWeek(offsetDays: number) {
    const target = isoDate(addDays(monday, offsetDays));
    const params = new URLSearchParams(searchParams);
    params.set('week', target);
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

  return (
    <section className="content">
      <header>
        <div>
          <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
          <h1>Planning des salles</h1>
        </div>
        {isAdmin && <button onClick={() => setShowForm((v) => !v)}>+ Nouvelle session</button>}
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
              <button type="submit" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" onClick={() => setShowForm(false)}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="toolbar">
        <div className="period">
          <button onClick={() => goToWeek(-7)} aria-label="Semaine précédente">‹</button>
          <strong>{weekRangeLabel(monday)}</strong>
          <button onClick={() => goToWeek(7)} aria-label="Semaine suivante">›</button>
          <button onClick={() => router.push('/')}>Aujourd’hui</button>
        </div>
        <input
          aria-label="Rechercher"
          placeholder="Rechercher une formation…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Link href="/sessions" className="week">Vue liste</Link>
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
                    const trainer = trainerName(s.trainers);
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
    </section>
  );
}
