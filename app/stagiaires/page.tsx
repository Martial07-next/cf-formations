import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTrainee, deleteTrainee } from './actions';

export default async function StagiairesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: trainees } = await supabase
    .from('trainees')
    .select('id, full_name, email, company')
    .order('full_name');

  return (
    <main>
      <Sidebar active="/stagiaires" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
            <h1>Stagiaires</h1>
          </div>
        </header>
        <CrudTable
          isAdmin={profile?.role === 'admin'}
          title="un stagiaire"
          columns={[
            { key: 'full_name', label: 'Nom' },
            { key: 'email', label: 'E-mail' },
            { key: 'company', label: 'Entreprise' },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'company', label: 'Entreprise' },
          ]}
          rows={trainees || []}
          onCreate={createTrainee}
          onDelete={deleteTrainee}
          emptyLabel="Aucun stagiaire enregistré."
        />
      </section>
    </main>
  );
}
