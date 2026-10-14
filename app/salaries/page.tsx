import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { EmployeesManager } from '@/components/salaries/employees-manager';
import { EMPLOYEE_DOC_SELECT, EMPLOYEE_SELECT, type Employee, type EmployeeDoc } from '@/lib/salaries';

export const metadata = { title: 'Salariés · CF Réseaux' };

/** Documents des salariés : droit à l'image et remise de matériel, signés en ligne. */
export default async function SalariesPage() {
  const profile = await getCurrentProfile();
  if (!canManage(profile?.role)) redirect('/');
  const supabase = await createClient();
  const [{ data: employees, error }, { data: docs }, { data: accounts }, { data: settings }] = await Promise.all([
    supabase.from('employees').select(EMPLOYEE_SELECT).order('active', { ascending: false }).order('full_name'),
    supabase.from('employee_documents').select(EMPLOYEE_DOC_SELECT),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('app_settings').select('cachet_image').eq('id', true).maybeSingle(),
  ]);
  return (
    <main>
      <Sidebar active="/salaries" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Salariés</h1>
            <p>Droit à l’image et attestation de remise de matériel : chaque salarié signe en ligne avec son lien personnel.</p>
          </div>
        </header>
        {error ? (
          <div role="alert" className="alert alert-warning">Exécute la migration 25 (supabase/migration_phase25.sql) dans Supabase pour activer les documents salariés.</div>
        ) : (
          <EmployeesManager
            rows={((employees as Employee[]) || []).map((e) => ({ ...e, docs: ((docs as EmployeeDoc[]) || []).filter((d) => d.employee_id === e.id) }))}
            accounts={((accounts as any[]) || []).filter((a) => a.full_name)}
            cachet={((settings as any)?.cachet_image as string) || null}
          />
        )}
      </section>
    </main>
  );
}
