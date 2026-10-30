'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Search, Clock, Users, CornerDownRight, X, Inbox, Wrench, CalendarOff, CalendarPlus, CalendarDays, FolderCheck, Receipt, Hourglass, ClipboardCheck, FileClock, AlertTriangle, Keyboard, Building2 } from 'lucide-react';
import { dossierBadgeLabel, type DossierBadge } from '@/lib/billing';
import { PHASE_LABEL, dayPhase, type SessionPhase } from '@/lib/session-phase';
import { createSession } from '@/app/sessions/actions';
import { SessionForm, type FormTemplate, type SessionFormDefaults } from '@/components/session-form';
import { SESSION_STATUSES, SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { eventOnDay, type PlanningEvent } from '@/lib/events';
import { DayChips, DayDetails, EventForm } from '@/components/planning-events';
import { UsefulLinksButton, type TemplateLinks } from '@/components/useful-links';
import type { UsefulLink } from '@/lib/links';
import { trainersOf, trainerOn, type DayTrainerMap } from '@/lib/day-trainers';
import { holidayOn, isClosedHoliday } from '@/lib/holidays';
import {
  addDays,
  mondayOf,
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

function StatusPill({ status, phase = null }: { status: string; phase?: SessionPhase }) {
  if (phase) return <span className={`status-pill ${phase}`}>{PHASE_LABEL[phase]}</span>;
  return <span className={`status-pill ${status}`}>{SESSION_STATUS_LABEL[status] ?? status}</span>;
}

function SessionCard({
  s,
  dIso,
  overrides,
  absence,
  info,
  dossier = null,
  replacement = null,
  reserved = 0,
  poec = null,
  by = null,
  mine = false,
  phase = null,
  index = 0,
}: {
  /** Ordre d'apparition (animation en cascade). */
  index?: number;
  /** En cours / terminée (selon la date). */
  phase?: SessionPhase;
  /** Session du formateur connecté. */
  mine?: boolean;
  s: SessionRow;
  dIso: string;
  overrides: DayOverride[];
  absence: Absence | null;
  info?: { modules: string[]; present: number };
  dossier?: DossierBadge | null;
  /** Remplaçant ce jour-là (le formateur principal ne vient pas). */
  replacement?: { full_name: string; color: string | null } | null;
  /** Places réservées par entreprise, sans nom. */
  reserved?: number;
  /** Parcours POEC auquel appartient la session. */
  poec?: string | null;
  /** Créée par (compte de l'équipe). */
  by?: string | null;
}) {
  const isStart = s.start_at.slice(0, 10) === dIso;
  const principal = one(s.trainers)?.full_name;
  const trainer = replacement ? replacement.full_name : principal;
  // Avec des modules : stagiaires réellement présents ce jour-là.
  const count = (info ? info.present : validatedCount(s)) + reserved;
  const { start, end } = effectiveDayTime(dIso, s.start_at, s.end_at, overrides);
  return (
    <Link
      href={s.start_at.slice(0, 10) !== s.end_at.slice(0, 10) ? `/sessions/${s.id}?jour=${dIso}` : `/sessions/${s.id}`}
      className={`session-card ${s.status}${isStart ? '' : ' continuation'}${mine ? ' mine' : ''}${phase === 'terminee' ? ' ended' : ''}${phase === 'en-cours' ? ' live-now' : ''}`}
      style={{ ['--c' as any]: replacement ? replacement.color || DEFAULT_TRAINER_COLOR : colorOf(s), ['--i' as any]: Math.min(index, 18) }}
      title={`${s.title} (${SESSION_STATUS_LABEL[s.status]})${replacement ? ` · ${replacement.full_name} remplace ${principal || ''}` : ''}`}
    >
      <span className="sc-top">
        <StatusPill status={s.status} phase={phase} />
        <span className="sc-count" title={`Stagiaires validés${reserved ? ` + ${reserved} place${reserved > 1 ? 's' : ''} réservée${reserved > 1 ? 's' : ''} sans nom` : ''} / places`}>
          <Users size={11} aria-hidden /> {count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}
        </span>
      </span>
      {poec && <span className="sc-poec" title={`Parcours POEC : ${poec}`}>POEC · {poec}</span>}
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
      {replacement && (
        <span className="sc-replaced">Remplace {principal || 'le formateur'}</span>
      )}
      {by && <span className="sc-by">Session créée par {by}</span>}
      {dossier && (
        <span className={`sc-dossier ${dossier.kind}`} title={dossierBadgeLabel(dossier)}>
          <DossierIcon badge={dossier} />
          {dossier.n ? <b className="sc-dossier-n">{dossier.n}</b> : null}
          <span className="sc-dossier-label">{dossierBadgeLabel(dossier)}</span>
        </span>
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
  employees = [],
  companies = [],
  usefulLinks = [],
  templateLinks = [],
  dossierBadge = {},
  dayTrainers = {},
  reservedSeats = {},
  poecTitles = {},
  createdBy = {},
  alerts = null,
  mine = null,
  nowKey = '',
  renderedAt = 0,
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
  /** Salariés proposés dans le formulaire d'évènement (migration 40). */
  employees?: { id: string; name: string }[];
  /** Entreprises de la base de stagiaires (formation INTRA). */
  companies?: { name: string; trainees: number }[];
  usefulLinks?: UsefulLink[];
  templateLinks?: TemplateLinks[];
  /** Pastille dossier / facturation de chaque session. */
  dossierBadge?: Record<string, DossierBadge>;
  /** Remplaçants certains jours : session → jour → formateur. */
  dayTrainers?: DayTrainerMap;
  /** Places réservées par entreprise encore sans nom, par session. */
  reservedSeats?: Record<string, number>;
  poecTitles?: Record<string, string>;
  createdBy?: Record<string, string>;
  /** Bandeau de relances (équipe). */
  alerts?: React.ReactNode;
  /** Heure de Paris « 2026-10-19T09:30 » (en cours / terminée). */
  nowKey?: string;
  /** Formateur : ses formations, affichées en premier. */
  mine?: React.ReactNode;
  /** Heure du rendu serveur : une page restaurée (retour arrière) trop ancienne est rechargée. */
  renderedAt?: number;
}) {
  const monday = new Date(mondayIso + 'T00:00:00Z');
  const monthAnchor = new Date(monthAnchorIso + 'T00:00:00Z');
  const dayAnchor = new Date(dayIso + 'T00:00:00Z');
  const router = useRouter();
  const searchParams = useSearchParams();
  // Suivi en direct : pastilles et relances à jour quand on revient sur l'onglet, et toutes les minutes.
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && router.refresh();
    if (renderedAt && Date.now() - renderedAt > 15000) router.refresh();
    const t = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
        if (trainerFilter === 'none' ? s.trainer_id : trainerFilter && !trainersOf(dayTrainers, s).includes(trainerFilter)) return false;
        if (statusFilter && s.status !== statusFilter) return false;
        if (!query) return true;
        const trainer = one(s.trainers)?.full_name ?? '';
        return `${s.title} ${trainer}`.toLowerCase().includes(query.toLowerCase());
      }),
    [sessions, query, trainerFilter, statusFilter, dayTrainers]
  );

  // Formateurs présents sur la période (légende des couleurs).
  const visibleTrainers = useMemo(() => {
    const ids = new Set(sessions.flatMap((s) => trainersOf(dayTrainers, s)));
    return trainers.filter((t) => ids.has(t.id));
  }, [sessions, trainers, dayTrainers]);

  const holding = rooms.filter((r) => r.is_holding);
  const holdingWithSessions = holding.filter((r) => shown.some((s) => s.room_id === r.id));
  // Formations extérieures (INTRA, migration 44) : une colonne par formation,
  // seulement sur la période où elle a lieu.
  const isExternal = (r: Room) => r.status === 'exterieur';
  const externalWithSessions = rooms.filter((r) => isExternal(r) && shown.some((s) => s.room_id === r.id));
  const gridRooms = [...holdingWithSessions, ...rooms.filter((r) => !r.is_holding && !isExternal(r)), ...externalWithSessions];

  // La grille tient toujours dans la largeur de l'écran (pas de défilement) :
  // les cartes se compactent selon la place disponible par salle.
  const gridRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<'comfort' | 'dense' | 'tight' | 'agenda'>('comfort');
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const per = (el.clientWidth - 90) / Math.max(1, gridRooms.length);
      // Trop de salles pour la largeur : agenda jour par jour (lisible, sans défilement).
      setDensity(per >= 175 ? 'comfort' : per >= 128 ? 'dense' : per >= 96 ? 'tight' : 'agenda');
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridRooms.length, view]);

  // Navigation dans le planning : l'affichage actuel reste visible (atténué)
  // pendant le chargement, puis la nouvelle période glisse dans le bon sens.
  const [navPending, startNav] = useTransition();
  const [dir, setDir] = useState<'next' | 'prev' | 'none'>('none');
  const anchorIso = view === 'day' ? dayIso : view === 'week' ? mondayIso : monthAnchorIso;
  function setParams(mut: (p: URLSearchParams) => void, direction: 'next' | 'prev' | 'none' = 'none') {
    const params = new URLSearchParams(searchParams);
    mut(params);
    setDir(direction);
    startNav(() => router.push(`/?${params.toString()}`, { scroll: false }));
  }
  const anchorIncludesToday =
    view === 'day' ? dayIso === todayIso : view === 'week' ? isoDate(mondayOf(new Date(todayIso + 'T00:00:00Z'))) === mondayIso : todayIso.slice(0, 7) === monthAnchorIso.slice(0, 7);
  const dirTo = (iso: string) => (iso > anchorIso ? 'next' : iso < anchorIso ? 'prev' : 'none');

  // Périodes voisines préchargées : précédente / suivante quasi instantanées.
  useEffect(() => {
    const url = (key: string, value: string) => {
      const p = new URLSearchParams(searchParams);
      p.set('view', view);
      p.set(key, value);
      return `/?${p.toString()}`;
    };
    const urls =
      view === 'week'
        ? [url('week', isoDate(addDays(monday, 7))), url('week', isoDate(addDays(monday, -7)))]
        : view === 'month'
          ? [1, -1].map((n) => url('month', isoDate(new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + n, 1))).slice(0, 7)))
          : [url('day', isoDate(addDays(dayAnchor, 1))), url('day', isoDate(addDays(dayAnchor, -1)))];
    const t = window.setTimeout(() => urls.forEach((u) => router.prefetch(u)), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchorIso]);

  function goToWeek(offsetDays: number) {
    setParams((p) => {
      p.set('view', 'week');
      p.set('week', isoDate(addDays(monday, offsetDays)));
    }, offsetDays > 0 ? 'next' : 'prev');
  }

  function goToDay(offsetDays: number) {
    let d = addDays(dayAnchor, offsetDays);
    const weekday = d.getUTCDay();
    if (weekday === 6) d = addDays(d, offsetDays > 0 ? 2 : -1);
    else if (weekday === 0) d = addDays(d, offsetDays > 0 ? 1 : -2);
    setParams((p) => {
      p.set('view', 'day');
      p.set('day', isoDate(d));
    }, offsetDays > 0 ? 'next' : 'prev');
  }

  function goToMonth(offsetMonths: number) {
    const d = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + offsetMonths, 1));
    setParams((p) => {
      p.set('view', 'month');
      p.set('month', isoDate(d).slice(0, 7));
    }, offsetMonths > 0 ? 'next' : 'prev');
  }

  function step(dir: 1 | -1) {
    if (view === 'day') goToDay(dir);
    else if (view === 'week') goToWeek(7 * dir);
    else goToMonth(dir);
  }

  function switchView(next: 'day' | 'week' | 'month') {
    if (next === view) return;
    setParams((p) => p.set('view', next));
  }

  // Aller directement à une date (icône calendrier), en gardant la vue choisie.
  function goToDate(iso: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const d = new Date(iso + 'T00:00:00Z');
    setParams((p) => {
      p.set('view', view);
      if (view === 'day') {
        const wd = d.getUTCDay();
        p.set('day', isoDate(wd === 6 ? addDays(d, 2) : wd === 0 ? addDays(d, 1) : d));
      } else if (view === 'week') p.set('week', isoDate(mondayOf(d)));
      else p.set('month', iso.slice(0, 7));
    }, dirTo(view === 'week' ? isoDate(mondayOf(d)) : view === 'month' ? `${iso.slice(0, 7)}-01` : iso));
  }

  function goToday() {
    const target = view === 'day' ? todayIso : view === 'week' ? isoDate(mondayOf(new Date(todayIso + 'T00:00:00Z'))) : `${todayIso.slice(0, 7)}-01`;
    setParams((p) => {
      p.delete('week');
      p.delete('month');
      p.delete('day');
    }, dirTo(target));
  }

  // Raccourcis clavier (liste affichée dans « Raccourcis », chaque ligne est aussi cliquable).
  const [helpOpen, setHelpOpen] = useState(false);
  // Raccourcis : seulement avec une souris / un clavier (rien sur téléphone ou tablette tactile).
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (min-width: 1025px)');
    const update = () => setFinePointer(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const periodWord = view === 'day' ? 'Jour' : view === 'week' ? 'Semaine' : 'Mois';
  const shortcutItems: Shortcut[] = [
    { keys: ['←'], match: (e) => e.key === 'ArrowLeft', label: `${periodWord} précédent${view === 'week' ? 'e' : ''}`, run: () => step(-1) },
    { keys: ['→'], match: (e) => e.key === 'ArrowRight', label: `${periodWord} suivant${view === 'week' ? 'e' : ''}`, run: () => step(1) },
    { keys: ['T'], match: (e) => e.key.toLowerCase() === 't', label: 'Revenir à aujourd’hui', run: goToday },
    { keys: ['J'], match: (e) => e.key.toLowerCase() === 'j', label: 'Vue Jour', run: () => switchView('day') },
    { keys: ['S'], match: (e) => e.key.toLowerCase() === 's', label: 'Vue Semaine', run: () => switchView('week') },
    { keys: ['M'], match: (e) => e.key.toLowerCase() === 'm', label: 'Vue Mois', run: () => switchView('month') },
    ...(canEdit ? [{ keys: ['N'], match: (e: KeyboardEvent) => e.key.toLowerCase() === 'n', label: 'Nouvelle session', run: () => openForm({}) }] : []),
    { keys: ['/'], match: (e) => e.key === '/', label: 'Rechercher une formation', run: () => document.querySelector<HTMLInputElement>('.toolbar .search input')?.focus() },
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!finePointer) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'Escape' && helpOpen) return setHelpOpen(false);
      if (e.key === '?') {
        e.preventDefault();
        return setHelpOpen((v) => !v);
      }
      const hit = shortcutItems.find((s) => s.match(e));
      if (!hit) return;
      e.preventDefault();
      setHelpOpen(false);
      hit.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Téléphone : glisser à gauche / droite sur le planning change de période.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s || window.innerWidth > 760) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - s.t < 600) step(dx < 0 ? 1 : -1);
    },
  };

  function openForm(defaults: SessionFormDefaults = {}) {
    setFormError(null);
    setFormDefaults(defaults);
    setFormKey((k) => k + 1);
    dialogRef.current?.showModal();
  }
  // Lien « Nouvelle session » du tableau de bord (/?creer=1) : formulaire ouvert d'office.
  const wantsCreate = searchParams.get('creer') === '1';
  useEffect(() => {
    if (!wantsCreate || !canEdit) return;
    openForm({});
    const p = new URLSearchParams(searchParams);
    p.delete('creer');
    router.replace(p.size ? `/?${p}` : '/', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsCreate]);


  function handleCreate(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await createSession(formData);
      if (result.ok) {
        // Ouverture de la fiche de la session (chargement complet, état neuf).
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
  // Libellé court en vue Jour (« Vendredi 30 oct. ») : la barre tient sur une ligne.
  const periodLabel =
    view === 'day'
      ? dayAnchor.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          ...(dayIso.slice(0, 4) !== todayIso.slice(0, 4) ? { year: 'numeric' } : {}),
          timeZone: 'UTC',
        })
      : view === 'week'
        ? weekRangeLabel(monday)
        : monthLabel(monthAnchor);
  const filtersActive = Boolean(query || trainerFilter || statusFilter);

  // Ordre d'apparition des cartes (léger décalage, animation en cascade).
  const animIndex = { current: 0 };

  // En cours (dès le premier jour) / terminée (heure de fin passée), heure de Paris.
  // Planning : statut du cours de CE jour (jour 1 terminé = « Terminée » même si la formation continue).
  const phaseOf = (s: SessionRow, dIso: string): SessionPhase => {
    if (s.status === 'brouillon' || !nowKey) return null;
    const { start, end } = effectiveDayTime(dIso, s.start_at, s.end_at, dayOverrides[s.id] || []);
    return dayPhase(dIso, start, end, nowKey);
  };

  // Ses propres sessions (ou remplacement ce jour-là) : mises en avant.
  const isMine = (s: SessionRow, dIso: string) =>
    Boolean(myTrainerId) && (dayTrainers[s.id]?.[dIso] ? dayTrainers[s.id][dIso].trainer_id === myTrainerId : s.trainer_id === myTrainerId);

  function card(s: SessionRow, dIso: string) {
    return (
      <SessionCard
        key={s.id}
        index={animIndex.current++}
        mine={isMine(s, dIso)}
        phase={phaseOf(s, dIso)}
        s={s}
        dIso={dIso}
        overrides={dayOverrides[s.id] || []}
        absence={absenceFor(absences, trainerOn(dayTrainers, s, dIso), dIso, dIso)}
        info={dayInfo[s.id]?.[dIso]}
        dossier={dossierBadge[s.id] || null}
        reserved={reservedSeats[s.id] || 0}
        poec={poecTitles[s.id] || null}
        by={createdBy[s.id] || null}
        replacement={dayTrainers[s.id]?.[dIso] ? trainers.find((t) => t.id === dayTrainers[s.id][dIso].trainer_id) || null : null}
      />
    );
  }

  // Toutes les sessions de la case (même filtrées) : sert à savoir si le créneau est déjà pris.
  function cellSessions(dIso: string, roomId: string) {
    return shown.filter((s) => s.room_id === roomId && dayIsInRange(dIso, s.start_at, s.end_at));
  }
  // Salle occupée ce jour-là : on peut placer une session avant ou après ;
  // le « + » propose l'heure de fin de la dernière session du jour.
  function freeFrom(dIso: string, roomId: string): string | null {
    const ends = sessions
      .filter((s) => s.room_id === roomId && dayIsInRange(dIso, s.start_at, s.end_at))
      .map((s) => effectiveDayTime(dIso, s.start_at, s.end_at, dayOverrides[s.id] || []).end);
    if (!ends.length) return null;
    return ends.sort()[ends.length - 1];
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

      {mine}
      {alerts}

      <div className="toolbar" role="toolbar" aria-label="Navigation du planning">
        <div className="period">
          <button className="icon" onClick={() => step(-1)} aria-label="Période précédente"><ChevronLeft size={18} /></button>
          <strong aria-live="polite">{periodLabel}</strong>
          <button className="icon" onClick={() => step(1)} aria-label="Période suivante"><ChevronRight size={18} /></button>
          <button className="small" onClick={goToday}>Aujourd’hui</button>
          <label className="date-jump" title="Aller à une date">
            <CalendarDays size={17} aria-hidden />
            <span className="sr-only">Aller à une date</span>
            <input
              type="date"
              value={view === 'day' ? dayIso : view === 'week' ? isoDate(monday) : `${monthAnchorIso.slice(0, 7)}-01`}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {}
              }}
              onChange={(e) => goToDate(e.target.value)}
            />
          </label>
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
          <option value="">Formateurs (tous)</option>
          {myTrainerId && <option value={myTrainerId}>Mes sessions</option>}
          <option value="none">Sans formateur</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
        <select aria-label="Filtrer par statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Statuts (tous)</option>
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

      <PlanBrief
        sessions={shown}
        todayIso={todayIso}
        nowKey={nowKey}
        dayOverrides={dayOverrides}
        focusDay={view === 'day' ? dayIso : anchorIncludesToday ? todayIso : null}
        periodLabel={
          view === 'week'
            ? (() => {
                const w = Math.round((monday.getTime() - mondayOf(new Date(todayIso + 'T00:00:00Z')).getTime()) / (7 * 86400000));
                return w === 1 ? 'Semaine prochaine' : w === -1 ? 'Semaine dernière' : `Semaine ${weekRangeLabel(monday)}`;
              })()
            : monthLabel(monthAnchor)
        }
        shortcuts={finePointer ? <ShortcutsHelp open={helpOpen} setOpen={setHelpOpen} items={shortcutItems} /> : null}
      />
      <p className="swipe-hint">Glisse à gauche ou à droite pour changer de {view === 'day' ? 'jour' : view === 'week' ? 'semaine' : 'mois'}</p>
      <div ref={stageRef} className={`plan-stage${navPending ? ' plan-pending' : ''}${density === 'agenda' ? ' agenda-mode' : ''}`} aria-busy={navPending} {...swipe}>
      <div key={`${view}-${anchorIso}`} className={`plan-anim dir-${dir}`}>
      {(view === 'day' || view === 'week') && (
        <>
          <div className={`grid-scroll density-${density}`} ref={gridRef}>
            <div className="plan-grid" style={{ gridTemplateColumns: `${density === 'tight' ? '70px' : density === 'dense' ? '86px' : 'minmax(96px, 120px)'} repeat(${gridRooms.length || 1}, minmax(0, 1fr))` }}>
              <div className="plan-head corner">{view === 'day' ? 'Jour' : 'Jours'}</div>
              {gridRooms.map((r) => (
                <div className={`plan-head${r.is_holding ? ' holding' : ''}${isExternal(r) ? ' external' : ''}`} key={r.id}>
                  {r.is_holding ? (
                    <>
                      <Inbox size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> À affecter
                      <small>Import Digiforma</small>
                    </>
                  ) : isExternal(r) ? (
                    <>
                      <span className="ext-tag"><Building2 size={11} aria-hidden /> INTRA</span>
                      {r.name}
                      <small>{r.location || 'Formation en entreprise'}</small>
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
                    <div className={`plan-day-label${isToday ? ' today' : ''}${isClosedHoliday(d.iso) ? ' holiday' : ''}`}>
                      {view === 'day' ? weekdayName(d.iso) : d.full}
                      <small>{view === 'day' ? `${d.iso.split('-').reverse().join('/')}${isToday ? ' · aujourd’hui' : ''}` : d.dateLabel}</small>
                      <HolidayTag day={d.iso} />
                      <DayChips events={eventsOn(d.iso)} absentCount={absentOn(d.iso).length} onOpen={() => openDay(d.iso)} />
                    </div>
                    {gridRooms.map((r) => (
                      <div className={`plan-cell${isToday ? ' today' : ''}${r.is_holding ? ' holding' : ''}${isExternal(r) ? ' external' : ''}${isClosedHoliday(d.iso) ? ' holiday' : ''}`} key={r.id}>
                        {cellSessions(d.iso, r.id).map((s) => card(s, d.iso))}
                        {canEdit && !r.is_holding && !isExternal(r) && !isClosedHoliday(d.iso) && (() => {
                          const after = freeFrom(d.iso, r.id);
                          return (
                            <button
                              type="button"
                              className={`cell-add${after ? ' after' : ''}`}
                              aria-label={`Ajouter une session : ${r.name}, ${d.full} ${d.dateLabel}${after ? `, à partir de ${after.replace(':', 'h')}` : ''}`}
                              title={after ? `Ajouter une session avant ou après (proposée à ${after.replace(':', 'h')})` : 'Ajouter une session'}
                              onClick={() => openForm({ room_id: r.id, start_date: d.iso, end_date: d.iso, ...(after && after < '20:00' ? { start_time: after } : {}) })}
                            >
                              <Plus size={14} aria-hidden />
                              {after && <span className="cell-add-txt">{after.replace(':', 'h')}</span>}
                            </button>
                          );
                        })()}
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

          {/* Téléphone : agenda jour par jour (la grille par salle est trop large). */}
          <div className="plan-agenda">
            {dayRows.map((d) => {
              const isToday = d.iso === todayIso;
              const items = gridRooms
                .flatMap((r) => cellSessions(d.iso, r.id).map((s) => ({ s, r })))
                .sort((a, b) => Number(isMine(b.s, d.iso)) - Number(isMine(a.s, d.iso)));
              // Semaine en cours : les jours passés sont repliés (on arrive sur aujourd'hui).
              if (view === 'week' && d.iso < todayIso) {
                return (
                  <details key={d.iso} className="agenda-day past">
                    <summary>
                      <strong>{`${d.full} ${d.dateLabel}`}</strong>
                      <span className="hint">{items.length ? `${items.length} session${items.length > 1 ? 's' : ''} · passé` : 'Aucune session'}</span>
                    </summary>
                    {items.map(({ s, r }) => (
                      <div key={s.id} className="agenda-item">
                        <span className="agenda-room">{r.is_holding ? 'À affecter' : isExternal(r) ? `INTRA · ${r.name}` : r.name}</span>
                        {card(s, d.iso)}
                      </div>
                    ))}
                  </details>
                );
              }
              return (
                <section key={d.iso} className={`agenda-day${isToday ? ' today' : ''}`}>
                  <header>
                    <span>
                      <strong>{view === 'day' ? fullDateLabel(dayAnchor) : `${d.full} ${d.dateLabel}`}</strong>
                      {isToday && <span className="agenda-today">Aujourd’hui</span>}
                      <HolidayTag day={d.iso} />
                    </span>
                    <DayChips events={eventsOn(d.iso)} absentCount={absentOn(d.iso).length} onOpen={() => openDay(d.iso)} />
                  </header>
                  {items.length ? (
                    items.map(({ s, r }) => (
                      <div key={s.id} className="agenda-item">
                        <span className="agenda-room">{r.is_holding ? 'À affecter' : isExternal(r) ? `INTRA · ${r.name}` : r.name}</span>
                        {card(s, d.iso)}
                      </div>
                    ))
                  ) : (
                    <p className="agenda-empty">Aucune session</p>
                  )}
                  {canEdit && (
                    <button type="button" className="small ghost agenda-add" onClick={() => openForm({ start_date: d.iso, end_date: d.iso })}>
                      <Plus size={14} aria-hidden /> Session ce jour
                    </button>
                  )}
                </section>
              );
            })}
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
                    className={`month-cell${muted ? ' muted' : ''}${dIso === todayIso ? ' today' : ''}${isClosedHoliday(dIso) ? ' holiday' : ''}${daySessions.length === 0 && !eventsOn(dIso).length && !absentOn(dIso).length ? ' empty-day' : ''}`}
                    key={dIso}
                  >
                    <span className="month-cell-head">
                      <span className="date-num">{fullDateLabel(day).split(' ').slice(0, 2).join(' ')}</span>
                      <HolidayTag day={dIso} compact />
                      <DayChips compact events={eventsOn(dIso)} absentCount={absentOn(dIso).length} onOpen={() => openDay(dIso)} />
                    </span>
                    {daySessions.map((s) => {
                      const room = one(s.rooms)?.name || '-';
                      const repl = dayTrainers[s.id]?.[dIso] ? trainers.find((t) => t.id === dayTrainers[s.id][dIso].trainer_id) : null;
                      const trainer = repl ? `${repl.full_name} (remplaçant)` : one(s.trainers)?.full_name;
                      const count = validatedCount(s) + (reservedSeats[s.id] || 0);
                      return (
                        <Link
                          key={s.id}
                          href={`/sessions/${s.id}`}
                          className={`month-chip${phaseOf(s, dIso) === 'terminee' ? ' ended' : ''}`}
                          style={{ ['--c' as any]: repl ? repl.color || DEFAULT_TRAINER_COLOR : colorOf(s), ['--i' as any]: Math.min(animIndex.current++, 24) }}
                          title={`${s.title} (${SESSION_STATUS_LABEL[s.status]})${poecTitles[s.id] ? ` · POEC ${poecTitles[s.id]}` : ''}${createdBy[s.id] ? ` · session créée par ${createdBy[s.id]}` : ''}`}
                        >
                          <span className="chip-top">
                            <span className={`dot ${phaseOf(s, dIso) || s.status}`} aria-label={phaseOf(s, dIso) ? PHASE_LABEL[phaseOf(s, dIso)!] : SESSION_STATUS_LABEL[s.status]} />
                            <span className="chip-room">{s.title}</span>
                            {phaseOf(s, dIso) && <span className={`chip-phase ${phaseOf(s, dIso)}`}>{PHASE_LABEL[phaseOf(s, dIso)!]}</span>}
                            {poecTitles[s.id] && <span className="chip-poec" title={`Parcours POEC : ${poecTitles[s.id]}`}>POEC</span>}
                            {dossierBadge[s.id] && (
                              <span className={`chip-dossier ${dossierBadge[s.id].kind}`} title={dossierBadgeLabel(dossierBadge[s.id])}>
                                <DossierIcon badge={dossierBadge[s.id]} label={dossierBadgeLabel(dossierBadge[s.id])} />
                                {dossierBadge[s.id].n ? <b>{dossierBadge[s.id].n}</b> : null}
                              </span>
                            )}
                          </span>
                          <span className="chip-trainer">
                            {room}{trainer ? ` · ${trainer}` : ''} · {count}{s.max_trainees != null ? `/${s.max_trainees}` : ''}
                          </span>
                          {createdBy[s.id] && <span className="chip-by">Créée par {createdBy[s.id]}</span>}
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
      </div>
      </div>

      <p className="legend">
        {SESSION_STATUSES.map((s) => (
          <span className="legend-item" key={s.value}><StatusPill status={s.value} /></span>
        ))}
        <span className="legend-item"><StatusPill status="" phase="en-cours" /></span>
        <span className="legend-item"><StatusPill status="" phase="terminee" /></span>
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
            employees={employees}
            intra={canEdit ? { trainers: trainers as any, templates, absences, companies } : null}
            roomNames={rooms.filter((r: any) => !r.is_holding).map((r) => r.name)}
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

function DossierIcon({ badge, label }: { badge: DossierBadge; label?: string }) {
  const props = { size: 11, 'aria-hidden': label ? undefined : true, 'aria-label': label } as const;
  const k = badge.kind;
  if (k === 'complet') return <FolderCheck {...props} />;
  if (k === 'formateur') return <ClipboardCheck {...props} />;
  if (k === 'a-remplir' || k === 'attente-formateur' || k === 'bureau') return <FileClock {...props} />;
  if (k === 'en-attente') return <Hourglass {...props} />;
  return <Receipt {...props} />;
}

/**
 * Suivi constant au-dessus du planning : le jour affiché (vue Jour) ou
 * aujourd'hui, avec « Aujourd'hui / Demain / Hier / jeudi 23 oct. » ;
 * sinon le total de la semaine ou du mois affiché.
 */
function PlanBrief({
  sessions,
  todayIso,
  nowKey,
  dayOverrides,
  focusDay,
  periodLabel,
  shortcuts,
}: {
  shortcuts?: React.ReactNode;
  sessions: SessionRow[];
  todayIso: string;
  nowKey: string;
  dayOverrides: Record<string, DayOverride[]>;
  /** Jour suivi (null : résumé de la période). */
  focusDay: string | null;
  periodLabel: string;
}) {
  if (!nowKey) return null;
  const now = nowKey.slice(11, 16);
  const active = sessions.filter((s) => s.status !== 'brouillon');
  const plural = (n: number) => `${n} formation${n > 1 ? 's' : ''}`;

  if (!focusDay) {
    return (
      <div className="plan-brief" aria-live="polite">
        <span><span className="brief-when">{periodLabel}</span> : <strong>{plural(active.length)}</strong></span>
        {shortcuts}
      </div>
    );
  }

  const diff = Math.round((new Date(focusDay + 'T00:00:00Z').getTime() - new Date(todayIso + 'T00:00:00Z').getTime()) / 86400000);
  const when =
    diff === 0
      ? 'Aujourd’hui'
      : diff === 1
        ? 'Demain'
        : diff === -1
          ? 'Hier'
          : new Date(focusDay + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const items = active
    .filter((s) => dayIsInRange(focusDay, s.start_at, s.end_at))
    .map((s) => ({ s, ...effectiveDayTime(focusDay, s.start_at, s.end_at, dayOverrides[s.id] || []) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  let extra: React.ReactNode = null;
  if (diff === 0) {
    const live = items.filter((x) => x.start <= now && now < x.end);
    const next = items.find((x) => x.start > now);
    const done = items.filter((x) => x.end <= now).length;
    const mins = next ? toMin(next.start) - toMin(now) : 0;
    extra = (
      <>
        {live.length > 0 && <span className="live"><i aria-hidden /> {live.length} en cours</span>}
        {next && <span className={mins <= 60 ? 'soon' : ''}>Prochaine : {next.s.title} {mins < 60 ? `dans ${mins} min` : `à ${next.start.replace(':', 'h')}`}</span>}
        {done > 0 && <span>{done} terminée{done > 1 ? 's' : ''}</span>}
      </>
    );
  } else if (diff > 0 && items.length) {
    extra = <span>Première à {items[0].start.replace(':', 'h')} : {items[0].s.title}</span>;
  } else if (diff < 0 && items.length) {
    extra = <span>Terminée{items.length > 1 ? 's' : ''}</span>;
  }

  return (
    <div className="plan-brief" aria-live="polite">
      <span><span className="brief-when">{when}</span> : <strong>{plural(items.length)}</strong></span>
      {extra}
      {shortcuts}
    </div>
  );
}

type Shortcut = { keys: string[]; label: string; match: (e: KeyboardEvent) => boolean; run: () => void };

/** Bouton « Raccourcis » : liste claire des touches ; un clic sur une ligne fait l'action. */
function ShortcutsHelp({ open, setOpen, items }: { open: boolean; setOpen: (v: boolean) => void; items: Shortcut[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, setOpen]);
  return (
    <span className="shortcuts" ref={ref}>
      <button type="button" className="small ghost shortcuts-btn" aria-expanded={open} onClick={() => setOpen(!open)} title="Raccourcis clavier (touche ?)">
        <Keyboard size={14} aria-hidden /> Raccourcis
      </button>
      {open && (
        <span className="shortcuts-pop" role="menu" aria-label="Raccourcis clavier">
          {items.map((s) => (
            <button
              type="button"
              role="menuitem"
              key={s.label}
              onClick={() => {
                setOpen(false);
                s.run();
              }}
            >
              <span className="shortcut-keys">{s.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
              {s.label}
            </button>
          ))}
          <span className="shortcuts-foot">Touche <kbd>?</kbd> pour afficher cette liste</span>
        </span>
      )}
    </span>
  );
}

/** « Mercredi » à partir de « 2026-10-21 ». */
function weekdayName(iso: string) {
  const n = new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Jour férié sur le planning (CF Congés) : non travaillé, ou travaillé sur décision de la direction. */
function HolidayTag({ day, compact = false }: { day: string; compact?: boolean }) {
  const h = holidayOn(day);
  if (!h) return null;
  const w = new Date(day + 'T00:00:00Z').getUTCDay();
  if (w === 0 || w === 6) return null;
  return (
    <span className={`holiday-tag${h.worked ? ' worked' : ''}`} title={h.worked ? `${h.label} : jour férié travaillé (décision de la direction dans CF Congés)` : `${h.label} : jour férié, pas de formation (sessions décalées au jour ouvré suivant)`}>
      {compact ? (h.worked ? 'Férié travaillé' : 'Férié') : h.worked ? `${h.label} · travaillé` : `Férié · ${h.label}`}
    </span>
  );
}
