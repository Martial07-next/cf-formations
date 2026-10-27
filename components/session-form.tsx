'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { SESSION_STATUSES } from '@/lib/status';
import { sameCompany } from '@/lib/company';
import { formatHours, weekdaysBetween } from '@/lib/week';
import { freeWindows, hm, type Busy } from '@/lib/session-slots';
import { roomAvailability } from '@/app/sessions/actions';
import { TemplatePicker } from '@/components/template-picker';
import { placeModules, frDay } from '@/lib/modules';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { missionText, outsideMission } from '@/lib/external';
import { planDays, trainingMinutes, splitHours, FULL_DAY_MINUTES, countDays, formatDays } from '@/lib/schedule';

export type FormRoom = {
  id: string;
  name: string;
  capacity: number;
  is_holding?: boolean | null;
  location?: string | null;
  /** « exterieur » : salle d'une formation INTRA en entreprise (migration 44). */
  status?: string | null;
  /** Formations réalisables (vide = toutes). */
  template_ids?: string[];
};
export type FormTrainer = {
  id: string;
  full_name: string;
  color: string | null;
  status?: string | null;
  is_external?: boolean | null;
  mission_start?: string | null;
  mission_end?: string | null;
};
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
  sessionId,
  trainerDays,
  qualifiedTrainerIds,
  rooms,
  trainers,
  templates,
  defaults = {},
  disabled = false,
  showTemplate = true,
  pickTemplate = true,
  external = false,
  companies = [],
  formId,
  absences = [],
  onSubmit,
}: {
  rooms: FormRoom[];
  trainers: FormTrainer[];
  templates: FormTemplate[];
  defaults?: SessionFormDefaults;
  disabled?: boolean;
  /** Session modifiée (exclue du contrôle de disponibilité). */
  sessionId?: string;
  /**
   * Formation sur plusieurs jours : le formateur peut être changé pour un
   * seul jour (autre que le premier) ; le premier jour = toute la formation.
   */
  trainerDays?: { principalId: string | null; dayTrainers: Record<string, string>; initialDay?: string | null };
  /** Session modifiée : formateurs habilités pour sa formation. */
  qualifiedTrainerIds?: string[];
  showTemplate?: boolean;
  /** Session personnalisée : pas de formation du catalogue, durée saisie librement. */
  pickTemplate?: boolean;
  /** Formation extérieure (INTRA) : entreprise et adresse à la place de la salle. */
  external?: boolean;
  /** Formation INTRA : entreprises de la base de stagiaires (suggestions). */
  companies?: { name: string; trainees: number }[];
  formId?: string;
  absences?: Absence[];
  onSubmit: (fd: FormData) => void;
}) {
  const [templateId, setTemplateId] = useState(defaults.template_id || '');
  const [title, setTitle] = useState(defaults.title || '');
  const [maxTrainees, setMaxTrainees] = useState(defaults.max_trainees != null ? String(defaults.max_trainees) : '');
  const [startDate, setStartDate] = useState(defaults.start_date || '');
  const [manualEndDate, setManualEndDate] = useState(defaults.end_date || '');
  const [startTime, setStartTime] = useState(defaults.start_time || '08:00');
  const [manualEndTime, setManualEndTime] = useState(defaults.end_time || '16:00');
  // Durée totale (heures + minutes) : sert au calcul automatique des dates/horaires.
  const [durH, setDurH] = useState('');
  const [durM, setDurM] = useState('0');
  const [auto, setAuto] = useState(showTemplate);
  const [trainerId, setTrainerId] = useState(defaults.trainer_id || '');
  const roomRef = useRef<HTMLSelectElement>(null);
  // Jour concerné par le changement de formateur ('' = toute la formation).
  const [trainerDay, setTrainerDay] = useState(() => {
    const d = trainerDays?.initialDay;
    const first = defaults.start_date || '';
    return d && d !== first ? d : '';
  });
  const [dayTrainerId, setDayTrainerId] = useState('');
  const [roomId, setRoomId] = useState(defaults.room_id || '');

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

  // Disponibilité de la salle jour par jour : la session est acceptée si la
  // salle est libre aux heures prévues CE jour-là (avant / après d'autres sessions).
  useEffect(() => {
    if (roomRef.current) setRoomId(roomRef.current.value);
  }, [templateId]);
  const wanted = useMemo(() => {
    if (plan.length) return plan.map((d) => ({ day: d.day, start: d.start, end: d.end }));
    if (!startDate) return [];
    const list = weekdaysBetween(`${startDate}T00:00:00`, `${endDate || startDate}T00:00:00`);
    return (list.length ? list : [startDate]).slice(0, 60).map((day) => ({ day, start: startTime, end: endTime }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(plan), startDate, endDate, startTime, endTime]);
  const [busy, setBusy] = useState<Record<string, Busy[]>>({});
  const holdingRoom = rooms.find((r) => r.id === roomId)?.is_holding;
  useEffect(() => {
    if (disabled || !roomId || holdingRoom || !wanted.length) return setBusy({});
    let alive = true;
    const t = setTimeout(async () => {
      const res = await roomAvailability(roomId, wanted.map((w) => w.day), sessionId);
      if (alive) setBusy(res);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, JSON.stringify(wanted.map((w) => w.day)), sessionId, disabled, holdingRoom]);
  const availability = wanted
    .filter((w) => busy[w.day]?.length)
    .map((w) => {
      const b = busy[w.day];
      const clash = b.find((x) => w.start < x.end && w.end > x.start);
      return { ...w, busy: b, clash, free: freeWindows(b) };
    });

  // Jours ouvrés de la session (choix « Pour » du formateur).
  const sessionDays = startDate ? (() => {
    const l = weekdaysBetween(`${startDate}T00:00:00`, `${endDate || startDate}T00:00:00`);
    return l.length ? l : [startDate];
  })() : [];
  const dayLabel = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const days = countWeekdays(startDate, endDate);
  const dailyMinutes = trainingMinutes(startTime, endTime);
  const plannedMinutes = plan.length
    ? plan.reduce((n, d) => n + d.minutes, 0)
    : days > 0 && dailyMinutes > 0
      ? days * dailyMinutes
      : 0;
  const plannedHours = plannedMinutes / 60;
  // Jours précis à la demi-journée (ex. 3 jours et demi).
  const manualDays = formatDays(countDays(Array(Math.max(days, 0)).fill(dailyMinutes)));

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

  // Salles : celles où la formation choisie est réalisable passent en premier
  // (et sont présélectionnées), les autres restent disponibles au cas où.
  // Salles extérieures (formations INTRA, migration 44) : seulement celle de la session modifiée.
  const physicalRooms = rooms.filter((r) => !r.is_holding && r.status !== 'exterieur');
  const externalRooms = rooms.filter((r) => r.status === 'exterieur' && r.id === defaults.room_id);
  // Formation INTRA : entreprise choisie parmi celles de la base (stagiaires déjà connus).
  const [extName, setExtName] = useState('');
  const knownTrainees = extName.trim() ? companies.filter((c) => sameCompany(c.name, extName)).reduce((n, c) => n + c.trainees, 0) : 0;
  const suitedRooms = template ? physicalRooms.filter((r) => r.template_ids?.includes(template.id)) : [];
  const otherRooms = physicalRooms.filter((r) => !suitedRooms.includes(r));
  const roomLabel = (r: FormRoom) => `${r.location ? `${r.location} · ` : ''}${r.name} (${r.capacity} places)`;
  // « À affecter » n'est proposée que pour une session importée qui s'y trouve encore.
  const holdingRooms = rooms.filter((r) => r.is_holding && r.id === defaults.room_id);
  // Formateurs habilités : ceux de la formation choisie, sinon ceux de la session modifiée.
  const qualified = template?.trainer_ids?.length ? template.trainer_ids : qualifiedTrainerIds?.length ? qualifiedTrainerIds : null;
  // Seuls les formateurs actifs : et, si la formation en définit, habilités : sont proposés.
  // Déjà en place (principal ou remplaçant d'un jour) : gardé dans la liste même s'il n'est plus habilité.
  const inPlace = new Set([defaults.trainer_id, ...Object.values(trainerDays?.dayTrainers || {})].filter(Boolean) as string[]);
  const activeTrainers = trainers.filter(
    (t) => (t.status !== 'inactif' && (!qualified || qualified.includes(t.id))) || inPlace.has(t.id)
  );
  const trainerOption = (t: FormTrainer) => {
    const off = startDate ? absenceFor(absences, t.id, startDate, endDate || startDate) : null;
    const outside = startDate ? outsideMission(t, startDate, endDate || startDate) : false;
    const note = off
      ? ` (${absenceText(off)})`
      : outside
        ? ` (intervient ${missionText(t)})`
        : qualified && !qualified.includes(t.id)
          ? ' (non habilité)'
          : '';
    return (
      <option key={t.id} value={t.id} disabled={(Boolean(off) || outside) && t.id !== defaults.trainer_id}>
        {t.full_name}{note}
      </option>
    );
  };
  const trainerOutside = trainer && startDate ? outsideMission(trainer, startDate, endDate || startDate) : false;
  const modulePlan = template?.modules?.length && startDate ? placeModules(startDate, startTime, template.modules) : [];

  return (
    // Envoi sans « action » React : sinon React remet le formulaire à zéro après
    // l'enregistrement et réaffiche les anciennes valeurs (salle, formateur…).
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <fieldset className="plain" disabled={disabled}>
        {showTemplate && pickTemplate && (
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

        {external && (
          <div className="form-row">
            <label>
              Entreprise / lieu de la formation *
              <input
                name="ext_name"
                required
                placeholder="Ex. ENEDIS Lille, Eiffage Énergie…"
                maxLength={120}
                list="intra-companies"
                autoComplete="off"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
              />
              <datalist id="intra-companies">
                {companies.slice(0, 300).map((c) => <option key={c.name} value={c.name}>{`${c.trainees} stagiaire${c.trainees > 1 ? 's' : ''}`}</option>)}
              </datalist>
              {extName.trim().length >= 3 && (
                <small className={`intra-known${knownTrainees ? ' ok' : ''}`}>
                  {knownTrainees
                    ? `${knownTrainees} stagiaire${knownTrainees > 1 ? 's' : ''} de cette entreprise dans la base : ils seront proposés en priorité.`
                    : 'Nouvelle entreprise : les stagiaires collés en liste y seront rattachés.'}
                </small>
              )}
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              Adresse
              <input name="ext_address" placeholder="Ex. 12 rue de la Gare, 59000 Lille" maxLength={240} />
            </label>
          </div>
        )}

        <div className="form-row">
          {!external && (
          <label>
            Salle
            <select
              key={templateId || 'libre'}
              ref={roomRef}
              onChange={(e) => setRoomId(e.target.value)}
              name="room_id"
              required
              defaultValue={defaults.room_id || suitedRooms[0]?.id || physicalRooms[0]?.id || ''}
            >
              {suitedRooms.length > 0 ? (
                <>
                  <optgroup label="Recommandées pour cette formation">
                    {suitedRooms.map((r) => <option key={r.id} value={r.id}>★ {roomLabel(r)}</option>)}
                  </optgroup>
                  <optgroup label="Autres salles">
                    {otherRooms.map((r) => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
                  </optgroup>
                </>
              ) : (
                physicalRooms.map((r) => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)
              )}
              {holdingRooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
              {externalRooms.length > 0 && (
                <optgroup label="Formation extérieure">
                  {externalRooms.map((r) => <option key={r.id} value={r.id}>Extérieur · {r.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          )}
          <label>
            <span className="trainer-tag">
              {external ? 'Formateur qui part en entreprise *' : 'Formateur'}
              {trainer && <span className="swatch" style={{ background: trainer.color || undefined }} aria-hidden />}
            </span>
            {trainerDay && <input type="hidden" name="trainer_id" value={trainerId} />}
            {trainerDay && <input type="hidden" name="trainer_day" value={trainerDay} />}
            <select
              required={external}
              name={trainerDay ? 'day_trainer_id' : 'trainer_id'}
              value={trainerDay ? dayTrainerId || trainerDays?.dayTrainers[trainerDay] || trainerId : trainerId}
              onChange={(e) => (trainerDay ? setDayTrainerId(e.target.value) : setTrainerId(e.target.value))}
            >
              <option value="">{trainerDay ? 'Formateur principal' : 'Non attribué'}</option>
              {activeTrainers.filter((t) => !t.is_external).map(trainerOption)}
              {activeTrainers.some((t) => t.is_external) && (
                <optgroup label="Formateurs externes">
                  {activeTrainers.filter((t) => t.is_external).map(trainerOption)}
                </optgroup>
              )}
            </select>
            {sessionDays.length > 1 && trainerDays && !disabled && (
              <span className="trainer-day-pick">
                <span className="hint">Pour</span>
                <select
                  aria-label="Jour concerné par le formateur"
                  value={trainerDay}
                  onChange={(e) => {
                    setTrainerDay(e.target.value);
                    setDayTrainerId('');
                  }}
                >
                  <option value="">toute la formation (1er jour : {dayLabel(sessionDays[0])})</option>
                  {sessionDays.slice(1).map((d) => (
                    <option key={d} value={d}>
                      le {dayLabel(d)} uniquement{trainerDays.dayTrainers[d] ? ' · remplaçant' : ''}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {trainerDay && <span className="hint">Seul le {dayLabel(trainerDay)} change ; les autres jours gardent leur formateur.</span>}
            {qualified && (
              <span className="hint">{activeTrainers.length} formateur{activeTrainers.length > 1 ? 's' : ''} habilité{activeTrainers.length > 1 ? 's' : ''} pour cette formation</span>
            )}
            {trainerOutside && trainer && !trainerAbsence && (
              <span className="field-error" role="alert">Hors période : {trainer.full_name} (externe) intervient {missionText(trainer)}.</span>
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

        {availability.length > 0 && (
          <div className={`room-avail${availability.some((a) => a.clash) ? ' has-clash' : ''}`} role="status">
            <strong>Salle déjà utilisée certains jours</strong>
            <ul>
              {availability.map((a) => (
                <li key={a.day} className={a.clash ? 'clash' : 'ok'}>
                  <span className="ra-day">
                    {new Date(a.day + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                  <span>
                    {a.clash ? '✕' : '✓'} Ta session {hm(a.start)}–{hm(a.end)}
                    {a.clash ? ` chevauche « ${a.clash.title} » (${hm(a.clash.start)}–${hm(a.clash.end)})` : ' : la salle est libre à ces heures'}
                    <small>Occupée : {a.busy.map((b) => `${hm(b.start)}–${hm(b.end)} ${b.title}`).join(' · ')} — libre : {a.free.length ? a.free.map((f) => `${hm(f.start)}–${hm(f.end)}`).join(', ') : 'aucun créneau'}</small>
                  </span>
                </li>
              ))}
            </ul>
            {availability.some((a) => a.clash) && (
              <p className="hint" style={{ margin: '6px 0 0' }}>Change les heures (ou la salle), ou enregistre puis donne un horaire propre au jour concerné dans « Horaires par jour ».</p>
            )}
          </div>
        )}

        <div className="plan-summary">
          {plan.length > 0 ? (
            <>
              <strong>{formatHours(plannedHours)}</strong> sur {formatDays(countDays(plan.map((d) => d.minutes)))} :{' '}
              {plan.map((d, i) => (
                // Séparateur hors du bloc insécable : la liste passe à la ligne au lieu de déborder.
                <Fragment key={d.day}>
                  <span className="plan-day">
                    {new Date(d.day + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}{' '}
                    {d.start.replace(':', 'h')}–{d.end.replace(':', 'h')}
                  </span>
                  {i < plan.length - 1 ? ' · ' : ''}
                </Fragment>
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
              <strong>{formatHours(plannedHours)}</strong> sur {manualDays}, pause 12h–13h déduite
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
