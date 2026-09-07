import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createRoom, deleteRoom } from './actions';

export default async function SallesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: rooms } = await supabase.from('rooms').select('id, name, capacity').order('name');

  return (
    <main>
      <Sidebar active="/salles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
            <h1>Salles</h1>
          </div>
        </header>
        <CrudTable
          isAdmin={profile?.role === 'admin'}
          title="une salle"
          columns={[{ key: 'name', label: 'Nom' }, { key: 'capacity', label: 'Capacité' }]}
          fields={[
            { name: 'name', label: 'Nom', required: true },
            { name: 'capacity', label: 'Capacité', type: 'number', required: true },
          ]}
          rows={rooms || []}
          onCreate={createRoom}
          onDelete={deleteRoom}
          emptyLabel="Aucune salle enregistrée."
        />
      </section>
    </main>
  );
}
