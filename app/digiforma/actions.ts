'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { addNewTrainees } from '@/lib/digiforma-sync';
import { markHolidaysAccounted } from '@/lib/holiday-shifts';
import { People, isPlaceholder } from '@/lib/digiforma-people';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Placer un module Digiforma sur le planning : la session est créée (dates du
 * module, stagiaires à jour au dernier passage), puis sa fiche s'ouvre pour
 * choisir la salle et le formateur.
 */
export async function placeDigiformaModule(key: string, templateId: string | null = null, programId: string | null = null): Promise<Result<{ sessionId: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: m, error } = await supabase.from('digiforma_modules').select('*').eq('key', key).maybeSingle();
  if (error) return { ok: false, error: 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.' };
  if (!m) return { ok: false, error: 'Module introuvable : relance la synchronisation Digiforma.' };
  if ((m as any).placed_session_id) return { ok: true, sessionId: (m as any).placed_session_id };
  const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holding) return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };

  // Formation du catalogue choisie (reconnue d'après le nom du module) : son intitulé et ses réglages.
  let tpl: { id: string; title: string } | null = null;
  if (templateId) {
    const { data } = await supabase.from('templates').select('id, title').eq('id', templateId).maybeSingle();
    tpl = (data as any) || null;
  }
  const dfTitle = (m as any).whole_session || !(m as any).name ? (m as any).df_session_name : `${(m as any).name}`;
  const title = tpl?.title || dfTitle;
  const { data: created, error: insError } = await supabase
    .from('sessions')
    .insert({
      title: title || 'Session Digiforma',
      ...(tpl ? { template_id: tpl.id } : {}),
      // Parcours de ces stagiaires (GEIQ, POEC, personnalisé) : la session y est rattachée.
      ...(programId ? { poec_id: programId } : {}),
      room_id: holding.id,
      start_at: (m as any).start_at,
      end_at: (m as any).end_at,
      status: 'planifiee',
      digiforma_ref: key,
      notes: `Module Digiforma « ${(m as any).name || (m as any).df_session_name} » (session ${(m as any).df_session_name}) : salle et formateur à choisir.`,
    })
    .select('id, start_at, end_at')
    .single();
  if (insError || !created) return { ok: false, error: 'Création impossible, réessaie.' };
  await markHolidaysAccounted(supabase, created.id).catch(() => null);
  // Stagiaires réels seulement : ni fictifs (« Apprenant A »), ni ceux de la corbeille (page Stagiaires) ; jamais de doublon.
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  const trashed = new People();
  for (const t of (trashedRows as any[]) || []) trashed.add(t);
  const real = (((m as any).trainees as any[]) || []).filter((t) => !isPlaceholder(t) && !trashed.has(t));
  await addNewTrainees(supabase, created as any, real);
  await supabase.from('digiforma_modules').update({ placed_session_id: created.id }).eq('key', key);
  revalidatePath('/');
  return { ok: true, sessionId: created.id };
}
