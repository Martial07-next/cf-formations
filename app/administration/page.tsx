import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { AdminUsersTable } from '@/components/admin-users-table';
import { CreateAccessPanel } from '@/components/create-access-panel';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminTabs, AdminResourceLinks } from '@/components/admin-tabs';
import { RightsTable } from '@/components/rights-table';
import { AccessRequests, type AccessRequest } from '@/components/access-requests';

export default async function AdministrationPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  if (profile?.role !== 'admin') {
    return (
      <main>
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
  // Demandes depuis la page de connexion (migration 38).
  const [{ data: pendingRows, error: reqError }, { data: recentRows }] = await Promise.all([
    supabase.from('access_requests').select('*').eq('status', 'en_attente').order('created_at', { ascending: false }),
    supabase.from('access_requests').select('*').neq('status', 'en_attente').order('decided_at', { ascending: false }).limit(20),
  ]);
  const pendingReqs = (pendingRows as AccessRequest[]) || [];
  const recentReqs = (recentRows as AccessRequest[]) || [];
  // Accès Facturation (migration 30) : null si la colonne n'existe pas encore.
  const { data: billingRows, error: billingError } = await supabase.from('profiles').select('id, can_invoice');
  const rows = (profiles || []).map((p: any) => ({
    ...p,
    email: emails.get(p.id) || null,
    can_invoice: billingError ? null : Boolean(((billingRows as any[]) || []).find((b) => b.id === p.id)?.can_invoice),
  }));

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

        <AdminTabs active="/administration" />

        {!reqError && <AccessRequests pending={pendingReqs} recent={recentReqs} />}

        <CreateAccessPanel serviceReady={serviceReady} />

        <h2 className="sub-heading" style={{ marginTop: 4 }}>Accès existants</h2>
        <AdminUsersTable rows={rows} currentUserId={user?.id || ''} />

        <RightsTable />

        <h2 className="sub-heading">Contenu de la plateforme</h2>
        <AdminResourceLinks />
      </section>
    </main>
  );
}
