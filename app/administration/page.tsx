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
              <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
              <h1>Administration</h1>
            </div>
          </header>
          <p className="empty">Accès réservé aux administrateurs.</p>
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
            <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
            <h1>Administration</h1>
          </div>
        </header>
        <p style={{ color: 'var(--muted)', marginTop: '-14px', marginBottom: '20px', fontSize: '14px' }}>
          Gère les comptes utilisateurs et leurs rôles d&apos;accès.
        </p>
        <AdminUsersTable rows={profiles || []} currentUserId={user?.id || ''} />
      </section>
    </main>
  );
}
