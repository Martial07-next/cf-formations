import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';
import { PurgePanel } from '@/components/purge-panel';
import { PURGE_CONFIRM_PHRASE as CONFIRM_PHRASE } from '@/lib/purge';

export default async function DonneesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  if (profile?.role !== 'admin') {
    return (
      <main>
        <Sidebar active="/administration" profile={profile} />
        <section className="content">
          <p className="empty">Accès réservé aux administrateurs.</p>
        </section>
      </main>
    );
  }

  const count = async (table: string, holding = false) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (holding) q = q.eq('is_holding', false);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [sessions, stagiaires, formateurs, formations, salles] = await Promise.all([
    count('sessions'),
    count('trainees'),
    count('trainers'),
    count('templates'),
    count('rooms', true),
  ]);

  return (
    <main>
      <Sidebar active="/administration" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Bureau administratif</p>
            <h1>Administration</h1>
            <p>Comptes, paramètres et intégrations de la plateforme.</p>
          </div>
        </header>
        <AdminTabs active="/administration/donnees" />
        <PurgePanel phrase={CONFIRM_PHRASE} counts={{ sessions, stagiaires, formateurs, formations, salles }} />
      </section>
    </main>
  );
}
