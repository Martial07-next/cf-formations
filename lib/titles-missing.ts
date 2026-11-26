import { titleOk } from '@/lib/titres';

/**
 * Titres d'habilitation manquants par session (planning) : formation qui exige
 * le titre (recyclage d'habilitation), stagiaires validés hors « initial » qui
 * n'ont ni case « fourni » au tour de table ni fichier déposé.
 * Tolérant : une migration absente → aucune alerte.
 */
export async function loadMissingTitles(supabase: any, sessions: { id: string; template_id?: string | null; status?: string | null }[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const list = sessions.filter((s) => s.template_id && s.status !== 'brouillon');
  const tplIds = [...new Set(list.map((s) => s.template_id as string))];
  if (!tplIds.length) return out;
  const { data: tpls, error } = await supabase.from('templates').select('*').in('id', tplIds);
  if (error) return out;
  const needs = new Set(((tpls as any[]) || []).filter((t) => t.titre_habilitation === true).map((t) => t.id as string));
  const ids = list.filter((s) => needs.has(s.template_id as string)).map((s) => s.id);
  if (!ids.length) return out;
  const [{ data: links }, { data: forms }, { data: files }] = await Promise.all([
    supabase.from('session_trainees').select('*').in('session_id', ids).eq('status', 'validee'),
    supabase.from('session_forms').select('session_id, data').eq('kind', 'tour_de_table').in('session_id', ids),
    supabase.from('habilitation_titles').select('session_id, trainee_id').in('session_id', ids),
  ]);
  for (const id of ids) {
    const tdtRow = ((forms as any[]) || []).find((f) => f.session_id === id);
    const tdt = { data: (tdtRow?.data as any) || {} };
    const sessionFiles = ((files as any[]) || []).filter((f) => f.session_id === id);
    // Stagiaire en initiale : pas de titre précédent à fournir.
    const missing = ((links as any[]) || []).filter((l) => l.session_id === id && l.cursus !== 'initial' && !titleOk(l.trainee_id, tdt, sessionFiles)).length;
    if (missing) out[id] = missing;
  }
  return out;
}
