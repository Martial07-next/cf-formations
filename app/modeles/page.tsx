import { cookies } from 'next/headers';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TemplateCatalog } from '@/components/template-catalog';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const [{ data: templates }, { data: trainers }, { data: folders }] = await Promise.all([
    supabase
      .from('templates')
      .select('id, title, category, folder_id, position, duration_hours, max_trainees, description, sessions(count), template_modules(name, duration_hours, position), template_trainers(trainer_id)')
      .order('title'),
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
    supabase.from('template_folders').select('id, name, parent_id, position').order('position'),
  ]);

  // Liens des formations (supports de cours…). Erreur ignorée si la migration 15 manque.
  const { data: links } = await supabase.from('template_links').select('id, template_id, label, url, position').order('position');
  // Documents du dossier de chaque formation (migration 16).
  const { data: docs } = await supabase.from('dossier_documents').select('*').not('template_id', 'is', null).order('position');

  const rows = (templates || []).map((t: any) => ({
    ...t,
    sessions_count: Array.isArray(t.sessions) ? t.sessions[0]?.count ?? 0 : 0,
    modules: [...(t.template_modules || [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((m: any) => ({ name: m.name, duration_hours: Number(m.duration_hours) })),
    trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
    links: ((links as any[]) || []).filter((l) => l.template_id === t.id),
    documents: ((docs as any[]) || []).filter((d) => d.template_id === t.id),
  }));
  // Dossiers fermés par ce collaborateur lors de sa dernière visite.
  const stateCookie = `cf_closed_folders_${(profile?.id || 'anon').slice(0, 8)}`;
  const initialClosed = decodeURIComponent((await cookies()).get(stateCookie)?.value || '')
    .split(',')
    .filter(Boolean);
  const activeTrainers = (trainers || []).filter((t: any) => t.status !== 'inactif');

  return (
    <main>
      <Sidebar active="/modeles" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Formations disponibles</h1>
            <p>Range tes formations dans des dossiers et sous-dossiers, dans l’ordre que tu veux (flèches ↑ ↓). Elles se choisissent ensuite à la création d’une session.</p>
          </div>
        </header>
        <TemplateCatalog templates={rows} folders={(folders as any) || []} initialClosed={initialClosed} stateCookie={stateCookie} trainers={activeTrainers as any} canEdit={canManage(profile?.role)} />
      </section>
    </main>
  );
}
