import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { CrudTable } from '@/components/crud-table';
import { createTemplate, deleteTemplate } from './actions';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: templates } = await supabase
    .from('templates')
    .select('id, title, reference, category, duration_hours, max_trainees, description')
    .order('title');

  return (
    <main>
      <Sidebar active="/modeles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation des formations</p>
            <h1>Formations (modèles)</h1>
            <p>Le catalogue des formations, réutilisables lors de la création d'une session.</p>
          </div>
        </header>
        <CrudTable
          isAdmin={canManage(profile?.role)}
          title="une formation"
          columns={[
            { key: 'title', label: 'Titre' },
            { key: 'reference', label: 'Référence' },
            { key: 'category', label: 'Catégorie' },
            { key: 'duration_hours', label: 'Durée (h)' },
            { key: 'max_trainees', label: 'Max. stagiaires' },
            { key: 'description', label: 'Description' },
          ]}
          fields={[
            { name: 'title', label: 'Titre', required: true },
            { name: 'reference', label: 'Référence' },
            { name: 'category', label: 'Catégorie' },
            { name: 'duration_hours', label: 'Durée (h)', type: 'number', step: '0.5', required: true },
            { name: 'max_trainees', label: 'Max. stagiaires', type: 'number' },
            { name: 'description', label: 'Description' },
          ]}
          rows={templates || []}
          onCreate={createTemplate}
          onDelete={deleteTemplate}
          emptyLabel="Aucune formation enregistrée."
        />
      </section>
    </main>
  );
}
