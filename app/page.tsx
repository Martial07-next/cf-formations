import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Planning } from '@/components/planning';
import { compareRooms } from '@/lib/buildings';
import { mondayOf, addDays, isoDate, firstOfMonth, monthWeekGrid, weekdaysBetween } from '@/lib/week';

const SESSION_SELECT =
  'id, title, status, start_at, end_at, room_id, trainer_id, max_trainees, notes, rooms(name), trainers(full_name, color), session_trainees(status, trainee_id)';

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
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
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
  const [{ data: workshops }, { data: absences }] = await Promise.all([
    supabase.from('room_workshops').select('id, room_id, name, equipment, modules').order('name'),
    supabase
      .from('trainer_absences')
      .select('id, trainer_id, start_date, end_date, kind, note')
      .gte('end_date', absencesFrom)
      .order('start_date')
      .limit(2000),
  ]);

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
        rooms={[...((rooms as any[]) || [])].sort(compareRooms)}
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
      />
    </main>
  );
}
