import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { canEditSessions } from '@/lib/roles';
import { Sidebar } from '@/components/sidebar';
import { SessionsTable } from '@/components/sessions-table';
import { Download } from 'lucide-react';

export default async function SessionsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const editable = canManage(profile?.role);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, max_trainees, trainer_id, rooms(name, is_holding), trainers(full_name, color), session_trainees(status)')
    .order('start_at', { ascending: false })
    .limit(500);

  return (
    <main>
      <Sidebar active="/sessions" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Planning</p>
            <h1>Sessions</h1>
            <p>Toutes les sessions, passées et à venir, avec leur statut.</p>
          </div>
          {editable && (
            <div className="header-actions">
              <a href="/sessions/export" className="btn"><Download size={15} aria-hidden /> Export CSV</a>
            </div>
          )}
        </header>
        <SessionsTable isAdmin={editable} canEditStatus={canEditSessions(profile?.role)} myTrainerId={profile?.trainer_id || null} rows={(sessions as any) || []} />
      </section>
    </main>
  );
}
