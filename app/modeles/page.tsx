import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTemplate, deleteTemplate } from './actions';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: templates } = await supabase
    .from('templates')
    .select('id, title, duration_hours, description')
    .order('title');

  return (
    <main>
      <Sidebar active="/modeles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANISATION DES FORMATIONS</p>
            <h1>Modèles de formation</h1>
          </div>
        </header>
        <CrudTable
          isAdmin={profile?.role === 'admin'}
          title="un modèle"
          columns={[
            { key: 'title', label: 'Titre' },
            { key: 'duration_hours', label: 'Durée (h)' },
            { key: 'description', label: 'Description' },
          ]}
          fields={[
            { name: 'title', label: 'Titre', required: true },
            { name: 'duration_hours', label: 'Durée (h)', type: 'number', step: '0.5', required: true },
            { name: 'description', label: 'Description' },
          ]}
          rows={templates || []}
          onCreate={createTemplate}
          onDelete={deleteTemplate}
          emptyLabel="Aucun modèle enregistré."
        />
      </section>
    </main>
  );
}
