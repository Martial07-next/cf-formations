import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';
import { DigiformaTestButton } from '@/components/digiforma-test-button';

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

        <div className="panel" style={{ maxWidth: 680 }}>
          <h2>Digiforma — connexion API</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Une clé API Digiforma (générée depuis Digiforma → réglages → Interconnexion → GraphQL) doit être ajoutée
            dans les variables d'environnement du serveur sous le nom <code>DIGIFORMA_API_TOKEN</code> — jamais
            <code> NEXT_PUBLIC_</code>, jamais visible dans cette interface. Une fois fait, teste la connexion :
          </p>
          <DigiformaTestButton />
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6 }}>
            Ce test exécute une requête d'introspection réelle (sans effet) sur l'API Digiforma. S'il échoue avec un
            message du type « Cannot query field... », c'est que les noms de champs utilisés dans le code
            (actuellement une estimation basée sur leur documentation publique) doivent être ajustés au schéma réel
            de ton compte — dis-le-moi avec le message d'erreur exact et je corrige la requête.
          </p>
        </div>

        <div className="panel" style={{ maxWidth: 680 }}>
          <h2>Import direct par session</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Une fois la connexion active, chaque fiche session propose un champ « référence Digiforma » et un bouton
            « Importer les stagiaires depuis Digiforma » : les stagiaires inscrits côté Digiforma sont alors
            automatiquement créés/reconnus et ajoutés à la session, sans ressaisie.
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)' }}>
            Digiforma ne propose pas de webhooks : rien ne se synchronise tout seul en arrière-plan. Il faut relancer
            l'import depuis la fiche session à chaque fois qu'un stagiaire est ajouté côté Digiforma.
          </p>
        </div>

        <div className="panel" style={{ maxWidth: 680 }}>
          <h2>Export / import CSV</h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
            En complément (ou en attendant la connexion API), les sessions et stagiaires peuvent être exportés en
            CSV, et des stagiaires peuvent être importés en masse directement depuis une fiche session.
          </p>
          <div className="row-actions">
            <a href="/sessions/export"><button type="button">Exporter les sessions (CSV)</button></a>
            <a href="/stagiaires/export"><button type="button">Exporter les stagiaires (CSV)</button></a>
          </div>
        </div>
      </section>
    </main>
  );
}
