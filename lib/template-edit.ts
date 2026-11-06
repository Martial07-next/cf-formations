/**
 * Formation à modifier (catalogue ou paramètres propres à une session) :
 * mêmes données que la page Formations (modules, formateurs, supports,
 * documents du dossier et toutes les options).
 */
export async function loadTemplateForEdit(supabase: any, id: string): Promise<any | null> {
  const { data: t } = await supabase.from('templates').select('*, template_modules(name, duration_hours, position), template_trainers(trainer_id)').eq('id', id).maybeSingle();
  if (!t) return null;
  const [{ data: links }, { data: docs }] = await Promise.all([
    supabase.from('template_links').select('id, template_id, label, url, position').eq('template_id', id).order('position'),
    supabase.from('dossier_documents').select('*').eq('template_id', id).order('position'),
  ]);
  return {
    ...t,
    sessions_count: 0,
    modules: [...(t.template_modules || [])].sort((a: any, b: any) => a.position - b.position).map((m: any) => ({ name: m.name, duration_hours: Number(m.duration_hours) })),
    trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
    links: (links as any[]) || [],
    documents: (docs as any[]) || [],
    tour_de_table: t.tour_de_table !== false,
    fiche_appreciation: Boolean(t.fiche_appreciation),
    codification: t.codification ?? null,
    objectifs: t.objectifs ?? null,
    competences: t.competences ?? null,
    authorizations: t.authorizations ?? null,
    attestation_reussite: t.attestation_reussite ?? null,
    titre_habilitation: Boolean(t.titre_habilitation),
    habilitation_symbols: t.habilitation_symbols ?? null,
    objectifs_habilitation: t.objectifs_habilitation ?? null,
    recyclage_available: Boolean(t.recyclage_available),
    objectifs_recyclage: t.objectifs_recyclage ?? null,
    competences_recyclage: t.competences_recyclage ?? null,
    duration_hours_recyclage: t.duration_hours_recyclage ?? null,
    early_departure: t.early_departure ?? null,
    grille_irve: t.grille_irve ?? null,
  };
}

/** Retire les formations propres à une session (migration 62) d'une liste du catalogue. */
export async function withoutSessionOnly<T extends { id: string }>(supabase: any, rows: T[]): Promise<T[]> {
  const { data, error } = await supabase.from('templates').select('id').eq('session_only', true);
  if (error || !data?.length) return rows;
  const hidden = new Set((data as any[]).map((x) => x.id));
  return rows.filter((r) => !hidden.has(r.id));
}
