import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTrainer, deleteTrainer, updateTrainerStatus } from './actions';

export default async function FormateursPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: trainers } = await supabase
    .from('trainers')
    .select('id, full_name, email, phone, specialty, availability, status')
    .order('full_name');

  return (
    <main>
      <Sidebar active="/formateurs" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Formateurs</h1>
            <p>Les intervenants disponibles pour animer les sessions.</p>
          </div>
        </header>
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="un formateur"
          columns={[
            { key: 'full_name', label: 'Nom' },
            { key: 'email', label: 'E-mail' },
            { key: 'phone', label: 'Téléphone' },
            { key: 'specialty', label: 'Spécialité' },
            { key: 'availability', label: 'Disponibilité' },
          ]}
          fields={[
            { name: 'full_name', label: 'Nom complet', required: true },
            { name: 'email', label: 'E-mail', type: 'email' },
            { name: 'phone', label: 'Téléphone' },
            { name: 'specialty', label: 'Spécialité' },
            { name: 'availability', label: 'Disponibilité', type: 'text' },
            {
              name: 'status',
              label: 'Statut',
              type: 'select',
              options: [
                { value: 'actif', label: 'Actif' },
                { value: 'inactif', label: 'Inactif' },
              ],
            },
          ]}
          rows={trainers || []}
          onCreate={createTrainer}
          onDelete={deleteTrainer}
          emptyLabel="Aucun formateur enregistré."
          statusField={{
            key: 'status',
            label: 'Statut',
            options: [
              { value: 'actif', label: 'Actif' },
              { value: 'inactif', label: 'Inactif' },
            ],
            onChange: updateTrainerStatus,
          }}
        />
      </section>
    </main>
  );
}
