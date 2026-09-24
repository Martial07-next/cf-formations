import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Planning } from '@/components/planning';
import { mondayOf, addDays, isoDate, firstOfMonth, monthWeekGrid } from '@/lib/week';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; month?: string }>;
}) {
  const { week, view, month } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const isMonthView = view === 'month';

  const [{ data: rooms }, { data: trainers }, { data: templates }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity').order('name'),
    supabase.from('trainers').select('id, full_name').order('full_name'),
    supabase.from('templates').select('id, title, duration_hours').order('title'),
  ]);

  if (isMonthView) {
    const anchor = month ? new Date(month + '-01T00:00:00Z') : firstOfMonth(new Date());
    const weeks = monthWeekGrid(anchor);
    const rangeStart = weeks[0][0];
    const rangeEnd = addDays(weeks[weeks.length - 1][4], 1);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, title, status, start_at, end_at, room_id, trainer_id, rooms(name), trainers(full_name)')
      .gte('start_at', isoDate(rangeStart))
      .lt('start_at', isoDate(rangeEnd))
      .order('start_at');

    return (
      <main>
        <Sidebar active="/" profile={profile} />
        <Planning
          view="month"
          isAdmin={profile?.role === 'admin'}
          rooms={rooms || []}
          trainers={trainers || []}
          templates={templates || []}
          sessions={(sessions as any) || []}
          mondayIso={isoDate(mondayOf(new Date()))}
          monthAnchorIso={isoDate(anchor)}
        />
      </main>
    );
  }

  const monday = week ? mondayOf(new Date(week)) : mondayOf(new Date());
  const weekEnd = addDays(monday, 5); // exclusif (samedi 00:00)

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, room_id, trainer_id, trainers(full_name)')
    .gte('start_at', isoDate(monday))
    .lt('start_at', isoDate(weekEnd))
    .order('start_at');

  return (
    <main>
      <Sidebar active="/" profile={profile} />
      <Planning
        view="week"
        isAdmin={profile?.role === 'admin'}
        rooms={rooms || []}
        trainers={trainers || []}
        templates={templates || []}
        sessions={(sessions as any) || []}
        mondayIso={isoDate(monday)}
        monthAnchorIso={isoDate(firstOfMonth(new Date()))}
      />
    </main>
  );
}
