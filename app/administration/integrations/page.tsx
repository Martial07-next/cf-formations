import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { AdminTabs } from '@/components/admin-tabs';
import { DigiformaTestButton } from '@/components/digiforma-test-button';
import { DigiformaSyncPanel } from '@/components/digiforma-sync-panel';
import { CongesSyncPanel } from '@/components/conges-sync-panel';
import { congesConfigured } from '@/lib/conges-sync';
import { BackLink } from '@/components/back-link';

export default async function IntegrationsPage() {
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

  const { data: settings } = await supabase
    .from('app_settings')
    .select('digiforma_last_sync, digiforma_last_sync_status, digiforma_last_sync_log, absences_last_sync, absences_last_log')
    .eq('id', true)
    .maybeSingle();
  // Congés saisis à la main (avant la plateforme de congés).
  const { count: manualCount } = await supabase.from('trainer_absences').select('id', { count: 'exact', head: true }).neq('source', 'conges');

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <BackLink />
            <p className="eyebrow">Bureau administratif</p>
            <h1>Administration</h1>
            <p>Comptes, paramètres et intégrations de la plateforme.</p>
          </div>
        </header>
        <AdminTabs active="/administration/integrations" />

        <div className="panel">
          <h2>Digiforma : clé API (à faire par toi)</h2>
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

        <div className="panel" id="conges">
          <h2>Plateforme de congés → planning</h2>
          <p className="panel-intro">
            Les congés <strong>validés</strong> dans CF Réseaux Congés bloquent automatiquement le formateur sur le
            planning (télétravail, jours travaillés et fériés exclus). Un congé refusé, annulé ou supprimé est retiré.
            Le planning lit la base des congés avec un compte en <strong>lecture seule</strong>, limité aux colonnes
            utiles : aucune modification n’est possible depuis le planning.
          </p>
          <ol style={{ fontSize: 13.5, lineHeight: 1.8, paddingLeft: 20, margin: '0 0 12px' }}>
            <li>
              Dans le <strong>Supabase de la plateforme de congés</strong> : SQL Editor → colle le script ci-dessous,
              remplace le mot de passe, puis Run.
            </li>
            <li>
              Toujours dans ce Supabase : bouton <strong>Connect</strong> → <em>Transaction pooler</em> → copie l’adresse
              (port 6543) et remplace l’utilisateur <code>postgres.xxxx</code> par <code>planning_lecture.xxxx</code>{' '}
              (même suffixe) et le mot de passe par celui du script.
            </li>
            <li>
              Dans <strong>Vercel</strong> (projet cf-formations) : Settings → Environment Variables → ajoute{' '}
              <code>CONGES_DATABASE_URL</code> avec cette adresse (Production), puis redéploie.
            </li>
            <li>
              Clique sur « Synchroniser maintenant ». Le formateur est reconnu par son <strong>e-mail</strong> (sinon
              prénom + nom) : il doit être le même dans les deux plateformes.
            </li>
            <li>
              Une fois les congés vérifiés sur le planning, supprime les congés saisis à la main : la saisie manuelle
              est retirée des fiches formateurs.
            </li>
          </ol>
          <CongesSyncPanel configured={congesConfigured()} manualCount={manualCount ?? 0} />
          <div className="counters" style={{ margin: '14px 0 8px' }}>
            <div className="counter-chip" style={{ minWidth: 200 }}>
              <strong style={{ fontSize: 14 }}>
                {settings?.absences_last_sync ? new Date(settings.absences_last_sync).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'Jamais'}
              </strong>
              <span>Dernière synchronisation</span>
            </div>
            <div className="counter-chip">
              <strong style={{ fontSize: 14 }}>{congesConfigured() ? 'Branchée' : 'À configurer'}</strong>
              <span>CONGES_DATABASE_URL</span>
            </div>
          </div>
          {settings?.absences_last_log && <p className="log-box">{settings.absences_last_log}</p>}
          <p className="hint" style={{ margin: '8px 0 0' }}>
            Synchronisation automatique : chaque nuit, et au plus toutes les 10 minutes quand quelqu’un ouvre le planning.
          </p>
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
            inscrits, sans ressaisie, utile pour relancer l’import quand un stagiaire est ajouté côté Digiforma.
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
