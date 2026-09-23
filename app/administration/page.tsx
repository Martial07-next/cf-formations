import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminUsersTable } from '@/components/admin-users-table';

export default async function AdministrationPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  if (profile?.role !== 'admin') {
    return (
      <main>
        <Sidebar active="/administration" profile={profile} />
        <section className="content">
          <header>
            <div>
              <p className="eyebrow">Organisation des formations</p>
              <h1>Administration</h1>
              <p>Accès réservé aux administrateurs.</p>
            </div>
          </header>
          <p className="empty">Ton compte n'a pas les droits nécessaires pour cette page.</p>
        </section>
      </main>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .order('created_at');

  return (
    <main>
      <Sidebar active="/administration" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Administration</h1>
            <p>Gère les comptes utilisateurs et leurs rôles d'accès.</p>
          </div>
        </header>
        <AdminUsersTable rows={profiles || []} currentUserId={user?.id || ''} />
      </section>
    </main>
  );
}
