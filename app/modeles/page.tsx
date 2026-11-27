import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { TemplateCatalog } from '@/components/template-catalog';

export default async function ModelesPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  // Réservé à l'équipe (administrateur, bureau) : un formateur n'a pas accès à cette page.
  if (!canManage(profile?.role)) redirect('/');
  // Tout en une fois, en parallèle. Options des formations : « * » (chaque option ajoutée par
  // une migration est lue si elle existe, sans erreur sinon).
  const [{ data: templates }, { data: trainers }, { data: folders }, { data: links }, { data: optRows }, { data: docs }] = await Promise.all([
    supabase
      .from('templates')
      .select('id, title, category, folder_id, position, duration_hours, max_trainees, description, sessions(count), template_modules(name, duration_hours, position), template_trainers(trainer_id)')
      .order('title'),
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
    supabase.from('template_folders').select('id, name, parent_id, position').order('position'),
    supabase.from('template_links').select('id, template_id, label, url, position').order('position'),
    supabase.from('templates').select('*'),
    supabase.from('dossier_documents').select('*').not('template_id', 'is', null).order('position'),
  ]);
  // Paramètres propres à une session (migration 62) : pas dans le catalogue.
  const sessionOnly = new Set(((optRows as any[]) || []).filter((x) => x.session_only === true).map((x) => x.id as string));
  const tdtOpts = optRows, faiOpts = optRows, objOpts = optRows, authOpts = optRows, recOpts = optRows, arOpts = optRows;
  const titreOpts = optRows, habOpts = optRows, habObj = optRows, recDur = optRows, depOpts = optRows, irveOpts = optRows;
  const maintOpts = optRows, periOpts = optRows, certOpts = optRows;

  const rows = ((templates as any[]) || []).filter((t: any) => !sessionOnly.has(t.id)).map((t: any) => ({
    ...t,
    sessions_count: Array.isArray(t.sessions) ? t.sessions[0]?.count ?? 0 : 0,
    modules: [...(t.template_modules || [])]
      .sort((a: any, b: any) => a.position - b.position)
      .map((m: any) => ({ name: m.name, duration_hours: Number(m.duration_hours) })),
    trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
    links: ((links as any[]) || []).filter((l) => l.template_id === t.id),
    documents: ((docs as any[]) || []).filter((d) => d.template_id === t.id),
    tour_de_table: ((tdtOpts as any[]) || []).find((x) => x.id === t.id)?.tour_de_table !== false,
    fiche_appreciation: Boolean(((faiOpts as any[]) || []).find((x) => x.id === t.id)?.fiche_appreciation),
    codification: ((faiOpts as any[]) || []).find((x) => x.id === t.id)?.codification ?? null,
    objectifs: ((objOpts as any[]) || []).find((x) => x.id === t.id)?.objectifs ?? null,
    competences: ((objOpts as any[]) || []).find((x) => x.id === t.id)?.competences ?? null,
    authorizations: ((authOpts as any[]) || []).find((x) => x.id === t.id)?.authorizations ?? null,
    attestation_reussite: ((arOpts as any[]) || []).find((x) => x.id === t.id)?.attestation_reussite ?? null,
    titre_habilitation: Boolean(((titreOpts as any[]) || []).find((x) => x.id === t.id)?.titre_habilitation),
    habilitation_symbols: ((habOpts as any[]) || []).find((x) => x.id === t.id)?.habilitation_symbols ?? null,
    objectifs_habilitation: ((habObj as any[]) || []).find((x) => x.id === t.id)?.objectifs_habilitation ?? null,
    recyclage_available: Boolean(((recOpts as any[]) || []).find((x) => x.id === t.id)?.recyclage_available),
    objectifs_recyclage: ((recOpts as any[]) || []).find((x) => x.id === t.id)?.objectifs_recyclage ?? null,
    competences_recyclage: ((recOpts as any[]) || []).find((x) => x.id === t.id)?.competences_recyclage ?? null,
    duration_hours_recyclage: ((recDur as any[]) || []).find((x) => x.id === t.id)?.duration_hours_recyclage ?? null,
    early_departure: ((depOpts as any[]) || []).find((x) => x.id === t.id)?.early_departure ?? null,
    grille_irve: ((irveOpts as any[]) || []).find((x) => x.id === t.id)?.grille_irve ?? null,
    grille_maintenance: ((maintOpts as any[]) || []).find((x) => x.id === t.id)?.grille_maintenance ?? null,
    perimetre_habilitation: ((periOpts as any[]) || []).find((x) => x.id === t.id)?.perimetre_habilitation ?? null,
    certificat_realisation: Boolean(((certOpts as any[]) || []).find((x) => x.id === t.id)?.certificat_realisation),
  }));
  // Dossiers fermés par ce collaborateur lors de sa dernière visite.
  const stateCookie = `cf_closed_folders_${(profile?.id || 'anon').slice(0, 8)}`;
  const initialClosed = decodeURIComponent((await cookies()).get(stateCookie)?.value || '')
    .split(',')
    .filter(Boolean);
  const activeTrainers = (trainers || []).filter((t: any) => t.status !== 'inactif');

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Ressources</p>
            <h1>Catalogue des formations</h1>
            <p>Range tes formations dans des dossiers et sous-dossiers, dans l’ordre que tu veux (flèches ↑ ↓). Elles se choisissent ensuite à la création d’une session.</p>
          </div>
        </header>
        <TemplateCatalog templates={rows} folders={(folders as any) || []} initialClosed={initialClosed} stateCookie={stateCookie} trainers={activeTrainers as any} canEdit={canManage(profile?.role)} />
      </section>
    </main>
  );
}
