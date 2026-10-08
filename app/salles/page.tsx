import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { BUILDINGS, compareRooms } from '@/lib/buildings';
import { RoomWorkshops } from '@/components/room-workshops';
import { createRoom, deleteRoom, updateRoom, updateRoomStatus } from './actions';

export default async function SallesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, capacity, location, equipment, status')
    .eq('is_holding', false) // la salle virtuelle « À affecter » n'est pas une vraie salle
    .order('name');
  const { data: workshops } = await supabase.from('room_workshops').select('id, room_id, name, equipment, modules').order('name');
  const rows = [...(rooms || [])].sort(compareRooms).map((r: any) => ({ ...r, location: r.location || '' }));

  return (
    <main>
      <Sidebar active="/salles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Salles</h1>
            <p>Deux adresses : BAT 1 (salles 1, 2, 3) et BAT 2 (salles 4, 5, 6).</p>
          </div>
        </header>
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="une salle"
          columns={[
            { key: 'name', label: 'Nom' },
            { key: 'capacity', label: 'Capacité' },
            { key: 'location', label: 'Bâtiment' },
            { key: 'equipment', label: 'Équipements' },
          ]}
          fields={[
            { name: 'name', label: 'Nom', required: true },
            { name: 'capacity', label: 'Capacité', type: 'number', required: true },
            {
              name: 'location',
              label: 'Bâtiment',
              type: 'select',
              options: [...BUILDINGS.map((b) => ({ value: b, label: b })), { value: '', label: 'Non renseigné' }],
            },
            { name: 'equipment', label: 'Équipements' },
            {
              name: 'status',
              label: 'Statut',
              type: 'select',
              createOnly: true,
              options: [
                { value: 'disponible', label: 'Disponible' },
                { value: 'indisponible', label: 'Indisponible' },
              ],
            },
          ]}
          rows={rows}
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
        <RoomWorkshops rooms={rows as any} workshops={(workshops as any) || []} canEdit={canManage(profile?.role)} />
      </section>
    </main>
  );
}
