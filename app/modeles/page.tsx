import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TemplateCatalog } from '@/components/template-catalog';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const { data: templates } = await supabase
    .from('templates')
    .select('id, title, category, duration_hours, max_trainees, description, sessions(count)')
    .order('title');

  const rows = (templates || []).map((t: any) => ({
    ...t,
    sessions_count: Array.isArray(t.sessions) ? t.sessions[0]?.count ?? 0 : 0,
  }));

  return (
    <main>
      <Sidebar active="/modeles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Formations disponibles</h1>
            <p>Le catalogue classé par dossier : nom, nombre d’heures, places. Choisis-les directement à l’enregistrement d’une session.</p>
          </div>
        </header>
        <TemplateCatalog templates={rows} canEdit={canManage(profile?.role)} />
      </section>
    </main>
  );
}
