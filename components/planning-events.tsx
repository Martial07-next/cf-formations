'use client';

import { useState, useTransition } from 'react';
import { MapPin, Utensils, Award, Handshake, Megaphone, Pin, CalendarOff, X, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { createEvent, updateEvent, deleteEvent } from '@/app/evenements/actions';
import { EVENT_KINDS, EVENT_KIND, eventTimeLabel, type EventKind, type PlanningEvent } from '@/lib/events';
import { absenceText, type Absence } from '@/lib/absences';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

type Trainer = { id: string; full_name: string; color: string | null; status?: string | null };

const ICONS: Record<EventKind, typeof MapPin> = {
  externe: MapPin,
  repas: Utensils,
  examen: Award,
  recrutement: Handshake,
  forum: Megaphone,
  autre: Pin,
};

export function EventIcon({ kind, size = 12 }: { kind: EventKind; size?: number }) {
  const Icon = ICONS[kind] || Pin;
  return <Icon size={size} aria-hidden />;
}

/**
 * Aperçu compact d'une journée : évènements (icône + intitulé court) et
 * formateurs en congé. Un clic ouvre le détail.
 */
export function DayChips({
  events,
  absentCount,
  compact = false,
  onOpen,
}: {
  events: PlanningEvent[];
  absentCount: number;
  compact?: boolean;
  onOpen: () => void;
}) {
  if (!events.length && !absentCount) return null;
  const shown = compact ? [] : events.slice(0, 2);
  const rest = events.length - shown.length;
  return (
    <button type="button" className={`day-chips${compact ? ' compact' : ''}`} onClick={onOpen} title="Voir les évènements et congés du jour">
      {shown.map((e) => (
        <span key={e.id} className="day-chip" style={{ ['--k' as any]: EVENT_KIND[e.kind]?.color }}>
          <EventIcon kind={e.kind} /> <span className="day-chip-text">{e.title}</span>
        </span>
      ))}
      {compact &&
        events.slice(0, 4).map((e) => (
          <span key={e.id} className="day-chip icon-only" style={{ ['--k' as any]: EVENT_KIND[e.kind]?.color }} aria-label={e.title}>
            <EventIcon kind={e.kind} />
          </span>
        ))}
      {!compact && rest > 0 && <span className="day-chip more">+{rest}</span>}
      {compact && events.length > 4 && <span className="day-chip more">+{events.length - 4}</span>}
      {absentCount > 0 && (
        <span className="day-chip absent">
          <CalendarOff size={12} aria-hidden /> {absentCount}
          {!compact && ` en congé`}
        </span>
      )}
    </button>
  );
}

function frDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Détail d'une journée : évènements et congés, avec ajout / modification. */
export function DayDetails({
  day,
  events,
  absences,
  trainers,
  canEdit,
  onEdit,
  onAdd,
  onClose,
}: {
  day: string;
  events: PlanningEvent[];
  absences: Absence[];
  trainers: Trainer[];
  canEdit: boolean;
  onEdit: (e: PlanningEvent) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const name = (id: string) => trainers.find((t) => t.id === id);

  return (
    <>
      <div className="modal-head">
        <h2 style={{ textTransform: 'capitalize' }}>{frDay(day)}</h2>
        <button className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="modal-body" style={{ paddingBottom: 18 }}>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <h3 className="sub-heading" style={{ marginTop: 0 }}>Évènements</h3>
        {events.length === 0 && <p className="hint">Aucun évènement ce jour.</p>}
        <div className="event-list">
          {events.map((e) => (
            <article key={e.id} className="event-item" style={{ ['--k' as any]: EVENT_KIND[e.kind]?.color }}>
              <div className="event-item-head">
                <span className="event-kind"><EventIcon kind={e.kind} size={14} /> {EVENT_KIND[e.kind]?.label}</span>
                {canEdit && (
                  <span className="row-actions">
                    <button className="small icon ghost" aria-label={`Modifier ${e.title}`} onClick={() => onEdit(e)}><Pencil size={14} /></button>
                    <button
                      className="small icon ghost"
                      aria-label={`Supprimer ${e.title}`}
                      disabled={isPending}
                      onClick={() =>
                        confirm(`Supprimer l’évènement « ${e.title} » ?`) &&
                        startTransition(async () => {
                          const res = await deleteEvent(e.id);
                          if (!res.ok) setError(res.error);
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>
              <strong>{e.title}</strong>
              <span className="hint">
                {e.start_date === e.end_date ? '' : `Du ${e.start_date.split('-').reverse().join('/')} au ${e.end_date.split('-').reverse().join('/')} · `}
                {eventTimeLabel(e)}
                {e.location ? ` · ${e.location}` : ''}
              </span>
              {(e.trainer_ids.length > 0 || e.participants) && (
                <span className="event-people">
                  <Users size={13} aria-hidden />
                  {e.trainer_ids.map((id) => {
                    const t = name(id);
                    return t ? (
                      <span key={id} className="trainer-tag" style={{ fontWeight: 600 }}>
                        <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                        {t.full_name}
                      </span>
                    ) : null;
                  })}
                  {e.participants && <span>{e.participants}</span>}
                </span>
              )}
              {e.notes && <p className="hint" style={{ margin: '4px 0 0' }}>{e.notes}</p>}
            </article>
          ))}
        </div>

        <h3 className="sub-heading">Congés et absences</h3>
        {absences.length === 0 ? (
          <p className="hint">Personne n’est en congé ce jour.</p>
        ) : (
          <div className="check-grid">
            {absences.map((a) => {
              const t = name(a.trainer_id);
              return (
                <span key={a.id} className="workshop-chip" style={{ paddingRight: 12, fontWeight: 600 }}>
                  <span className="swatch" style={{ background: t?.color || DEFAULT_TRAINER_COLOR, marginRight: 6 }} aria-hidden />
                  {t?.full_name || 'Formateur'} · {absenceText(a)}
                </span>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div style={{ marginTop: 16 }}>
            <button className="small primary" onClick={onAdd}><Plus size={14} aria-hidden /> Ajouter un évènement ce jour</button>
          </div>
        )}
      </div>
    </>
  );
}

/** Formulaire d'évènement (création / modification). Aucun blocage des sessions. */
export function EventForm({
  event,
  defaultDay,
  trainers,
  onDone,
  onCancel,
}: {
  event?: PlanningEvent | null;
  defaultDay?: string;
  trainers: Trainer[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(event ? !event.start_time : true);
  const [start, setStart] = useState(event?.start_date || defaultDay || '');
  const [end, setEnd] = useState(event?.end_date || defaultDay || '');
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <div className="modal-head">
        <h2>{event ? 'Modifier l’évènement' : 'Nouvel évènement'}</h2>
        <button className="icon ghost" onClick={onCancel} aria-label="Fermer"><X size={18} /></button>
      </div>
      <form
        className="modal-body"
        style={{ paddingBottom: 18 }}
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const res = event ? await updateEvent(event.id, fd) : await createEvent(fd);
            if (!res.ok) setError(res.error);
            else onDone();
          });
        }}
      >
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <p className="hint" style={{ marginTop: 0 }}>
          Information affichée en aperçu sur le planning : elle ne bloque aucune session de formation.
        </p>
        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="field">
            Type
            <div className="status-choice" role="radiogroup" aria-label="Type d’évènement">
              {EVENT_KINDS.map((k) => (
                <label key={k.value}>
                  <input type="radio" name="kind" value={k.value} defaultChecked={(event?.kind || 'externe') === k.value} />
                  <span className="event-kind" style={{ ['--k' as any]: k.color }}><EventIcon kind={k.value} size={14} /> {k.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="form-row">
          <label style={{ gridColumn: 'span 2' }}>
            Intitulé
            <input name="title" required defaultValue={event?.title || ''} placeholder="Ex. Repas groupe Airbus, Passage CACES R489…" />
          </label>
          <label>
            Lieu
            <input name="location" defaultValue={event?.location || ''} placeholder="Optionnel" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Du
            <input
              name="start_date"
              type="date"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || end < e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <label>
            Au (inclus)
            <input name="end_date" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="radio-inline" style={{ alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Journée entière
          </label>
        </div>
        {!allDay && (
          <div className="form-row">
            <label>
              De
              <input name="start_time" type="time" step={300} defaultValue={event?.start_time?.slice(0, 5) || '12:00'} />
            </label>
            <label>
              À
              <input name="end_time" type="time" step={300} defaultValue={event?.end_time?.slice(0, 5) || '14:00'} />
            </label>
          </div>
        )}
        <div className="field" style={{ marginBottom: 14 }}>
          Formateurs concernés (facultatif)
          <div className="check-grid">
            {trainers
              .filter((t) => t.status !== 'inactif')
              .map((t) => (
                <label key={t.id} className="check-chip">
                  <input type="checkbox" name="trainer_ids" value={t.id} defaultChecked={event?.trainer_ids.includes(t.id)} />
                  <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                  {t.full_name}
                </label>
              ))}
          </div>
        </div>
        <div className="form-row">
          <label>
            Autres participants
            <input name="participants" defaultValue={event?.participants || ''} placeholder="Ex. Bureau administratif, groupe de 12 stagiaires…" />
          </label>
          <label>
            Notes
            <input name="notes" defaultValue={event?.notes || ''} placeholder="Optionnel" />
          </label>
        </div>
        <div className="row-actions">
          <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
          <button type="button" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </>
  );
}
