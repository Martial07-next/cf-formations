import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { AdminTabs } from '@/components/admin-tabs';
import { DocumentsAdmin } from '@/components/documents/documents-admin';
import { DOC_SELECT, type SignableDoc } from '@/lib/documents';

export const metadata = { title: 'Documents à signer · CF Réseaux' };

/** Administrateur : documents signés en ligne par les stagiaires et les salariés. */
export default async function DocumentsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const isAdmin = profile?.role === 'admin';
  const { data: docs, error } = isAdmin
    ? await supabase.from('signable_documents').select(DOC_SELECT).order('position')
    : { data: null, error: null };
  const counts: Record<string, number> = {};
  if (isAdmin && !error) {
    const { data: sigs } = await supabase.from('document_signatures').select('document_id, version');
    const byId = new Map(((docs as SignableDoc[]) || []).map((d) => [d.id, d]));
    for (const s of (sigs as any[]) || []) if (byId.get(s.document_id)?.version === s.version) counts[s.document_id] = (counts[s.document_id] || 0) + 1;
  }
  return (
    <main>
      <Sidebar active="/administration" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Bureau administratif</p>
            <h1>Administration</h1>
            <p>Documents à signer en ligne par les stagiaires (QR code en formation) et par les salariés (lien personnel).</p>
          </div>
        </header>
        <AdminTabs active="/administration/documents" />
        {!isAdmin ? (
          <p className="empty">Accès réservé aux administrateurs.</p>
        ) : error ? (
          <div role="alert" className="alert alert-warning">Exécute la migration 28 (supabase/migration_phase28.sql) dans Supabase pour gérer les documents à signer.</div>
        ) : (
          <DocumentsAdmin docs={(docs as SignableDoc[]) || []} counts={counts} />
        )}
      </section>
    </main>
  );
}
