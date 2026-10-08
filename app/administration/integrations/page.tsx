import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';
import { DigiformaTestButton } from '@/components/digiforma-test-button';
import { DigiformaSyncPanel } from '@/components/digiforma-sync-panel';

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

  const { data: settings } = await supabase
    .from('app_settings')
    .select('digiforma_last_sync, digiforma_last_sync_status, digiforma_last_sync_log, absences_last_sync, absences_last_log')
    .eq('id', true)
    .maybeSingle();

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
        <AdminTabs active="/administration/integrations" />

        <div className="panel">
          <h2>Digiforma — clé API (à faire par toi)</h2>
          <p className="panel-intro">
            La clé n’est <strong>jamais</strong> saisie dans cette interface ni enregistrée dans la base : elle reste dans
            les variables d’environnement du serveur, invisible pour les navigateurs.
          </p>
          <ol style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 20, margin: '0 0 6px' }}>
            <li>Dans Digiforma : Réglages → Interconnexion → API GraphQL → générer une clé.</li>
            <li>
              Dans Vercel : Settings → Environment Variables → ajouter <code>DIGIFORMA_API_TOKEN</code> (sans préfixe{' '}
              <code>NEXT_PUBLIC_</code>), environnement <em>Production</em>.
            </li>
            <li>
              Ajouter aussi <code>CRON_SECRET</code> (une longue chaîne aléatoire) : sans elle, la synchronisation
              automatique refuse de s’exécuter. Et <code>SUPABASE_SERVICE_ROLE_KEY</code> si ce n’est pas déjà fait.
            </li>
            <li>Redéployer, puis tester la connexion ci-dessous.</li>
          </ol>
          <DigiformaTestButton />
          <p className="hint" style={{ marginTop: 12, lineHeight: 1.6 }}>
            Ce test exécute une requête d’introspection (sans effet) sur l’API Digiforma. S’il échoue avec « Cannot query
            field… », les noms de champs du code doivent être ajustés au schéma réel de ton compte : envoie-moi le message
            exact.
          </p>
        </div>

        <div className="panel">
          <h2>Plateforme de congés → planning</h2>
          <p className="panel-intro">
            Quand un congé est <strong>validé</strong> dans ta plateforme de congés, il arrive ici automatiquement et
            bloque le formateur sur ces dates. Un congé refusé, annulé ou supprimé est retiré. Aucune API à développer :
            c’est Supabase (côté plateforme de congés) qui envoie l’information.
          </p>
          <ol style={{ fontSize: 13.5, lineHeight: 1.8, paddingLeft: 20, margin: '0 0 10px' }}>
            <li>
              Dans <strong>Vercel</strong> (projet cf-formations) : ajoute la variable <code>CONGES_WEBHOOK_SECRET</code>{' '}
              (une longue chaîne aléatoire), puis redéploie.
            </li>
            <li>
              Dans le <strong>Supabase de la plateforme de congés</strong> : Database → Webhooks → Create a new hook.
              Table : celle des demandes de congés · Événements : Insert, Update, Delete · Type : HTTP Request, méthode
              POST · URL : <code>https://cf-formations.vercel.app/api/hooks/conges</code> · En-tête HTTP :{' '}
              <code>Authorization</code> = <code>Bearer</code> suivi d’un espace et du secret.
            </li>
            <li>
              Le formateur est reconnu par son <strong>e-mail</strong> (ou son nom) : il doit être identique dans les deux
              plateformes (fiche formateur → E-mail).
            </li>
            <li>
              Pour envoyer les congés déjà validés, modifie-les une fois (ou demande-moi la requête SQL à lancer côté
              congés).
            </li>
          </ol>
          <div className="counters" style={{ margin: '12px 0' }}>
            <div className="counter-chip" style={{ minWidth: 200 }}>
              <strong style={{ fontSize: 14 }}>
                {settings?.absences_last_sync ? new Date(settings.absences_last_sync).toLocaleString('fr-FR') : 'Jamais'}
              </strong>
              <span>Dernier congé reçu</span>
            </div>
          </div>
          {settings?.absences_last_log && <p className="log-box">{settings.absences_last_log}</p>}
        </div>

        <DigiformaSyncPanel
          lastSync={{
            at: settings?.digiforma_last_sync || null,
            status: settings?.digiforma_last_sync_status || null,
            log: settings?.digiforma_last_sync_log || null,
          }}
        />

        <div className="panel">
          <h2>Import direct par session</h2>
          <p className="panel-intro" style={{ margin: 0 }}>
            Chaque fiche session propose aussi un champ « référence Digiforma » et un bouton pour récupérer ses stagiaires
            inscrits, sans ressaisie — utile pour relancer l’import quand un stagiaire est ajouté côté Digiforma.
          </p>
        </div>

        <div className="panel">
          <h2>Export / import CSV</h2>
          <p className="panel-intro">
            En complément (ou en attendant la connexion API), les sessions et stagiaires peuvent être exportés en
            CSV, et des stagiaires peuvent être importés en masse directement depuis une fiche session.
          </p>
          <div className="row-actions">
            <a href="/sessions/export" className="btn">Exporter les sessions (CSV)</a>
            <a href="/stagiaires/export" className="btn">Exporter les stagiaires (CSV)</a>
          </div>
        </div>
      </section>
    </main>
  );
}
