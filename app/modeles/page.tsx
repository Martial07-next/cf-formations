import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TemplateCatalog } from '@/components/template-catalog';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const [{ data: templates }, { data: trainers }] = await Promise.all([
    supabase
      .from('templates')
      .select('id, title, category, duration_hours, max_trainees, description, sessions(count), template_modules(name, duration_hours, position), template_trainers(trainer_id)')
      .order('title'),
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
  ]);

  const rows = (templates || []).map((t: any) => ({
    ...t,
    sessions_count: Array.isArray(t.sessions) ? t.sessions[0]?.count ?? 0 : 0,
    modules: [...(t.template_modules || [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((m: any) => ({ name: m.name, duration_hours: Number(m.duration_hours) })),
    trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
  }));
  const activeTrainers = (trainers || []).filter((t: any) => t.status !== 'inactif');

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
        <TemplateCatalog templates={rows} trainers={activeTrainers as any} canEdit={canManage(profile?.role)} />
      </section>
    </main>
  );
}
