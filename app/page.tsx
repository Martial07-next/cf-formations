import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { Planning } from '@/components/planning';
import { mondayOf, addDays, isoDate } from '@/lib/week';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const monday = week ? mondayOf(new Date(week)) : mondayOf(new Date());
  const weekEnd = addDays(monday, 5); // exclusif (samedi 00:00)

  const [{ data: rooms }, { data: trainers }, { data: templates }, { data: sessions }] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity').order('name'),
    supabase.from('trainers').select('id, full_name').order('full_name'),
    supabase.from('templates').select('id, title, duration_hours').order('title'),
    supabase
      .from('sessions')
      .select('id, title, status, start_at, end_at, room_id, trainer_id, trainers(full_name)')
      .gte('start_at', isoDate(monday))
      .lt('start_at', isoDate(weekEnd))
      .order('start_at'),
  ]);

  return (
    <main>
      <Sidebar active="/" profile={profile} />
      <Planning
        isAdmin={profile?.role === 'admin'}
        rooms={rooms || []}
        trainers={trainers || []}
        templates={templates || []}
        sessions={(sessions as any) || []}
        mondayIso={isoDate(monday)}
      />
    </main>
  );
}
