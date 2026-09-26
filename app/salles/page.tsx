import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createRoom, deleteRoom, updateRoom, updateRoomStatus } from './actions';

export default async function SallesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, capacity, location, equipment, status')
    .order('name');

  return (
    <main>
      <Sidebar active="/salles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Salles</h1>
            <p>Capacité, équipements et disponibilité de chaque salle.</p>
          </div>
        </header>
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="une salle"
          columns={[
            { key: 'name', label: 'Nom' },
            { key: 'capacity', label: 'Capacité' },
            { key: 'location', label: 'Localisation' },
            { key: 'equipment', label: 'Équipements' },
          ]}
          fields={[
            { name: 'name', label: 'Nom', required: true },
            { name: 'capacity', label: 'Capacité', type: 'number', required: true },
            { name: 'location', label: 'Localisation' },
            { name: 'equipment', label: 'Équipements' },
            {
              name: 'status',
              label: 'Statut',
              type: 'select',
              options: [
                { value: 'disponible', label: 'Disponible' },
                { value: 'indisponible', label: 'Indisponible' },
              ],
            },
          ]}
          rows={rooms || []}
          onCreate={createRoom}
          onDelete={deleteRoom}
          onUpdate={updateRoom}
          emptyLabel="Aucune salle enregistrée."
          statusField={{
            key: 'status',
            label: 'Statut',
            options: [
              { value: 'disponible', label: 'Disponible' },
              { value: 'indisponible', label: 'Indisponible' },
            ],
            onChange: updateRoomStatus,
          }}
        />
      </section>
    </main>
  );
}
