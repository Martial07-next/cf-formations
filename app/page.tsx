import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Planning } from '@/components/planning';
import { mondayOf, addDays, isoDate, firstOfMonth, monthWeekGrid } from '@/lib/week';

const SESSION_SELECT =
  'id, title, reference, status, start_at, end_at, room_id, trainer_id, max_trainees, notes, rooms(name), trainers(full_name), session_trainees(status)';

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
    supabase.from('rooms').select('id, name, capacity').order('name'),
    supabase.from('trainers').select('id, full_name').order('full_name'),
    supabase.from('templates').select('id, title, duration_hours').order('title'),
  ]);

  let rangeStart: Date;
  let rangeEnd: Date; // exclusif
  let monthAnchor = firstOfMonth(new Date());
  let dayAnchor = day ? new Date(day + 'T00:00:00Z') : new Date(isoDate(new Date()) + 'T00:00:00Z');
  let monday = week ? mondayOf(new Date(week)) : mondayOf(new Date());

  if (currentView === 'month') {
    monthAnchor = month ? new Date(month + '-01T00:00:00Z') : firstOfMonth(new Date());
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

  // On élargit légèrement la requête (±1 jour) pour ne pas rater une session
  // multi-jours qui commence avant ou finit après la période visible.
  const { data: sessions } = await supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .lt('start_at', isoDate(rangeEnd))
    .gt('end_at', isoDate(addDays(rangeStart, -1)))
    .order('start_at');

  const sessionIds = (sessions || []).map((s: any) => s.id);
  const { data: dayRows } = sessionIds.length
    ? await supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', sessionIds)
    : { data: [] as any[] };

  const dayOverrides: Record<string, { day: string; start_time: string; end_time: string }[]> = {};
  for (const row of dayRows || []) {
    (dayOverrides[row.session_id] ||= []).push({ day: row.day, start_time: row.start_time, end_time: row.end_time });
  }

  return (
    <main>
      <Sidebar active="/" profile={profile} />
      <Planning
        view={currentView}
        isAdmin={profile?.role === 'admin'}
        rooms={rooms || []}
        trainers={trainers || []}
        templates={templates || []}
        sessions={(sessions as any) || []}
        dayOverrides={dayOverrides}
        mondayIso={isoDate(monday)}
        monthAnchorIso={isoDate(monthAnchor)}
        dayIso={isoDate(dayAnchor)}
      />
    </main>
  );
}
