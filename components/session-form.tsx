'use client';

import { useState } from 'react';
import { SESSION_STATUSES } from '@/lib/status';
import { formatHours } from '@/lib/week';
import { TemplatePicker } from '@/components/template-picker';
import { placeModules, frDay } from '@/lib/modules';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { planDays, trainingMinutes, splitHours, FULL_DAY_MINUTES } from '@/lib/schedule';

export type FormRoom = { id: string; name: string; capacity: number; is_holding?: boolean | null; location?: string | null };
export type FormTrainer = { id: string; full_name: string; color: string | null; status?: string | null };
export type FormTemplate = {
  id: string;
  title: string;
  category: string | null;
  duration_hours: number;
  max_trainees: number | null;
  /** Formateurs habilités (vide = tous). */
  trainer_ids?: string[];
  modules?: { name: string; duration_hours: number }[];
};

export type SessionFormDefaults = {
  title?: string;
  room_id?: string;
  trainer_id?: string | null;
  template_id?: string | null;
  status?: string;
  max_trainees?: number | null;
  notes?: string | null;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
};

function countWeekdays(startIso: string, endIso: string): number {
  if (!startIso) return 0;
  const start = new Date(startIso + 'T00:00:00Z');
  const end = new Date((endIso || startIso) + 'T00:00:00Z');
  let n = 0;
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Regroupe les formations du catalogue par dossier. */
export function groupByFolder<T extends { category: string | null; title: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = it.category?.trim() || 'Sans dossier';
    (map.get(key) || map.set(key, []).get(key)!).push(it);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'Sans dossier' ? 1 : b === 'Sans dossier' ? -1 : a.localeCompare(b, 'fr')))
    .map(([k, v]) => [k, v.sort((x, y) => x.title.localeCompare(y.title, 'fr'))]);
}

/**
 * Formulaire d'enregistrement d'une session : on choisit une formation du
 * catalogue (classée par dossier) qui pré-remplit nom, référence, durée et
 * nombre de places, puis la salle, le formateur, les dates et les horaires.
 */
export function SessionForm({
  rooms,
  trainers,
  templates,
  defaults = {},
  disabled = false,
  showTemplate = true,
  formId,
  absences = [],
  onSubmit,
}: {
  rooms: FormRoom[];
  trainers: FormTrainer[];
  templates: FormTemplate[];
  defaults?: SessionFormDefaults;
  disabled?: boolean;
  showTemplate?: boolean;
  formId?: string;
  absences?: Absence[];
  onSubmit: (fd: FormData) => void;
}) {
  const [templateId, setTemplateId] = useState(defaults.template_id || '');
  const [title, setTitle] = useState(defaults.title || '');
  const [maxTrainees, setMaxTrainees] = useState(defaults.max_trainees != null ? String(defaults.max_trainees) : '');
  const [startDate, setStartDate] = useState(defaults.start_date || '');
  const [manualEndDate, setManualEndDate] = useState(defaults.end_date || '');
  const [startTime, setStartTime] = useState(defaults.start_time || '09:00');
  const [manualEndTime, setManualEndTime] = useState(defaults.end_time || '17:00');
  // Durée totale (heures + minutes) : sert au calcul automatique des dates/horaires.
  const [durH, setDurH] = useState('');
  const [durM, setDurM] = useState('0');
  const [auto, setAuto] = useState(showTemplate);
  const [trainerId, setTrainerId] = useState(defaults.trainer_id || '');

  const template = templates.find((t) => t.id === templateId) || null;
  const trainer = trainers.find((t) => t.id === trainerId);

  const durationMinutes = (Number(durH) || 0) * 60 + (Number(durM) || 0);
  // Calcul intelligent : journées de 7 h, pause 12h–13h, week-ends sautés.
  const plan = auto && durationMinutes > 0 && startDate ? planDays(startDate, startTime, durationMinutes) : [];
  const fullDayEnd = plan.length ? plan[0].end : null;
  const endDate = plan.length ? plan[plan.length - 1].day : manualEndDate;
  const endTime = plan.length ? plan[0].end : manualEndTime;
  const trainerAbsence = trainerId && startDate ? absenceFor(absences, trainerId, startDate, endDate || startDate) : null;
  const lastDayEnd = plan.length > 1 && plan[plan.length - 1].end !== fullDayEnd ? plan[plan.length - 1].end : '';

  const days = countWeekdays(startDate, endDate);
  const dailyMinutes = trainingMinutes(startTime, endTime);
  const plannedMinutes = plan.length
    ? plan.reduce((n, d) => n + d.minutes, 0)
    : days > 0 && dailyMinutes > 0
      ? days * dailyMinutes
      : 0;
  const plannedHours = plannedMinutes / 60;

  function setDuration(hours: number) {
    const { h, m } = splitHours(hours);
    setDurH(String(h));
    setDurM(String(m));
    setAuto(true);
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setMaxTrainees(t.max_trainees != null ? String(t.max_trainees) : '');
    setDuration(Number(t.duration_hours));
    // Le formateur choisi n'est pas habilité pour cette formation : on le retire.
    if (t.trainer_ids?.length && trainerId && !t.trainer_ids.includes(trainerId)) setTrainerId('');
  }

  const physicalRooms = rooms.filter((r) => !r.is_holding);
  // « À affecter » n'est proposée que pour une session importée qui s'y trouve encore.
  const holdingRooms = rooms.filter((r) => r.is_holding && r.id === defaults.room_id);
  const qualified = template?.trainer_ids?.length ? template.trainer_ids : null;
  // Seuls les formateurs actifs — et, si la formation en définit, habilités — sont proposés.
  const activeTrainers = trainers.filter(
    (t) => (t.status !== 'inactif' && (!qualified || qualified.includes(t.id))) || t.id === defaults.trainer_id
  );
  const modulePlan = template?.modules?.length && startDate ? placeModules(startDate, startTime, template.modules) : [];

  return (
    <form id={formId} action={onSubmit}>
      <fieldset className="plain" disabled={disabled}>
        {showTemplate && (
          <div className="form-row">
            <div className="field">
              Formation du catalogue
              <TemplatePicker templates={templates} value={templateId} onChange={applyTemplate} />
              <input type="hidden" name="template_id" value={templateId} />
            </div>
          </div>
        )}

        <div className="form-row">
          <label>
            Nom de la formation
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Habilitation électrique B0" />
          </label>
        </div>

        <div className="form-row">
          <label>
            Salle
            <select name="room_id" required defaultValue={defaults.room_id || physicalRooms[0]?.id || ''}>
              {physicalRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.location ? `${r.location} — ` : ''}{r.name} ({r.capacity} places)</option>
              ))}
              {holdingRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="trainer-tag">
              Formateur
              {trainer && <span className="swatch" style={{ background: trainer.color || undefined }} aria-hidden />}
            </span>
            <select name="trainer_id" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">— Non attribué —</option>
              {activeTrainers.map((t) => {
                const off = startDate ? absenceFor(absences, t.id, startDate, endDate || startDate) : null;
                return (
                  <option key={t.id} value={t.id} disabled={Boolean(off) && t.id !== defaults.trainer_id}>
                    {t.full_name}{off ? ` — ${absenceText(off)}` : ''}
                  </option>
                );
              })}
            </select>
            {qualified && (
              <span className="hint">{activeTrainers.length} formateur{activeTrainers.length > 1 ? 's' : ''} habilité{activeTrainers.length > 1 ? 's' : ''} pour cette formation</span>
            )}
            {trainerAbsence && (
              <span className="field-error" role="alert">Indisponible : {trainer?.full_name} est {absenceText(trainerAbsence)}.</span>
            )}
          </label>
          <label>
            Places (max. stagiaires)
            <input name="max_trainees" type="number" min={0} inputMode="numeric" value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} />
          </label>
        </div>

        {showTemplate && (
          <div className="form-row">
            <div className="field">
              Durée totale de la formation
              <span className="duration-input">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label="Heures"
                  value={durH}
                  onChange={(e) => {
                    setDurH(e.target.value);
                    setAuto(true);
                  }}
                  placeholder="21"
                />
                <span>h</span>
                <select aria-label="Minutes" value={durM} onChange={(e) => { setDurM(e.target.value); setAuto(true); }}>
                  {['0', '15', '30', '45'].map((m) => (
                    <option key={m} value={m}>{m.padStart(2, '0')}</option>
                  ))}
                </select>
                <span>min</span>
              </span>
            </div>
            <p className="hint" style={{ alignSelf: 'end', marginBottom: 10 }}>
              Les dates et horaires de fin se calculent seuls : journées de {FULL_DAY_MINUTES / 60} h, pause 12h–13h,
              sans les week-ends.
            </p>
          </div>
        )}

        <div className="form-row">
          <label>
            Date de début
            <input name="start_date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            Heure de début
            <input name="start_time" type="time" required step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            Date de fin
            <input
              name="end_date"
              type="date"
              required
              min={startDate || undefined}
              value={endDate}
              onChange={(e) => {
                setAuto(false);
                setManualEndTime(endTime);
                setManualEndDate(e.target.value);
              }}
            />
          </label>
          <label>
            {plan.length > 1 ? 'Heure de fin (par jour)' : 'Heure de fin'}
            <input
              name="end_time"
              type="time"
              required
              step={300}
              value={endTime}
              onChange={(e) => {
                setAuto(false);
                setManualEndDate(endDate);
                setManualEndTime(e.target.value);
              }}
            />
          </label>
        </div>
        {lastDayEnd && <input type="hidden" name="last_day_end" value={lastDayEnd} />}

        <div className="plan-summary">
          {plan.length > 0 ? (
            <>
              <strong>{formatHours(plannedHours)}</strong> sur {plan.length} jour{plan.length > 1 ? 's' : ''} :{' '}
              {plan.map((d, i) => (
                <span key={d.day} className="plan-day">
                  {new Date(d.day + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}{' '}
                  {d.start.replace(':', 'h')}–{d.end.replace(':', 'h')}
                  {i < plan.length - 1 ? ' · ' : ''}
                </span>
              ))}
              <span className="hint"> (pause 12h–13h déduite)</span>
              {modulePlan.length > 0 && (
                <span className="module-plan">
                  Modules :{' '}
                  {modulePlan.map((m, i) => (
                    <span key={m.name + i} className="badge brouillon">
                      {m.name} · {m.start_day === m.end_day ? frDay(m.start_day) : `${frDay(m.start_day)} → ${frDay(m.end_day)}`}
                    </span>
                  ))}
                </span>
              )}
            </>
          ) : plannedHours > 0 ? (
            <>
              <strong>{formatHours(plannedHours)}</strong> sur {days} jour{days > 1 ? 's' : ''} ouvré{days > 1 ? 's' : ''}, pause 12h–13h déduite
              {template && Math.abs(plannedHours - Number(template.duration_hours)) >= 0.25 && (
                <> · <span style={{ color: 'var(--wait-ink)' }}>catalogue : {formatHours(Number(template.duration_hours))}</span></>
              )}
              {showTemplate && durationMinutes > 0 && (
                <> · <button type="button" className="small ghost" onClick={() => setAuto(true)}>Recalculer</button></>
              )}
            </>
          ) : (
            <span className="hint">Indique la durée totale (ou choisis une formation) et la date de début : la fin est calculée automatiquement.</span>
          )}
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="field">
            Statut
            <div className="status-choice" role="radiogroup" aria-label="Statut">
              {SESSION_STATUSES.map((s) => (
                <label key={s.value}>
                  <input type="radio" name="status" value={s.value} defaultChecked={(defaults.status || 'planifiee') === s.value} />
                  <span className={`status-pill ${s.value}`}>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
          <label>
            Notes
            <textarea name="notes" rows={2} defaultValue={defaults.notes || ''} placeholder="Informations complémentaires (optionnel)" />
          </label>
        </div>
      </fieldset>
    </form>
  );
}
