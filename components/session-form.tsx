'use client';

import { useMemo, useState } from 'react';
import { SESSION_STATUSES } from '@/lib/status';
import { formatHours } from '@/lib/week';

export type FormRoom = { id: string; name: string; capacity: number; is_holding?: boolean | null };
export type FormTrainer = { id: string; full_name: string; color: string | null; status?: string | null };
export type FormTemplate = {
  id: string;
  title: string;
  reference: string | null;
  category: string | null;
  duration_hours: number;
  max_trainees: number | null;
};

export type SessionFormDefaults = {
  title?: string;
  reference?: string | null;
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

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

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
  onSubmit,
}: {
  rooms: FormRoom[];
  trainers: FormTrainer[];
  templates: FormTemplate[];
  defaults?: SessionFormDefaults;
  disabled?: boolean;
  showTemplate?: boolean;
  formId?: string;
  onSubmit: (fd: FormData) => void;
}) {
  const [templateId, setTemplateId] = useState(defaults.template_id || '');
  const [title, setTitle] = useState(defaults.title || '');
  const [reference, setReference] = useState(defaults.reference || '');
  const [maxTrainees, setMaxTrainees] = useState(defaults.max_trainees != null ? String(defaults.max_trainees) : '');
  const [startDate, setStartDate] = useState(defaults.start_date || '');
  const [endDate, setEndDate] = useState(defaults.end_date || '');
  const [startTime, setStartTime] = useState(defaults.start_time || '09:00');
  const [endTime, setEndTime] = useState(defaults.end_time || '17:00');
  const [trainerId, setTrainerId] = useState(defaults.trainer_id || '');

  const template = templates.find((t) => t.id === templateId) || null;
  const folders = useMemo(() => groupByFolder(templates), [templates]);
  const trainer = trainers.find((t) => t.id === trainerId);

  const days = countWeekdays(startDate, endDate);
  const dailyMinutes = minutesBetween(startTime, endTime);
  const plannedHours = days > 0 && dailyMinutes > 0 ? Math.round(((days * dailyMinutes) / 60) * 10) / 10 : 0;

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setReference(t.reference || '');
    setMaxTrainees(t.max_trainees != null ? String(t.max_trainees) : '');
    // Formation courte (une journée) : on calcule directement l'heure de fin.
    if (t.duration_hours <= 8) setEndTime(addMinutes(startTime, Math.round(t.duration_hours * 60)));
  }

  const physicalRooms = rooms.filter((r) => !r.is_holding);
  const holdingRooms = rooms.filter((r) => r.is_holding);
  const activeTrainers = trainers.filter((t) => t.status !== 'inactif' || t.id === defaults.trainer_id);

  return (
    <form id={formId} action={onSubmit}>
      <fieldset className="plain" disabled={disabled}>
        {showTemplate && (
          <div className="form-row">
            <label>
              Formation du catalogue
              <select name="template_id" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">— Formation libre —</option>
                {folders.map(([folder, items]) => (
                  <optgroup key={folder} label={folder}>
                    {items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {formatHours(Number(t.duration_hours))}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="form-row">
          <label style={{ gridColumn: 'span 2' }}>
            Nom de la formation
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Habilitation électrique B0" />
          </label>
          <label>
            Référence
            <input name="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex. HAB-B0" />
          </label>
        </div>

        <div className="form-row">
          <label>
            Salle
            <select name="room_id" required defaultValue={defaults.room_id || physicalRooms[0]?.id || ''}>
              {physicalRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.capacity} places)</option>
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
              {activeTrainers.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Places (max. stagiaires)
            <input name="max_trainees" type="number" min={0} inputMode="numeric" value={maxTrainees} onChange={(e) => setMaxTrainees(e.target.value)} />
          </label>
        </div>

        <div className="form-row">
          <label>
            Date de début
            <input
              name="start_date"
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </label>
          <label>
            Date de fin
            <input name="end_date" type="date" required min={startDate || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label>
            Heure de début
            <input name="start_time" type="time" required step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            Heure de fin
            <input name="end_time" type="time" required step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <p className="hint" style={{ margin: '-4px 0 14px' }}>
          {plannedHours > 0 ? (
            <>
              Planifié : <strong>{formatHours(plannedHours)}</strong> sur {days} jour{days > 1 ? 's' : ''} ouvré{days > 1 ? 's' : ''}
              {template && <> · catalogue : {formatHours(Number(template.duration_hours))}</>}
              {template && Math.abs(plannedHours - Number(template.duration_hours)) >= 0.5 && ' (différent de la durée prévue)'}
            </>
          ) : (
            'Pour une formation sur plusieurs jours, choisis une date de fin différente. Les horaires s’appliquent à chaque jour (modifiables jour par jour ensuite).'
          )}
        </p>

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
