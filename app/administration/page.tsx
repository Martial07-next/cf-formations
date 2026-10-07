import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminUsersTable } from '@/components/admin-users-table';
import { CreateAccessPanel } from '@/components/create-access-panel';
import { createAdminClient } from '@/lib/supabase/admin';
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
              <p className="eyebrow">Bureau administratif</p>
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

  // E-mails des comptes (lisibles uniquement avec la clé service_role, côté serveur).
  let serviceReady = true;
  const emails = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users || []) if (u.email) emails.set(u.id, u.email);
  } catch {
    serviceReady = false;
  }
  const rows = (profiles || []).map((p: any) => ({ ...p, email: emails.get(p.id) || null }));

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

        <AdminTabs active="/administration" />

        <div className="panel">
          <h2>Les rôles</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8 }}>
            <li><span className="badge admin">Administrateur</span> bureau administratif : tout gérer, comptes, paramètres, Digiforma.</li>
            <li><span className="badge referent">Référent cadre</span> modifie le planning et les ressources, suit son équipe de formateurs (page « Mon équipe »).</li>
            <li><span className="badge formateur">Formateur</span> consulte le planning et son propre historique (si son compte est lié à sa fiche formateur).</li>
            <li><span className="badge consultation">Consultation</span> lecture seule du planning.</li>
          </ul>
        </div>

        <CreateAccessPanel serviceReady={serviceReady} />

        <h2 className="sub-heading" style={{ marginTop: 4 }}>Accès existants</h2>
        <AdminUsersTable rows={rows} currentUserId={user?.id || ''} />

        <h2 className="sub-heading">Contenu de la plateforme</h2>
        <AdminResourceLinks />
      </section>
    </main>
  );
}
