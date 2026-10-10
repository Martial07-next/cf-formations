'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Search, Clock, Users, CornerDownRight, X, Inbox, Wrench, CalendarOff, CalendarPlus, FolderCheck } from 'lucide-react';
import { createSession } from '@/app/sessions/actions';
import { SessionForm, type FormTemplate, type SessionFormDefaults } from '@/components/session-form';
import { SESSION_STATUSES, SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { eventOnDay, type PlanningEvent } from '@/lib/events';
import { DayChips, DayDetails, EventForm } from '@/components/planning-events';
import { UsefulLinksButton, type TemplateLinks } from '@/components/useful-links';
import type { UsefulLink } from '@/lib/links';
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

type Room = {
  id: string;
  name: string;
  capacity: number;
  is_holding: boolean | null;
  status?: string | null;
  location?: string | null;
  /** Formations réalisables dans la salle (vide = toutes). */
  template_ids?: string[];
};
type Trainer = { id: string; full_name: string; color: string | null; status: string | null };
type SessionRow = {
  id: string;
  title: string;
  status: 'confirmee' | 'planifiee' | 'brouillon';
  start_at: string;
  end_at: string;
  room_id: string;
  trainer_id: string | null;
  max_trainees: number | null;
  trainers: { full_name: string; color: string | null } | { full_name: string; color: string | null }[] | null;
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

function colorOf(s: SessionRow): string {
  return one(s.trainers)?.color || DEFAULT_TRAINER_COLOR;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{SESSION_STATUS_LABEL[status] ?? status}</span>;
}

function SessionCard({
  s,
  dIso,
  overrides,
  absence,
  info,
  dossierDone = false,
}: {
  s: SessionRow;
  dIso: string;
  overrides: DayOverride[];
  absence: Absence | null;
  info?: { modules: string[]; present: number };
  dossierDone?: boolean;
}) {
  const isStart = s.start_at.slice(0, 10) === dIso;
  const trainer = one(s.trainers)?.full_name;
  // Avec des modules : stagiaires réellement présents ce jour-là.
  const count = info ? info.present : validatedCount(s);
  const { start, end } = effectiveDayTime(dIso, s.start_at, s.end_at, overrides);
  return (
    <Link
      href={`/sessions/${s.id}`}
      className={`session-card ${s.status}${isStart ? '' : ' continuation'}`}
      style={{ ['--c' as any]: colorOf(s) }}
      title={`${s.title} (${SESSION_STATUS_LABEL[s.status]})`}
    >
      <span className="sc-top">
        <StatusPill status={s.status} />
        <span className="sc-count" title="Stagiaires validés / places">
          <Users size={11} aria-hidden /> {count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}
        </span>
      </span>
      <span className="sc-title">
        {!isStart && <CornerDownRight size={12} aria-label="suite" style={{ verticalAlign: '-2px', marginRight: 3 }} />}
        {s.title}
        {info && info.modules.length > 0 && <span className="sc-module">{info.modules.join(' · ')}</span>}
      </span>
      <span className="sc-meta">
        <span><Clock size={11} aria-hidden /> {start} – {end}</span>
        <span className="sc-trainer">{trainer || 'Formateur à définir'}</span>
      </span>
      {absence && (
        <span className="sc-absence"><CalendarOff size={11} aria-hidden /> Formateur {absenceText(absence)}</span>
      )}
      {dossierDone && (
        <span className="sc-dossier"><FolderCheck size={11} aria-hidden /> Dossier complet</span>
      )}
    </Link>
  );
}

export function Planning({
  view,
  canEdit,
  myTrainerId,
  rooms,
  trainers,
  templates,
  sessions,
  dayOverrides,
  mondayIso,
  monthAnchorIso,
  dayIso,
  todayIso,
  workshops,
  absences,
  dayInfo = {},
  events = [],
  usefulLinks = [],
  templateLinks = [],
  dossierComplete = {},
}: {
  view: 'day' | 'week' | 'month';
  canEdit: boolean;
  myTrainerId: string | null;
  rooms: Room[];
  trainers: Trainer[];
  templates: FormTemplate[];
  sessions: SessionRow[];
  dayOverrides: Record<string, DayOverride[]>;
  mondayIso: string;
  monthAnchorIso: string;
  dayIso: string;
  todayIso: string;
  workshops: { id: string; room_id: string; name: string }[];
  absences: Absence[];
  dayInfo?: Record<string, Record<string, { modules: string[]; present: number }>>;
  /** Évènements (repas, CACES/SST, recrutement, forums…) : aperçu, sans blocage. */
  events?: PlanningEvent[];
  usefulLinks?: UsefulLink[];
  templateLinks?: TemplateLinks[];
  /** Sessions dont le dossier (émargement + documents) est complet. */
  dossierComplete?: Record<string, boolean>;
}) {
  const monday = new Date(mondayIso + 'T00:00:00Z');
  const monthAnchor = new Date(monthAnchorIso + 'T00:00:00Z');
  const dayAnchor = new Date(dayIso + 'T00:00:00Z');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState('');
  const [trainerFilter, setTrainerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDefaults, setFormDefaults] = useState<SessionFormDefaults>({});
  const [formKey, setFormKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const workshopRef = useRef<HTMLDialogElement>(null);
  const eventRef = useRef<HTMLDialogElement>(null);
  const [eventPanel, setEventPanel] = useState<
    { mode: 'day'; day: string } | { mode: 'form'; event: PlanningEvent | null; day?: string } | null
  >(null);
  const eventsOn = (day: string) => events.filter((e) => eventOnDay(e, day));
  const absentOn = (day: string) => absences.filter((a) => a.start_date <= day && a.end_date >= day);
  function openDay(day: string) {
    setEventPanel({ mode: 'day', day });
    eventRef.current?.showModal();
  }
  function openEventForm(event: PlanningEvent | null, day?: string) {
    setEventPanel({ mode: 'form', event, day });
    if (!eventRef.current?.open) eventRef.current?.showModal();
  }
  const [workshopRoom, setWorkshopRoom] = useState<Room | null>(null);

  const shown = useMemo(
    () =>
      sessions.filter((s) => {
        if (trainerFilter === 'none' ? s.trainer_id : trainerFilter && s.trainer_id !== trainerFilter) return false;
        if (statusFilter && s.status !== statusFilter) return false;
        if (!query) return true;
        const trainer = one(s.trainers)?.full_name ?? '';
        return `${s.title} ${trainer}`.toLowerCase().includes(query.toLowerCase());
      }),
    [sessions, query, trainerFilter, statusFilter]
  );

  // Formateurs présents sur la période (légende des couleurs).
  const visibleTrainers = useMemo(() => {
    const ids = new Set(sessions.map((s) => s.trainer_id).filter(Boolean));
    return trainers.filter((t) => ids.has(t.id));
  }, [sessions, trainers]);

  const holding = rooms.filter((r) => r.is_holding);
  const holdingWithSessions = holding.filter((r) => shown.some((s) => s.room_id === r.id));
  const gridRooms = [...holdingWithSessions, ...rooms.filter((r) => !r.is_holding)];

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
    const weekday = d.getUTCDay();
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

  function step(dir: 1 | -1) {
    if (view === 'day') goToDay(dir);
    else if (view === 'week') goToWeek(7 * dir);
    else goToMonth(dir);
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

  function openForm(defaults: SessionFormDefaults = {}) {
    setFormError(null);
    setFormDefaults(defaults);
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  }

  function handleCreate(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await createSession(formData);
      if (result.ok) {
        // Normalement l'action redirige vers la fiche de la session ; filet de sécurité.
        dialogRef.current?.close();
        setMessage({ text: 'Session enregistrée, ouverture de sa fiche…', isError: false });
        if (result.id) window.location.assign(`/sessions/${result.id}?nouvelle=1`);
      } else {
        setFormError(result.error);
      }
    });
  }

  const dayRows =
    view === 'day' ? [{ iso: dayIso, full: fullDateLabel(dayAnchor), short: '', dateLabel: '' }] : weekDayRows(monday);
  const weeks = view === 'month' ? monthWeekGrid(monthAnchor) : [];
  const monthDayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const periodLabel = view === 'day' ? fullDateLabel(dayAnchor) : view === 'week' ? weekRangeLabel(monday) : monthLabel(monthAnchor);
  const filtersActive = Boolean(query || trainerFilter || statusFilter);

  // Toutes les sessions de la case (même filtrées) : sert à savoir si le créneau est déjà pris.
  function cellSessions(dIso: string, roomId: string) {
    return shown.filter((s) => s.room_id === roomId && dayIsInRange(dIso, s.start_at, s.end_at));
  }
  function isTaken(dIso: string, roomId: string) {
    return sessions.some((s) => s.room_id === roomId && dayIsInRange(dIso, s.start_at, s.end_at));
  }


  return (
    <section className="content">
      <header>
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Planning des salles</h1>
          <p>Une couleur par formateur · la pastille indique le statut de la session.</p>
        </div>
        <div className="header-actions">
          <UsefulLinksButton links={usefulLinks} templateLinks={templateLinks} canEdit={canEdit} />
          {canEdit && (
            <>
            <button onClick={() => openEventForm(null, view === 'day' ? dayIso : todayIso)}>
              <CalendarPlus size={16} aria-hidden /> Évènement
            </button>
            <button className="primary" onClick={() => openForm({ start_date: view === 'day' ? dayIso : undefined })}>
              <Plus size={16} aria-hidden /> Nouvelle session
            </button>
            </>
          )}
        </div>
      </header>

      <div className="toolbar" role="toolbar" aria-label="Navigation du planning">
        <div className="period">
          <button className="icon" onClick={() => step(-1)} aria-label="Période précédente"><ChevronLeft size={18} /></button>
          <strong aria-live="polite">{periodLabel}</strong>
          <button className="icon" onClick={() => step(1)} aria-label="Période suivante"><ChevronRight size={18} /></button>
          <button className="small" onClick={goToday}>Aujourd’hui</button>
        </div>
        <div className="toggle-group" role="group" aria-label="Vue">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => switchView(v)}>
              {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search">
          <Search size={15} aria-hidden />
          <span className="sr-only">Rechercher</span>
          <input placeholder="Rechercher une formation…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select aria-label="Filtrer par formateur" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
          <option value="">Tous les formateurs</option>
          {myTrainerId && <option value={myTrainerId}>Mes sessions</option>}
          <option value="none">Sans formateur</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
        <select aria-label="Filtrer par statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          {SESSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            className="small ghost"
            onClick={() => {
              setQuery('');
              setTrainerFilter('');
              setStatusFilter('');
            }}
          >
            <X size={14} aria-hidden /> Effacer
          </button>
        )}
      </div>

      {visibleTrainers.length > 0 && (
        <div className="trainer-legend" aria-label="Formateurs de la période">
          {visibleTrainers.map((t) => (
            <button
              key={t.id}
              type="button"
              className="trainer-chip"
              aria-pressed={trainerFilter === t.id}
              onClick={() => setTrainerFilter(trainerFilter === t.id ? '' : t.id)}
            >
              <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
              {t.full_name}
            </button>
          ))}
        </div>
      )}

      {message && (
        <div role="status" className={`alert ${message.isError ? 'alert-error' : 'alert-success'}`}>
          {message.text}
        </div>
      )}

      {(view === 'day' || view === 'week') && (
        <>
          <div className="grid-scroll">
            <div className="plan-grid" style={{ gridTemplateColumns: `minmax(96px, 130px) repeat(${gridRooms.length || 1}, minmax(170px, 1fr))` }}>
              <div className="plan-head corner">{view === 'day' ? 'Jour' : 'Jours'}</div>
              {gridRooms.map((r) => (
                <div className={`plan-head${r.is_holding ? ' holding' : ''}`} key={r.id}>
                  {r.is_holding ? (
                    <>
                      <Inbox size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> À affecter
                      <small>Import Digiforma</small>
                    </>
                  ) : (
                    <>
                      {r.name}
                      {(workshops.some((w) => w.room_id === r.id) || (r.template_ids?.length ?? 0) > 0) && (
                        <button
                          type="button"
                          className="workshop-btn small"
                          aria-label={`Voir les ateliers et formations de ${r.name}`}
                          title="Ateliers et formations réalisables"
                          onClick={() => {
                            setWorkshopRoom(r);
                            workshopRef.current?.showModal();
                          }}
                        >
                          <Wrench size={12} aria-hidden /> {workshops.filter((w) => w.room_id === r.id).length}
                        </button>
                      )}
                      <small>{r.location ? `${r.location} · ` : ''}{r.capacity} places{r.status === 'indisponible' ? ' · indisponible' : ''}</small>
                    </>
                  )}
                </div>
              ))}

              {dayRows.map((d) => {
                const isToday = d.iso === todayIso;
                return (
                  <div key={d.iso} style={{ display: 'contents' }}>
                    <div className={`plan-day-label${isToday ? ' today' : ''}`}>
                      {view === 'day' ? (isToday ? 'Aujourd’hui' : 'Jour') : d.full}
                      <small>{view === 'day' ? d.iso.split('-').reverse().join('/') : d.dateLabel}</small>
                      <DayChips events={eventsOn(d.iso)} absentCount={absentOn(d.iso).length} onOpen={() => openDay(d.iso)} />
                    </div>
                    {gridRooms.map((r) => (
                      <div className={`plan-cell${isToday ? ' today' : ''}${r.is_holding ? ' holding' : ''}`} key={r.id}>
                        {cellSessions(d.iso, r.id).map((s) => (
                          <SessionCard key={s.id} s={s} dIso={d.iso} overrides={dayOverrides[s.id] || []} absence={absenceFor(absences, s.trainer_id, d.iso, d.iso)} info={dayInfo[s.id]?.[d.iso]} dossierDone={Boolean(dossierComplete[s.id])} />
                        ))}
                        {canEdit && !r.is_holding && !isTaken(d.iso, r.id) && (
                          <button
                            type="button"
                            className="cell-add"
                            aria-label={`Ajouter une session : ${r.name}, ${d.full} ${d.dateLabel}`}
                            onClick={() => openForm({ room_id: r.id, start_date: d.iso, end_date: d.iso })}
                          >
                            <Plus size={14} aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {gridRooms.length === 0 && (
                <div className="plan-cell" style={{ gridColumn: '2 / -1' }}>
                  Aucune salle enregistrée : <Link href="/salles">ajoutes-en une</Link>.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {view === 'month' && (
        <>
          <div className="month-head">
            {monthDayLabels.map((d) => (
              <div className="month-day-label" key={d}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="month-grid" key={wi}>
              {week.map((day) => {
                const dIso = isoDate(day);
                const daySessions = shown.filter((s) => dayIsInRange(dIso, s.start_at, s.end_at));
                const muted = !isSameMonth(day, monthAnchor);
                return (
                  <div
                    className={`month-cell${muted ? ' muted' : ''}${dIso === todayIso ? ' today' : ''}${daySessions.length === 0 && !eventsOn(dIso).length && !absentOn(dIso).length ? ' empty-day' : ''}`}
                    key={dIso}
                  >
                    <span className="month-cell-head">
                      <span className="date-num">{fullDateLabel(day).split(' ').slice(0, 2).join(' ')}</span>
                      <DayChips compact events={eventsOn(dIso)} absentCount={absentOn(dIso).length} onOpen={() => openDay(dIso)} />
                    </span>
                    {daySessions.map((s) => {
                      const room = one(s.rooms)?.name || '-';
                      const trainer = one(s.trainers)?.full_name;
                      const count = validatedCount(s);
                      return (
                        <Link
                          key={s.id}
                          href={`/sessions/${s.id}`}
                          className="month-chip"
                          style={{ ['--c' as any]: colorOf(s) }}
                          title={`${s.title} (${SESSION_STATUS_LABEL[s.status]})`}
                        >
                          <span className="chip-top">
                            <span className={`dot ${s.status}`} aria-label={SESSION_STATUS_LABEL[s.status]} />
                            <span className="chip-room">{s.title}</span>
                            {dossierComplete[s.id] && <FolderCheck size={11} aria-label="Dossier complet" className="chip-dossier" />}
                          </span>
                          <span className="chip-trainer">
                            {room}{trainer ? ` · ${trainer}` : ''} · {count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      <p className="legend">
        {SESSION_STATUSES.map((s) => (
          <span className="legend-item" key={s.value}><StatusPill status={s.value} /></span>
        ))}
        <span className="legend-item"><CornerDownRight size={13} aria-hidden /> suite d’une formation sur plusieurs jours</span>
      </p>

      {canEdit && (
        <dialog ref={dialogRef} className="modal" aria-labelledby="new-session-title" onClose={() => setFormError(null)}>
          <div className="modal-head">
            <h2 id="new-session-title">Nouvelle session</h2>
            <button className="icon ghost" onClick={() => dialogRef.current?.close()} aria-label="Fermer"><X size={18} /></button>
          </div>
          <div className="modal-body">
            {formError && <div role="alert" className="alert alert-error">{formError}</div>}
            <SessionForm
              key={formKey}
              formId="new-session-form"
              rooms={rooms}
              trainers={trainers}
              templates={templates}
              defaults={formDefaults}
              absences={absences}
              onSubmit={handleCreate}
            />
          </div>
          <div className="modal-foot">
            <button type="button" onClick={() => dialogRef.current?.close()}>Annuler</button>
            <button type="submit" form="new-session-form" className="primary" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer la session'}
            </button>
          </div>
        </dialog>
      )}
      <dialog ref={eventRef} className="modal" aria-label="Évènements" onClose={() => setEventPanel(null)}>
        {eventPanel?.mode === 'day' && (
          <DayDetails
            day={eventPanel.day}
            events={eventsOn(eventPanel.day)}
            absences={absentOn(eventPanel.day)}
            trainers={trainers}
            canEdit={canEdit}
            onEdit={(e) => openEventForm(e)}
            onAdd={() => openEventForm(null, eventPanel.day)}
            onClose={() => eventRef.current?.close()}
          />
        )}
        {eventPanel?.mode === 'form' && (
          <EventForm
            key={eventPanel.event?.id || `new-${eventPanel.day}`}
            event={eventPanel.event}
            defaultDay={eventPanel.day}
            trainers={trainers}
            onDone={() => {
              eventRef.current?.close();
              setMessage({ text: 'Évènement enregistré.', isError: false });
            }}
            onCancel={() => eventRef.current?.close()}
          />
        )}
      </dialog>

      <dialog ref={workshopRef} className="modal" aria-labelledby="workshop-title" onClose={() => setWorkshopRoom(null)}>
        <div className="modal-head">
          <h2 id="workshop-title"><Wrench size={17} aria-hidden style={{ verticalAlign: '-3px' }} /> {workshopRoom?.name}</h2>
          <button className="icon ghost" onClick={() => workshopRef.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 18 }}>
          <h3 className="sub-heading" style={{ marginTop: 0 }}>Ateliers</h3>
          <div className="check-grid">
            {workshops.filter((w) => w.room_id === workshopRoom?.id).map((w) => (
              <span key={w.id} className="workshop-chip" style={{ paddingRight: 12 }}>{w.name}</span>
            ))}
            {!workshops.some((w) => w.room_id === workshopRoom?.id) && <span className="hint">Aucun atelier.</span>}
          </div>
          <h3 className="sub-heading">Formations réalisables</h3>
          <div className="check-grid">
            {(workshopRoom?.template_ids?.length ?? 0) === 0 ? (
              <span className="hint">Aucune formation indiquée.</span>
            ) : (
              templates
                .filter((t) => workshopRoom?.template_ids?.includes(t.id))
                .map((t) => (
                  <span key={t.id} className="badge brouillon">{t.title}</span>
                ))
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}
