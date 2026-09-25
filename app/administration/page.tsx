import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminUsersTable } from '@/components/admin-users-table';
import { AdminTabs, AdminResourceLinks } from '@/components/admin-tabs';

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
            <p>Comptes, paramètres et intégrations de la plateforme.</p>
          </div>
        </header>

        <AdminTabs active="/administration" />

        <h2 className="sub-heading" style={{ marginTop: 4 }}>Utilisateurs</h2>
        <AdminUsersTable rows={profiles || []} currentUserId={user?.id || ''} />

        <h2 className="sub-heading">Contenu de la plateforme</h2>
        <AdminResourceLinks />
      </section>
    </main>
  );
}
