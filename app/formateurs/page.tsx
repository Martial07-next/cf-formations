import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTrainer, deleteTrainer } from './actions';

export default async function FormateursPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: trainers } = await supabase
    .from('trainers')
    .select('id, full_name, email, specialty')
    .order('full_name');

  return (
    <main>
      <Sidebar active="/formateurs" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
            <h1>Formateurs</h1>
          </div>
        </header>
        <CrudTable
          isAdmin={profile?.role === 'admin'}
          title="un formateur"
          columns={[
            { key: 'full_name', label: 'Nom' },
            { key: 'email', label: 'E-mail' },
            { key: 'specialty', label: 'Spécialité' },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'specialty', label: 'Spécialité' },
          ]}
          rows={trainers || []}
          onCreate={createTrainer}
          onDelete={deleteTrainer}
          emptyLabel="Aucun formateur enregistré."
        />
      </section>
    </main>
  );
}
