import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { AdminTabs } from '@/components/admin-tabs';
import { SettingsForm } from '@/components/settings-form';

export default async function ParametresPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  if (profile?.role !== 'admin') {
    return (
      <main>
        <section className="content">
          <p className="empty">Accès réservé aux administrateurs.</p>
        </section>
      </main>
    );
  }

  const { data: settings } = await supabase.from('app_settings').select('*').eq('id', true).maybeSingle();

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Bureau administratif</p>
            <h1>Administration</h1>
            <p>Comptes, paramètres et intégrations de la plateforme.</p>
          </div>
        </header>
        <AdminTabs active="/administration/parametres" />
        <SettingsForm
          settings={
            settings || {
              company_name: 'CF Réseaux',
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
