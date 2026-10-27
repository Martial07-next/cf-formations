import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionSlots, dossierProgress } from '@/lib/dossier';
import { appreciationRequired } from '@/lib/appreciation';
import { reussiteModels } from '@/lib/reussite';
import { EMARGEMENT_ENABLED } from '@/lib/features';

/**
 * Avancement des dossiers d'un ensemble de sessions (planning, tableau de
 * bord) : dossier complet, partie formateur faite, et nombre de documents
 * qui restent à remplir par le formateur / par le bureau.
 * Les sessions doivent avoir id, start_at, end_at, template_id et
 * session_trainees(trainee_id, status).
 */
export type DossierTodo = {
  dossierComplete: Record<string, boolean>;
  trainerDone: Record<string, boolean>;
  todo: Record<string, { trainer: number; office: number }>;
};

export async function computeDossierTodo(
  supabase: SupabaseClient,
  sessions: any[],
  extra: { dayRows: any[] | null; moduleRows: any[] | null; linkRows: any[] | null }
): Promise<DossierTodo> {
  const { dayRows, moduleRows, linkRows } = extra;
  const sessionIds = sessions.map((s) => s.id as string);
  // Dossiers complets (émargement + documents obligatoires), si la migration 16 est faite.
  const dossierComplete: Record<string, boolean> = {};
  // Partie du formateur faite : tour de table, appréciation et documents « formateur ».
  const trainerDone: Record<string, boolean> = {};
  // Documents qui restent à remplir : par le formateur / par le bureau.
  const todo: Record<string, { trainer: number; office: number }> = {};
  if (!sessionIds.length) return { dossierComplete, trainerDone, todo };
  const sigs: any[] = [];
  // Émargement géré dans Digiforma (désactivé ici) : inutile de charger les signatures.
  for (let from = 0; EMARGEMENT_ENABLED && from < 50000; from += 1000) {
    const { data, error } = await supabase
      .from('attendance_signatures')
      .select('session_id, signer, trainee_id, day, half')
      .in('session_id', sessionIds)
      .range(from, from + 999);
    if (error || !data) break;
    sigs.push(...data);
    if (data.length < 1000) break;
  }
  const templateIds = [...new Set((sessions).map((x) => x.template_id).filter(Boolean))];
  const [{ data: docs }, { data: entries }, { data: forms, error: formsError }, { data: tplOpts }] = await Promise.all([
    supabase
      .from('dossier_documents')
      .select('id, template_id, session_id, required, filled_by')
      .or([`session_id.in.(${sessionIds.join(',')})`, templateIds.length ? `template_id.in.(${templateIds.join(',')})` : ''].filter(Boolean).join(',')),
    supabase.from('dossier_entries').select('session_id, document_id, completed').in('session_id', sessionIds),
    supabase.from('session_forms').select('session_id, completed').eq('kind', 'tour_de_table').in('session_id', sessionIds),
    templateIds.length ? supabase.from('templates').select('id, tour_de_table').in('id', templateIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const tdtOff = new Set(((tplOpts as any[]) || []).filter((t) => t.tour_de_table === false).map((t) => t.id));
  // Fiches d'appréciation (migration 21) : ignorées si la migration manque.
  const [{ data: faiForms, error: faiErr }, { data: faiSess }, { data: faiTpl }, { data: dfSess, error: dfErr }, { data: dfForms }] = await Promise.all([
    supabase.from('session_forms').select('session_id, completed').eq('kind', 'appreciation').in('session_id', sessionIds),
    supabase.from('sessions').select('id, fiche_appreciation').in('id', sessionIds),
    templateIds.length ? supabase.from('templates').select('id, fiche_appreciation').in('id', templateIds) : Promise.resolve({ data: [] as any[] }),
    // Autres documents sur Digiforma (migration 36) : lien renseigné → case « fait » du formateur.
    supabase.from('sessions').select('id').in('id', sessionIds).not('digiforma_docs_url', 'is', null),
    supabase.from('session_forms').select('session_id, completed').eq('kind', 'digiforma').in('session_id', sessionIds),
  ]);
  const dfOn = new Set(dfErr ? [] : ((dfSess as any[]) || []).map((r) => r.id as string));
  // Attestations de réussite (migration 39) : formations avec un modèle choisi.
  const [{ data: arTpl, error: arErr }, { data: arForms }] = await Promise.all([
    templateIds.length ? supabase.from('templates').select('id, attestation_reussite').in('id', templateIds) : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from('session_forms').select('session_id, completed').eq('kind', 'reussite').in('session_id', sessionIds),
  ]);
  const arOn = new Set(arErr ? [] : ((arTpl as any[]) || []).filter((t) => reussiteModels(t.attestation_reussite).length).map((t) => t.id as string));
  for (const s of sessions) {
    const traineeIds = (s.session_trainees || []).filter((t: any) => t.status === 'validee').map((t: any) => t.trainee_id);
    if (!traineeIds.length) continue;
    const traineeModules: Record<string, string[]> = {};
    for (const l of (linkRows || []).filter((x: any) => x.session_id === s.id)) (traineeModules[l.trainee_id] ||= []).push(l.module_id);
    const input = {
      slots: sessionSlots(s.start_at, s.end_at, (dayRows || []).filter((d: any) => d.session_id === s.id) as any),
      traineeIds,
      modules: (moduleRows || []).filter((m: any) => m.session_id === s.id),
      traineeModules,
      signatures: sigs.filter((x) => x.session_id === s.id),
      documents: ((docs as any[]) || []).filter((d) => d.session_id === s.id || (s.template_id && d.template_id === s.template_id)),
      entries: ((entries as any[]) || []).filter((e) => e.session_id === s.id),
      // Tour de table obligatoire (sauf formation qui le désactive, ou migration 17 absente).
      forms: [
        ...(formsError || (s.template_id && tdtOff.has(s.template_id))
          ? []
          : [{ completed: ((forms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }]),
        ...(!faiErr &&
        appreciationRequired(
          ((faiSess as any[]) || []).find((x) => x.id === s.id)?.fiche_appreciation ?? null,
          ((faiTpl as any[]) || []).find((x) => x.id === s.template_id)?.fiche_appreciation
        )
          ? [{ completed: ((faiForms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }]
          : []),
        ...(s.template_id && arOn.has(s.template_id) ? [{ completed: ((arForms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }] : []),
        ...(dfOn.has(s.id) ? [{ completed: ((dfForms as any[]) || []).some((f) => f.session_id === s.id && f.completed) }] : []),
      ],
    };
    if (dossierProgress(input).complete) dossierComplete[s.id] = true;
    const mine = { ...input, documents: input.documents.filter((d: any) => d.filled_by === 'formateur') };
    if (dossierProgress(mine).complete) trainerDone[s.id] = true;
    const missing = (who: string) =>
      input.documents.filter((d: any) => d.required && d.filled_by === who && !input.entries.some((e: any) => e.document_id === d.id && e.completed)).length;
    todo[s.id] = { trainer: missing('formateur') + input.forms.filter((f) => !f.completed).length, office: missing('bureau') };
  }

  return { dossierComplete, trainerDone, todo };
}
