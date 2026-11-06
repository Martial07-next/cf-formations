import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { companyKey } from '@/lib/company';
import { congesConfigured, syncCongesIfStale } from '@/lib/conges-sync';
import { applyHolidayShiftsIfStale } from '@/lib/holiday-shifts';
import { Planning } from '@/components/planning';
import { compareRooms } from '@/lib/buildings';
import { loadDayTrainers } from '@/lib/day-trainers';
import { loadReservations, reservationStatus } from '@/lib/reservations';
import { shortName } from '@/lib/tracking';
import { type DossierBadge } from '@/lib/billing';
import { dossierBadges } from '@/lib/dossier-badges';
import { parisNowKey, parisToday } from '@/lib/session-lock';
import { alertHorizon, sessionAlerts, sessionsWithoutDigiforma, type SessionAlert } from '@/lib/session-alerts';
import { SessionAlerts } from '@/components/session-alerts';
import type { ToAssign } from '@/components/planning';
import { matchCatalog, matchModule } from '@/lib/catalog-match';
import { withoutSessionOnly } from '@/lib/template-edit';
const GEIQ_RE = /\bgeiq\b/i;
import { People, isPlaceholder, personKey, personName } from '@/lib/digiforma-people';
import { isCompanyPeriod, isOffPeriod } from '@/lib/digiforma-sync';
import { MySessions, type MySession } from '@/components/my-sessions';
import { computeDossierTodo } from '@/lib/dossier-todo';
import { mondayOf, addDays, isoDate, firstOfMonth, monthWeekGrid, weekdaysBetween } from '@/lib/week';

// Les imports de gros fichiers (plusieurs milliers de lignes) passent par les actions de cette page.
export const maxDuration = 60;

const SESSION_SELECT =
  'id, title, status, start_at, end_at, room_id, trainer_id, template_id, max_trainees, notes, rooms(name), trainers(full_name, color), session_trainees(status, trainee_id, trainees(company))';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; month?: string; day?: string }>;
}) {
  const { week, view, month, day } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  // Congés de la plateforme de congés : mis à jour en arrière-plan (au plus toutes les 10 min).
  // Jours fériés (décisions de CF Congés) : sessions décalées avec la même synchronisation.
  after(async () => {
    try {
      if (congesConfigured()) await syncCongesIfStale(createAdminClient());
      else await applyHolidayShiftsIfStale(createAdminClient());
    } catch {
      // Sans effet sur l'affichage : l'erreur est visible dans Intégrations.
    }
  });
  const currentView = view === 'month' ? 'month' : view === 'day' ? 'day' : 'week';

  const [{ data: rooms }, { data: trainers }, { data: templates0 }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity, is_holding, status, location').order('name'),
    supabase.from('trainers').select('*').order('full_name'),
    supabase
      .from('templates')
      .select('id, title, category, duration_hours, max_trainees, template_trainers(trainer_id), template_modules(name, duration_hours, position)')
      .order('title'),
  ]);

  // Paramètres propres à une session (migration 62) : hors catalogue.
  const templates = await withoutSessionOnly(supabase, (templates0 as any[]) || []);

  const safeDate = (v: string | undefined, suffix = '') => {
    if (!v) return null;
    const d = new Date(v + suffix);
    return isNaN(d.getTime()) ? null : d;
  };

  let rangeStart: Date;
  let rangeEnd: Date; // exclusif
  let monthAnchor = firstOfMonth(new Date());
  const dayAnchor = safeDate(day, 'T00:00:00Z') || new Date(isoDate(new Date()) + 'T00:00:00Z');
  const monday = mondayOf(safeDate(week) || new Date());

  if (currentView === 'month') {
    monthAnchor = safeDate(month, '-01T00:00:00Z') || firstOfMonth(new Date());
    const weeks = monthWeekGrid(monthAnchor);
    rangeStart = weeks[0][0];
    rangeEnd = addDays(weeks[weeks.length - 1][4], 1);
  } else if (currentView === 'day') {
    rangeStart = dayAnchor;
    rangeEnd = addDays(dayAnchor, 1);
  } else {
    rangeStart = monday;
    rangeEnd = addDays(monday, 5);
  }

  // Vitesse : les requêtes de la période partent toutes en même temps.
  const start = <T,>(q: PromiseLike<T>) => Promise.resolve(q);
  const absencesFrom = isoDate(rangeStart) < isoDate(new Date()) ? isoDate(rangeStart) : isoDate(new Date());
  const period = {
    // Requête légèrement élargie (±1 jour) pour ne pas rater une session
    // multi-jours qui commence avant ou finit après la période visible.
    sessions: start(
      supabase
        .from('sessions')
        .select(SESSION_SELECT)
        .lt('start_at', isoDate(rangeEnd))
        .gt('end_at', isoDate(addDays(rangeStart, -1)))
        .order('start_at')
    ),
    // Ateliers (bouton sur le planning) et congés des formateurs (à partir du début de la période visible).
    side: Promise.all([
      start(supabase.from('room_workshops').select('id, room_id, name').order('name')),
      start(
        supabase
          .from('trainer_absences')
          .select('id, trainer_id, start_date, end_date, kind, note')
          .gte('end_date', absencesFrom)
          .order('start_date')
          .limit(2000)
      ),
      start(supabase.from('room_templates').select('room_id, template_id')),
    ]),
    // Évènements de la période (repas, CACES/SST, recrutement, forums…) : aperçu seulement.
    events: start(
      supabase
        .from('planning_events')
        .select('id, kind, title, start_date, end_date, start_time, end_time, location, participants, notes, planning_event_trainers(trainer_id)')
        .lte('start_date', isoDate(addDays(rangeEnd, -1)))
        .gte('end_date', isoDate(rangeStart))
        .order('start_date')
    ),
    // Stages en entreprise des parcours POEC (migration 23).
    stages: start(
      supabase
        .from('poec_periods')
        .select('id, label, start_date, end_date, program_id, poec_programs(title, poec_trainees(trainee_id))')
        .lte('start_date', isoDate(addDays(rangeEnd, -1)))
        .gte('end_date', isoDate(rangeStart))
        .order('start_date')
    ),
    // Liens utiles (bouton du planning) et supports des formations (migration 15).
    links: Promise.all([
      start(supabase.from('useful_links').select('id, category, label, url, description, position').order('position')),
      start(supabase.from('template_links').select('id, template_id, label, url, position').order('position')),
    ]),
  };
  // Relances (équipe) : sessions qui commencent d'ici la fin de la semaine prochaine et ne sont pas prêtes.
  const today = parisToday();
  const alertsQuery = canManage(profile?.role)
    ? (async () => {
        const base = (withManager: boolean) =>
          supabase
            .from('sessions')
            .select(`id, title, start_at, status, trainer_id, session_trainees(status)${withManager ? ', manager:profiles!sessions_manager_id_fkey(full_name)' : ''}`)
            .gte('start_at', today)
            .lt('start_at', alertHorizon(today))
            .order('start_at');
        let { data, error } = await base(true);
        if (error) ({ data } = await base(false));
        const noDf = await sessionsWithoutDigiforma(supabase, ((data as any[]) || []).map((s) => s.id));
        return sessionAlerts((data as any[]) || [], today, noDf);
      })()
    : Promise.resolve([] as SessionAlert[]);
  // Digiforma (migration 57) : modules de la période à placer + sessions créées dont la salle reste à choisir.
  const holdingIds = ((rooms as any[]) || []).filter((r) => r.is_holding).map((r) => r.id as string);
  // Par semaine : vue semaine / jour → la semaine (lundi → dimanche) ; vue mois → les semaines du mois, regroupées.
  const weekStart = currentView === 'month' ? rangeStart : mondayOf(currentView === 'day' ? dayAnchor : monday);
  const weekEnd = currentView === 'month' ? addDays(rangeEnd, 2) : addDays(weekStart, 7);
  const periodFrom = isoDate(new Date(Math.max(weekStart.getTime(), new Date(isoDate(new Date()) + 'T00:00:00Z').getTime()))) + 'T00:00:00';
  const periodTo = isoDate(weekEnd) + 'T00:00:00';
  const catalog = ((templates as any[]) || []).map((t) => ({ id: t.id as string, title: t.title as string }));
  let toAssignPrograms: { id: string; title: string }[] = [];
  const toAssignQuery: Promise<ToAssign[]> = canManage(profile?.role)
    ? (async () => {
        // Modules couverts par un parcours déjà posé (migration 58) : non proposés.
        const modsQuery = (withCovered: boolean) => {
          let q = supabase
            .from('digiforma_modules')
            .select('*')
            .is('placed_session_id', null);
          if (withCovered) q = q.is('covered_by', null);
          return q.lt('start_at', periodTo).gte('end_at', periodFrom).order('start_at').limit(200);
        };
        const [mods0, held] = await Promise.all([
          modsQuery(false).then((r) => r) as any,
          holdingIds.length
            ? supabase
                .from('sessions')
                .select('id, title, start_at, end_at, poec_id, digiforma_ref, session_trainees(status)')
                .in('room_id', holdingIds)
                .lt('start_at', periodTo)
                .gte('end_at', periodFrom)
                .order('start_at')
                .limit(200)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const mods = mods0.error ? await modsQuery(false) : mods0;
        const modRows = (mods.data as any[]) || [];

        // Corbeille de la page Stagiaires (migration 60) : ces personnes ne sont jamais proposées.
        const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
        const trashed = new People();
        for (const t of (trashedRows as any[]) || []) trashed.add(t);

        // Ce qui est déjà sur le planning cette semaine : sessions (avec stagiaires), parcours et leurs évènements.
        const [{ data: weekSessions }, { data: progRows }, { data: progEvents }] = await Promise.all([
          supabase
            .from('sessions')
            .select('id, title, template_id, poec_id, room_id, start_at, end_at, session_trainees(trainees(email, full_name, first_name, last_name))')
            .lt('start_at', periodTo)
            .gte('end_at', periodFrom),
          supabase.from('poec_programs').select('id, title, notes, start_date, end_date, poec_trainees(trainees(email, full_name, first_name, last_name))').gte('end_date', periodFrom.slice(0, 10)),
          supabase.from('planning_events').select('id, poec_id, start_date, end_date').not('poec_id', 'is', null).lte('start_date', periodTo.slice(0, 10)).gte('end_date', periodFrom.slice(0, 10)),
        ]);
        const sessPeople = ((weekSessions as any[]) || [])
          .filter((x) => !holdingIds.includes(x.room_id))
          .map((x) => {
            const pp = new People();
            for (const st of x.session_trainees || []) {
              const t = Array.isArray(st.trainees) ? st.trainees[0] : st.trainees;
              if (t) pp.add(t);
            }
            return { ...x, people: pp };
          });
        const programs = ((progRows as any[]) || []).map((p) => {
          const pp = new People();
          for (const pt of p.poec_trainees || []) {
            const t = Array.isArray(pt.trainees) ? pt.trainees[0] : pt.trainees;
            if (t) pp.add(t);
          }
          // Parcours créé à la main (pas par la synchronisation Digiforma).
          const manual = !String(p.notes || '').startsWith('Parcours créé automatiquement depuis Digiforma');
          return { id: p.id as string, title: p.title as string, people: pp, manual };
        });
        toAssignPrograms = programs.map((p) => ({ id: p.id, title: p.title })).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
        const sameDays = (a1: string, b1: string, a2: string, b2: string) => a1.slice(0, 10) <= b2.slice(0, 10) && b1.slice(0, 10) >= a2.slice(0, 10);
        const half = (n: number) => Math.max(1, Math.ceil(n / 2));

        const moduleItems = modRows
          .map((m) => {
            const all = (Array.isArray(m.trainees) ? m.trainees : []) as any[];
            // Stagiaires réels : sans les fictifs (« Apprenant A ») ni ceux mis à la corbeille.
            const real = all.filter((t) => !isPlaceholder(t) && !trashed.has(t));
            const fake = all.filter((t) => isPlaceholder(t) || trashed.has(t));
            // Parcours du planning : la moitié au moins de ses stagiaires réels, sinon le même nom.
            let program: { id: string; title: string } | null = null;
            // Parcours enregistré par la synchronisation (migration 61).
            if (m.program_id) {
              const p = programs.find((x) => x.id === m.program_id);
              if (p) program = { id: p.id, title: p.title };
            }
            if (!program && real.length) {
              const best = programs.map((p) => ({ p, n: p.people.count(real) })).filter((x) => x.n >= half(real.length)).sort((x, y) => y.n - x.n)[0];
              if (best) program = { id: best.p.id, title: best.p.title };
            }
            if (!program && m.df_session_name) {
              const byName = matchCatalog(m.df_session_name, programs, '');
              if (byName.templateId && byName.score >= 0.75) program = { id: byName.templateId, title: byName.title || '' };
            }
            // Déjà sur le planning : session aux mêmes jours avec les mêmes stagiaires, ou parcours déjà posé cette semaine.
            let covered: string | null =
              m.covered_by === 'dismissed' ? 'Retiré de la liste' : m.covered_by === 'geiq-parcours' ? 'Parcours GEIQ déjà sur le planning : module Digiforma non repris' : null;
            // Personne de réel sur ces jours, ou stage / vacances : rien à placer en salle.
            if (covered) {
              // retiré à la main : rien d'autre à vérifier
            } else if (isCompanyPeriod(m.name || '')) covered = 'Stage en entreprise : période du parcours, pas de salle';
            else if (isOffPeriod(m.name || '')) covered = 'Pas de formation ces jours-là (vacances, fermeture…)';
            else if (!real.length) covered = all.length ? 'Aucun vrai stagiaire prévu (fictifs ou corbeille seulement)' : 'Aucun stagiaire prévu sur ces créneaux';
            const bySession = real.length ? sessPeople.find((x) => sameDays(x.start_at, x.end_at, m.start_at, m.end_at) && x.people.count(real) >= half(real.length)) : null;
            if (!covered && bySession) covered = `Déjà sur le planning : ${bySession.title}`;
            // Parcours GEIQ déjà créé à la main sur le planning : les modules Digiforma ne sont pas repris.
            const progFull = program ? programs.find((p) => p.id === program!.id) : null;
            if (!covered && progFull?.manual && GEIQ_RE.test(progFull.title)) covered = `Parcours GEIQ « ${progFull.title} » déjà sur le planning : module Digiforma non repris`;
            if (!covered && program) {
              const ev = ((progEvents as any[]) || []).find((e) => e.poec_id === program!.id && e.start_date <= m.end_at.slice(0, 10) && e.end_date >= m.start_at.slice(0, 10));
              const ps = sessPeople.find((x) => x.poec_id === program!.id && sameDays(x.start_at, x.end_at, m.start_at, m.end_at));
              if (ev || ps) covered = `Parcours « ${program.title} » déjà posé cette semaine${ps ? ` (${ps.title})` : ''}`;
            }
            const match = matchModule(m.whole_session ? m.df_session_name || '' : m.name || m.df_session_name || '', m.df_session_name || '', catalog);
            return {
              match,
              kind: 'module' as const,
              id: m.key as string,
              title: (m.whole_session ? m.df_session_name : m.name || m.df_session_name) || 'Module Digiforma',
              parent: m.whole_session ? null : (m.df_session_name as string | null),
              start_at: m.start_at as string,
              end_at: m.end_at as string,
              trainees: real.length,
              people: real.map((t) => ({ key: personKey(t), name: personName(t), waiting: t.status === 'en_attente' })),
              fake: fake.map((t) => ({ key: personKey(t), name: personName(t) || 'Sans nom' })),
              program,
              covered,
              dismissed: m.covered_by === 'dismissed',
              // GEIQ : parcours GEIQ, ou session Digiforma GEIQ (même si le module vient d'une session à part).
              geiq: GEIQ_RE.test(program?.title || '') || GEIQ_RE.test(m.df_session_name || '') || programs.some((p) => GEIQ_RE.test(p.title) && real.length > 0 && p.people.count(real) >= Math.max(1, Math.ceil(real.length / 2))),
            };
          });
        return [
          ...moduleItems,
          ...((held.data as any[]) || []).filter((x) => {
            const p = x.poec_id ? programs.find((q) => q.id === x.poec_id) : null;
            return !(p && p.manual && GEIQ_RE.test(p.title) && String(x.digiforma_ref || '').includes(':'));
          }).map((x) => ({
            match: null,
            kind: 'session' as const,
            id: x.id as string,
            title: x.title as string,
            parent: null,
            start_at: x.start_at as string,
            end_at: x.end_at as string,
            trainees: ((x.session_trainees as any[]) || []).filter((t) => t.status === 'validee').length,
            people: [],
            fake: [],
            program: null,
            covered: null,
            dismissed: false,
            geiq: false,
          })),
        ].sort((p, q) => p.start_at.localeCompare(q.start_at));
      })()
    : Promise.resolve([]);
  // Formateur : ses formations (en cours et à venir) en tête du planning.
  const myTrainerId = profile?.trainer_id || null;
  const mineQuery: Promise<MySession[] | null> = myTrainerId
    ? (async () => {
        const SEL = 'id, title, start_at, end_at, status, rooms(name, location, is_holding), session_trainees(status)';
        const [{ data: own }, { data: repl }] = await Promise.all([
          supabase.from('sessions').select(SEL).eq('trainer_id', myTrainerId).gte('end_at', today).neq('status', 'brouillon').order('start_at').limit(6),
          supabase.from('session_day_trainers').select('session_id, day').eq('trainer_id', myTrainerId).gte('day', today),
        ]);
        const replDays: Record<string, string[]> = {};
        for (const r of (repl as any[]) || []) (replDays[r.session_id] ||= []).push(r.day);
        const extraIds = Object.keys(replDays).filter((id) => !((own as any[]) || []).some((s) => s.id === id));
        const { data: extra } = extraIds.length ? await supabase.from('sessions').select(SEL).in('id', extraIds) : { data: [] as any[] };
        return [...((own as any[]) || []), ...((extra as any[]) || [])]
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
          .slice(0, 6)
          .map((s) => {
            const room = Array.isArray(s.rooms) ? s.rooms[0] : s.rooms;
            return {
              id: s.id,
              title: s.title,
              start_at: s.start_at,
              end_at: s.end_at,
              room: room?.is_holding ? null : room?.name || null,
              location: room?.location || null,
              trainees: ((s.session_trainees as any[]) || []).filter((t) => t.status === 'validee').length,
              replacementDays: (replDays[s.id] || []).sort(),
            };
          });
      })()
    : Promise.resolve(null);
  const { data: sessions } = await period.sessions;
  const sessionIdsEarly = ((sessions as any[]) || []).map((s) => s.id as string);
  // Données des sessions affichées, en parallèle elles aussi.
  const per = {
    dayRows: sessionIdsEarly.length
      ? start(supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', sessionIdsEarly))
      : Promise.resolve({ data: [] as any[] }),
    modules: sessionIdsEarly.length
      ? Promise.all([
          start(supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day').in('session_id', sessionIdsEarly).order('position')),
          start(supabase.from('session_trainee_modules').select('session_id, trainee_id, module_id').in('session_id', sessionIdsEarly)),
        ])
      : Promise.resolve([{ data: [] as any[] }, { data: [] as any[] }] as const),
    poec: sessionIdsEarly.length
      ? start(supabase.from('sessions').select('id, poec_programs(title, kind)').in('id', sessionIdsEarly).not('poec_id', 'is', null))
      : Promise.resolve({ data: [] as any[] }),
    by: sessionIdsEarly.length
      ? start(supabase.from('sessions').select('id, created_by, profiles!sessions_created_by_fkey(full_name)').in('id', sessionIdsEarly))
      : Promise.resolve({ data: [] as any[] }),
    billing: sessionIdsEarly.length
      ? start(supabase.from('sessions').select('id, billing_done').in('id', sessionIdsEarly))
      : Promise.resolve({ data: [] as any[], error: null }),
    // Lien Digiforma des autres documents (migration 36) : session 100 % dématérialisée.
    dfLink: sessionIdsEarly.length
      ? start(supabase.from('sessions').select('id, digiforma_docs_url').in('id', sessionIdsEarly))
      : Promise.resolve({ data: [] as any[], error: null }),
    // Factures nommées (lecture réservée à l'équipe et au compte Facturation).
    invoices: sessionIdsEarly.length
      ? start(supabase.from('session_invoices').select('session_id').in('session_id', sessionIdsEarly))
      : Promise.resolve({ data: [] as any[], error: null }),
    dayTrainers: loadDayTrainers(supabase, sessionIdsEarly),
    reservations: loadReservations(supabase, sessionIdsEarly),
  };

  const [{ data: workshops }, { data: absences }, { data: roomTemplates }] = await period.side;
  const { data: eventRows } = await period.events;
  // Salariés des évènements (migration 40) et salariés proposés dans le formulaire.
  const eventIds = ((eventRows as any[]) || []).map((e) => e.id as string);
  const [{ data: eventEmployees }, { data: employeeChoices }, { data: companyRows }] = await Promise.all([
    eventIds.length
      ? supabase.from('planning_event_employees').select('event_id, employee_id, employee_name').in('event_id', eventIds)
      : Promise.resolve({ data: [] as any[] }),
    canManage(profile?.role) ? supabase.rpc('event_employee_choices') : Promise.resolve({ data: [] as any[] }),
    // Entreprises de la base (formation INTRA : choix de l'entreprise sans faute de frappe).
    canManage(profile?.role) ? supabase.from('trainees').select('company').not('company', 'is', null).limit(20000) : Promise.resolve({ data: [] as any[] }),
  ]);
  const companies = (() => {
    const byKey = new Map<string, { name: string; n: number }>();
    for (const r of (companyRows as any[]) || []) {
      const name = String(r.company || '').trim();
      const k = companyKey(name);
      if (!k) continue;
      const cur = byKey.get(k);
      if (cur) cur.n++;
      else byKey.set(k, { name, n: 1 });
    }
    return [...byKey.values()].sort((a, b) => b.n - a.n).map((c) => ({ name: c.name, trainees: c.n }));
  })();
  const events = ((eventRows as any[]) || []).map((e) => ({
    ...e,
    trainer_ids: (e.planning_event_trainers || []).map((x: any) => x.trainer_id),
    employees: ((eventEmployees as any[]) || []).filter((x) => x.event_id === e.id).map((x) => ({ id: x.employee_id, name: x.employee_name })),
  }));

  // Stages en entreprise des parcours POEC (migration 23) : affichés comme évènements.
  const { data: stageRows } = await period.stages;
  for (const p of (stageRows as any[]) || []) {
    const prog = Array.isArray(p.poec_programs) ? p.poec_programs[0] : p.poec_programs;
    const n = prog?.poec_trainees?.length || 0;
    events.push({
      id: `stage-${p.id}`,
      kind: 'stage',
      title: `${prog?.title || 'POEC'} · ${p.label}`,
      start_date: p.start_date,
      end_date: p.end_date,
      start_time: null,
      end_time: null,
      location: 'En entreprise',
      participants: n ? `${n} stagiaire${n > 1 ? 's' : ''} du groupe` : null,
      notes: null,
      trainer_ids: [],
      href: `/poec/${p.program_id}`,
    });
  }

  // Liens utiles (bouton du planning) et supports des formations. Erreur ignorée si la migration 15 manque.
  const [{ data: usefulLinks }, { data: tLinks }] = await period.links;
  const templateTitles = new Map(((templates as any[]) || []).map((t) => [t.id, t.title as string]));
  const templateLinks = [...new Set(((tLinks as any[]) || []).map((l) => l.template_id))]
    .filter((id) => templateTitles.has(id))
    .map((id) => ({
      template_id: id,
      title: templateTitles.get(id)!,
      links: ((tLinks as any[]) || []).filter((l) => l.template_id === id),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  const sessionIds = (sessions || []).map((s: any) => s.id);
  const { data: dayRows } = await per.dayRows;

  // Modules : quel module a lieu chaque jour, et combien de stagiaires validés sont présents ce jour-là.
  const [{ data: moduleRows }, { data: linkRows }] = await per.modules;
  const dayInfo: Record<string, Record<string, { modules: string[]; present: number }>> = {};
  for (const s of (sessions as any[]) || []) {
    const mods = (moduleRows || []).filter((m: any) => m.session_id === s.id);
    if (!mods.length) continue;
    const chosen: Record<string, string[]> = {};
    for (const l of (linkRows || []).filter((x: any) => x.session_id === s.id)) (chosen[l.trainee_id] ||= []).push(l.module_id);
    const validatedIds = (s.session_trainees || []).filter((t: any) => t.status === 'validee').map((t: any) => t.trainee_id);
    for (const day of weekdaysBetween(s.start_at, s.end_at)) {
      const todays = mods.filter((m: any) => m.start_day <= day && m.end_day >= day);
      const present = validatedIds.filter((id: string) =>
        !chosen[id]?.length ? true : todays.some((m: any) => chosen[id].includes(m.id))
      ).length;
      (dayInfo[s.id] ||= {})[day] = { modules: todays.map((m: any) => m.name), present };
    }
  }

  // Avancement des dossiers (partagé avec le tableau de bord).
  const { dossierComplete, trainerDone, todo } = await computeDossierTodo(supabase as any, (sessions as any[]) || [], {
    dayRows: (dayRows as any[]) || [],
    moduleRows: (moduleRows as any[]) || [],
    linkRows: (linkRows as any[]) || [],
  });

  // Sessions rattachées à un parcours POEC (migration 23) : badge sur le planning.
  const poecTitles: Record<string, string> = {};
  if (sessionIds.length) {
    const first: any = await per.poec;
    let poecRows: any[] | null = first.data;
    // Sans la migration 43 (type de parcours) : titres seuls.
    if (first.error) poecRows = (await supabase.from('sessions').select('id, poec_programs(title)').in('id', sessionIds).not('poec_id', 'is', null)).data;
    for (const r of (poecRows as any[]) || []) {
      const prog = Array.isArray(r.poec_programs) ? r.poec_programs[0] : r.poec_programs;
      // Parcours personnalisé : son titre seul (il ne s'agit pas forcément d'une POEC).
      if (prog?.title) poecTitles[r.id] = prog.kind === 'personnalise' ? prog.title : `POEC · ${prog.title}`;
    }
  }

  // Créée par (migration 24) : affiché en petit sur le planning.
  const createdBy: Record<string, string> = {};
  if (sessionIds.length) {
    const { data: byRows } = await per.by;
    for (const r of (byRows as any[]) || []) {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (p?.full_name) createdBy[r.id] = shortName(p.full_name);
    }
  }

  // Pastille dossier (migration 30) : « Dossier complet » seulement une fois la facturation faite.
  // L'équipe voit où en est la facturation ; le formateur voit si sa partie est remplie.
  const staffView = canManage(profile?.role) || Boolean(profile?.can_invoice);
  const [{ data: billRows, error: billError }, { data: invRows }, { data: dfRows, error: dfError }] = await Promise.all([per.billing, per.invoices, per.dfLink]);
  const dossierBadge: Record<string, DossierBadge> = dossierBadges({
    sessions: (sessions as any[]) || [],
    todo: { dossierComplete, trainerDone, todo },
    billRows: billRows as any[],
    billError,
    invRows: invRows as any[],
    dfRows: dfRows as any[],
    dfError,
    staffView,
    trainerId: profile?.trainer_id || null,
    nowKey: parisNowKey(),
  });

  // Remplaçants certains jours (migration 19).
  const dayTrainers = await per.dayTrainers;
  // Places réservées par entreprise encore sans nom (migration 20).
  const reservations = await per.reservations;
  const reservedSeats: Record<string, number> = {};
  // Places d'entreprise en attente (migration 50) : hors capacité, ajoutées aux « en attente ».
  const reservedPending: Record<string, number> = {};
  for (const s of (sessions as any[]) || []) {
    if (!reservations[s.id]) continue;
    const companies = (s.session_trainees || [])
      .filter((t: any) => t.status === 'validee')
      .map((t: any) => (Array.isArray(t.trainees) ? t.trainees[0] : t.trainees)?.company);
    const st = reservationStatus(reservations[s.id], companies);
    if (st.unnamed) reservedSeats[s.id] = st.unnamed;
    if (st.pending) reservedPending[s.id] = st.pending;
  }

  const dayOverrides: Record<string, { day: string; start_time: string; end_time: string }[]> = {};
  for (const row of dayRows || []) {
    (dayOverrides[row.session_id] ||= []).push({ day: row.day, start_time: row.start_time, end_time: row.end_time });
  }

  return (
    <main>
      <Planning
        view={currentView}
        canEdit={canManage(profile?.role)}
        myTrainerId={profile?.trainer_id || null}
        rooms={[...((rooms as any[]) || [])].sort(compareRooms).map((r) => ({
          ...r,
          template_ids: ((roomTemplates as any[]) || []).filter((x) => x.room_id === r.id).map((x) => x.template_id),
        }))}
        trainers={(trainers as any) || []}
        templates={((templates as any[]) || []).map((t) => ({
          ...t,
          trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
          modules: [...(t.template_modules || [])].sort((a: any, b: any) => a.position - b.position),
        }))}
        sessions={(sessions as any) || []}
        dayOverrides={dayOverrides}
        mondayIso={isoDate(monday)}
        monthAnchorIso={isoDate(monthAnchor)}
        dayIso={isoDate(dayAnchor)}
        todayIso={isoDate(new Date())}
        workshops={(workshops as any) || []}
        absences={(absences as any) || []}
        dayInfo={dayInfo}
        events={events}
        employees={((employeeChoices as any[]) || []).map((x) => ({ id: x.id as string, name: x.full_name as string }))}
        companies={companies}
        usefulLinks={(usefulLinks as any) || []}
        templateLinks={templateLinks}
        dossierBadge={dossierBadge}
        dayTrainers={dayTrainers}
        reservedSeats={reservedSeats}
        reservedPending={reservedPending}
        poecTitles={poecTitles}
        createdBy={createdBy}
        renderedAt={Date.now()}
        nowKey={parisNowKey()}
        mine={await mineQuery.then((list) => (list ? <MySessions sessions={list} nowKey={parisNowKey()} /> : null))}
        alerts={<SessionAlerts alerts={await alertsQuery} todayIso={today} />}
        toAssign={await toAssignQuery}
        toAssignPrograms={toAssignPrograms}
        toAssignWeek={currentView === 'month' ? null : isoDate(weekStart)}
      />
    </main>
  );
}
