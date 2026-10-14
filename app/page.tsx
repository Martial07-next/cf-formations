import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Planning } from '@/components/planning';
import { compareRooms } from '@/lib/buildings';
import { sessionSlots, dossierProgress } from '@/lib/dossier';
import { appreciationRequired } from '@/lib/appreciation';
import { loadDayTrainers } from '@/lib/day-trainers';
import { loadReservations, reservationStatus } from '@/lib/reservations';
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
  const currentView = view === 'month' ? 'month' : view === 'day' ? 'day' : 'week';

  const [{ data: rooms }, { data: trainers }, { data: templates }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity, is_holding, status, location').order('name'),
    supabase.from('trainers').select('*').order('full_name'),
    supabase
      .from('templates')
      .select('id, title, category, duration_hours, max_trainees, template_trainers(trainer_id), template_modules(name, duration_hours, position)')
      .order('title'),
  ]);

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

  // Requête légèrement élargie (±1 jour) pour ne pas rater une session
  // multi-jours qui commence avant ou finit après la période visible.
  const { data: sessions } = await supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .lt('start_at', isoDate(rangeEnd))
    .gt('end_at', isoDate(addDays(rangeStart, -1)))
    .order('start_at');

  // Ateliers (bouton sur le planning) et congés des formateurs (à partir du début de la période visible).
  const absencesFrom = isoDate(rangeStart) < isoDate(new Date()) ? isoDate(rangeStart) : isoDate(new Date());
  const [{ data: workshops }, { data: absences }, { data: roomTemplates }] = await Promise.all([
    supabase.from('room_workshops').select('id, room_id, name').order('name'),
    supabase
      .from('trainer_absences')
      .select('id, trainer_id, start_date, end_date, kind, note')
      .gte('end_date', absencesFrom)
      .order('start_date')
      .limit(2000),
    supabase.from('room_templates').select('room_id, template_id'),
  ]);

  // Évènements de la période (repas, CACES/SST, recrutement, forums…) : aperçu seulement.
  const { data: eventRows } = await supabase
    .from('planning_events')
    .select('id, kind, title, start_date, end_date, start_time, end_time, location, participants, notes, planning_event_trainers(trainer_id)')
    .lte('start_date', isoDate(addDays(rangeEnd, -1)))
    .gte('end_date', isoDate(rangeStart))
    .order('start_date');
  const events = ((eventRows as any[]) || []).map((e) => ({
    ...e,
    trainer_ids: (e.planning_event_trainers || []).map((x: any) => x.trainer_id),
  }));

  // Stages en entreprise des parcours POEC (migration 23) : affichés comme évènements.
  const { data: stageRows } = await supabase
    .from('poec_periods')
    .select('id, label, start_date, end_date, program_id, poec_programs(title, poec_trainees(trainee_id))')
    .lte('start_date', isoDate(addDays(rangeEnd, -1)))
    .gte('end_date', isoDate(rangeStart))
    .order('start_date');
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
  const [{ data: usefulLinks }, { data: tLinks }] = await Promise.all([
    supabase.from('useful_links').select('id, category, label, url, description, position').order('position'),
    supabase.from('template_links').select('id, template_id, label, url, position').order('position'),
  ]);
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
  const { data: dayRows } = sessionIds.length
    ? await supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', sessionIds)
    : { data: [] as any[] };

  // Modules : quel module a lieu chaque jour, et combien de stagiaires validés sont présents ce jour-là.
  const [{ data: moduleRows }, { data: linkRows }] = sessionIds.length
    ? await Promise.all([
        supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day').in('session_id', sessionIds).order('position'),
        supabase.from('session_trainee_modules').select('session_id, trainee_id, module_id').in('session_id', sessionIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
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

  // Dossiers complets (émargement + documents obligatoires), si la migration 16 est faite.
  const dossierComplete: Record<string, boolean> = {};
  if (sessionIds.length) {
    const sigs: any[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase
        .from('attendance_signatures')
        .select('session_id, signer, trainee_id, day, half')
        .in('session_id', sessionIds)
        .range(from, from + 999);
      if (error || !data) break;
      sigs.push(...data);
      if (data.length < 1000) break;
    }
    const templateIds = [...new Set(((sessions as any[]) || []).map((x) => x.template_id).filter(Boolean))];
    const [{ data: docs }, { data: entries }, { data: forms, error: formsError }, { data: tplOpts }] = await Promise.all([
      supabase
        .from('dossier_documents')
        .select('id, template_id, session_id, required, filled_by')
        .or([`session_id.in.(${sessionIds.join(',')})`, templateIds.length ? `template_id.in.(${templateIds.join(',')})` : ''].filter(Boolean).join(',')),
      supabase.from('dossier_entries').select('session_id, document_id, completed').in('session_id', sessionIds),
      supabase.from('session_forms').select('session_id, completed').eq('kind', 'tour_de_table').in('session_id', sessionIds),
      templateIds.length ? supabase.from('templates').select('id, tour_de_table').in('id', templateIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const tdtOff = new Set(((tplOpts as any[]) || []).filter((t) => t.tour_de_table === false).map((t) => t.id));
    // Fiches d'appréciation (migration 21) : ignorées si la migration manque.
    const [{ data: faiForms, error: faiErr }, { data: faiSess }, { data: faiTpl }] = await Promise.all([
      supabase.from('session_forms').select('session_id, completed').eq('kind', 'appreciation').in('session_id', sessionIds),
      supabase.from('sessions').select('id, fiche_appreciation').in('id', sessionIds),
      templateIds.length ? supabase.from('templates').select('id, fiche_appreciation').in('id', templateIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    for (const s of (sessions as any[]) || []) {
      const traineeIds = (s.session_trainees || []).filter((t: any) => t.status === 'validee').map((t: any) => t.trainee_id);
      if (!traineeIds.length) continue;
      const traineeModules: Record<string, string[]> = {};
      for (const l of (linkRows || []).filter((x: any) => x.session_id === s.id)) (traineeModules[l.trainee_id] ||= []).push(l.module_id);
      const p = dossierProgress({
        slots: sessionSlots(s.start_at, s.end_at, (dayRows || []).filter((d: any) => d.session_id === s.id) as any),
        traineeIds,
        modules: (moduleRows || []).filter((m: any) => m.session_id === s.id),
        traineeModules,
        signatures: sigs.filter((x) => x.session_id === s.id),
        documents: ((docs as any[]) || []).filter((d) => d.session_id === s.id || (s.template_id && d.template_id === s.template_id)),
        entries: ((entries as any[]) || []).filter((e) => e.session_id === s.id),
        // Tour de table obligatoire (sauf formation qui le désactive, ou migration 17 absente).
        forms: [
          ...(formsError || (s.template_id && tdtOff.has(s.template_id))
            ? []
            : [{ completed: ((forms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }]),
          ...(!faiErr &&
          appreciationRequired(
            ((faiSess as any[]) || []).find((x) => x.id === s.id)?.fiche_appreciation ?? null,
            ((faiTpl as any[]) || []).find((x) => x.id === s.template_id)?.fiche_appreciation
          )
            ? [{ completed: ((faiForms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }]
            : []),
        ],
      });
      if (p.complete) dossierComplete[s.id] = true;
    }
  }

  // Sessions rattachées à un parcours POEC (migration 23) : badge sur le planning.
  const poecTitles: Record<string, string> = {};
  if (sessionIds.length) {
    const { data: poecRows } = await supabase.from('sessions').select('id, poec_programs(title)').in('id', sessionIds).not('poec_id', 'is', null);
    for (const r of (poecRows as any[]) || []) {
      const prog = Array.isArray(r.poec_programs) ? r.poec_programs[0] : r.poec_programs;
      if (prog?.title) poecTitles[r.id] = prog.title;
    }
  }

  // Remplaçants certains jours (migration 19).
  const dayTrainers = await loadDayTrainers(supabase, sessionIds);
  // Places réservées par entreprise encore sans nom (migration 20).
  const reservations = await loadReservations(supabase, sessionIds);
  const reservedSeats: Record<string, number> = {};
  for (const s of (sessions as any[]) || []) {
    if (!reservations[s.id]) continue;
    const companies = (s.session_trainees || [])
      .filter((t: any) => t.status === 'validee')
      .map((t: any) => (Array.isArray(t.trainees) ? t.trainees[0] : t.trainees)?.company);
    const n = reservationStatus(reservations[s.id], companies).unnamed;
    if (n) reservedSeats[s.id] = n;
  }

  const dayOverrides: Record<string, { day: string; start_time: string; end_time: string }[]> = {};
  for (const row of dayRows || []) {
    (dayOverrides[row.session_id] ||= []).push({ day: row.day, start_time: row.start_time, end_time: row.end_time });
  }

  return (
    <main>
      <Sidebar active="/" profile={profile} />
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
        usefulLinks={(usefulLinks as any) || []}
        templateLinks={templateLinks}
        dossierComplete={dossierComplete}
        dayTrainers={dayTrainers}
        reservedSeats={reservedSeats}
        poecTitles={poecTitles}
      />
    </main>
  );
}
