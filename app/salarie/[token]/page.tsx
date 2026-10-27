import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { EMPLOYEE_DOC_SELECT, validEmployeeToken, type EmployeeDoc } from '@/lib/salaries';
import { EmployeeSign, type ExtraDoc } from '@/components/salaries/employee-sign';
import { customDocs, signatureFor } from '@/lib/documents';
import { loadDocs, loadDocSignatures } from '@/lib/documents-server';
import { docStoragePath } from '@/lib/documents';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mes documents · CF Réseaux', robots: { index: false, follow: false } };

/** Lien personnel d'un salarié (sans compte) : droit à l'image et remise de matériel. */
export default async function SalariePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let error: string | null = null;
  let emp: any = null;
  let docs: EmployeeDoc[] = [];
  let cachet: string | null = null;
  let extras: ExtraDoc[] = [];
  if (!validEmployeeToken(token)) error = 'Lien invalide.';
  else {
    try {
      const admin = createAdminClient();
      const { data } = await admin.from('employees').select('id, full_name, address').eq('token', token).eq('active', true).maybeSingle();
      if (!data) error = 'Ce lien n’est plus valide. Demande un nouveau lien au bureau administratif.';
      else {
        emp = data;
        const [{ data: rows }, { data: settings }] = await Promise.all([
          admin.from('employee_documents').select(EMPLOYEE_DOC_SELECT).eq('employee_id', data.id).order('created_at'),
          admin.from('app_settings').select('cachet_image').limit(1).maybeSingle(),
        ]);
        docs = (rows as EmployeeDoc[]) || [];
        cachet = (settings as any)?.cachet_image || null;
        // Documents ajoutés par l'administrateur (règlement intérieur…), migration 28.
        const [all, sigs] = await Promise.all([loadDocs(admin as any), loadDocSignatures(admin as any, 'employee_id', [data.id])]);
        extras = await Promise.all(
          customDocs(all, 'salarie').map(async (d) => {
            const sig = signatureFor(d, sigs);
            const { data: u } = await admin.storage.from('dossiers').createSignedUrl(docStoragePath(d.id, sig ? sig.version : d.version), 3600);
            return { id: d.id, title: d.title, description: d.description, url: u?.signedUrl || null, sig };
          })
        );
      }
    } catch {
      error = 'Service momentanément indisponible.';
    }
  }
  return (
    <main className="sign-page">
      <div className="sign-card">
        <BackLink />
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Documents salarié</p>
        {error ? (
          <div role="alert" className="alert alert-error">{error}</div>
        ) : (
          <>
            <h1>Bonjour {emp.full_name}</h1>
            <p className="hint">Relis, complète ton adresse et signe une seule fois pour tous tes documents.</p>
            <EmployeeSign link={token} name={emp.full_name} address={emp.address} docs={docs} cachet={cachet} extras={extras} />
          </>
        )}
      </div>
    </main>
  );
}
