import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';

export default async function IntegrationsPage() {
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

  const { data: settings } = await supabase.from('app_settings').select('digiforma_enabled').eq('id', true).maybeSingle();

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
        <AdminTabs active="/administration/integrations" />

        <div className="panel" style={{ maxWidth: 640 }}>
          <h2>Digiforma</h2>
          <div className="counters" style={{ marginBottom: 16 }}>
            <div className="counter-chip" style={{ minWidth: 160 }}>
              <strong style={{ fontSize: 15 }}>Non connecté</strong>
              <span>Statut</span>
            </div>
            <div className="counter-chip" style={{ minWidth: 160 }}>
              <strong style={{ fontSize: 15 }}>—</strong>
              <span>Dernière synchronisation</span>
            </div>
          </div>

          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Digiforma propose une API GraphQL (à activer depuis Digiforma → réglages → Interconnexion → GraphQL),
            mais <strong>pas de webhooks</strong> : il n'y a pas de notification en temps réel quand quelque chose
            change côté Digiforma. Une synchronisation automatique fonctionnerait donc par interrogation régulière
            de l'API (toutes les X minutes/heures), pas de façon instantanée.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Cette synchronisation n'est <strong>pas encore développée</strong> sur cette plateforme. La mettre en
            place demande : une clé API Digiforma stockée côté serveur (jamais visible dans cette interface), une
            tâche planifiée qui interroge Digiforma à intervalle régulier, et une logique de correspondance entre
            les sessions/stagiaires des deux systèmes pour éviter les doublons.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>
            En attendant, une alternative réaliste : exporter les sessions/stagiaires de cette plateforme en CSV
            pour import dans Digiforma (ou l'inverse), le temps de qualifier le besoin exact de synchronisation.
          </p>

          <div style={{ marginTop: 16, padding: '12px 14px', background: '#f5faf5', borderRadius: 10, fontSize: 13 }}>
            {settings?.digiforma_enabled
              ? 'Marqué comme "à activer" dans les paramètres — reste à développer la synchronisation elle-même.'
              : "Non activé pour l'instant."}
          </div>
        </div>
      </section>
    </main>
  );
}
