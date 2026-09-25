import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';
import { SettingsForm } from '@/components/settings-form';

export default async function ParametresPage() {
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

  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', true).maybeSingle();

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
        <AdminTabs active="/administration/parametres" />
        <SettingsForm
          settings={
            settings || {
              company_name: 'CF Réseau',
              company_address: null,
              default_session_duration_hours: 7,
              notify_on_conflict: true,
            }
          }
        />
      </section>
    </main>
  );
}
