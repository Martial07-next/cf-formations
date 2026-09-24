import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { SessionsTable } from '@/components/sessions-table';

export default async function SessionsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, rooms(name), trainers(full_name)')
    .order('start_at', { ascending: false })
    .limit(200);

  return (
    <main>
      <Sidebar active="/sessions" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Sessions</h1>
            <p>Toutes les sessions, passées et à venir, avec leur statut.</p>
          </div>
        </header>
        <SessionsTable isAdmin={profile?.role === 'admin'} rows={(sessions as any) || []} />
      </section>
    </main>
  );
}
