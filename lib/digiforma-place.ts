import type { SupabaseClient } from '@supabase/supabase-js';
import { addNewTrainees } from '@/lib/digiforma-sync';
import { markHolidaysAccounted } from '@/lib/holiday-shifts';
import { People, isPlaceholder } from '@/lib/digiforma-people';

/**
 * Crée sur le planning la session d'un module Digiforma (salle « À affecter »),
 * rattachée à sa formation du catalogue et à son parcours, avec ses vrais
 * stagiaires (ni fictifs, ni corbeille, jamais en double).
 */
export async function placeModuleRow(
  supabase: SupabaseClient,
  m: any,
  templateId: string | null,
  programId: string | null
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  if (m.placed_session_id) return { ok: true, sessionId: m.placed_session_id };
  const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holding) return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };
  let tpl: { id: string; title: string } | null = null;
  if (templateId) {
    const { data } = await supabase.from('templates').select('id, title').eq('id', templateId).maybeSingle();
    tpl = (data as any) || null;
  }
  const dfTitle = m.whole_session || !m.name ? m.df_session_name : m.name;
  const { data: created, error } = await supabase
    .from('sessions')
    .insert({
      title: tpl?.title || dfTitle || 'Session Digiforma',
      ...(tpl ? { template_id: tpl.id } : {}),
      ...(programId ? { poec_id: programId } : {}),
      room_id: holding.id,
      start_at: m.start_at,
      end_at: m.end_at,
      status: 'planifiee',
      digiforma_ref: m.key,
      notes: `Module Digiforma « ${m.name || m.df_session_name} » (session ${m.df_session_name}) : salle et formateur à choisir.`,
    })
    .select('id, start_at, end_at')
    .single();
  if (error || !created) return { ok: false, error: 'Création impossible, réessaie.' };
  await markHolidaysAccounted(supabase, created.id).catch(() => null);
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  const trashed = new People();
  for (const t of (trashedRows as any[]) || []) trashed.add(t);
  const real = ((m.trainees as any[]) || []).filter((t) => !isPlaceholder(t) && !trashed.has(t));
  await addNewTrainees(supabase, created as any, real);
  await supabase.from('digiforma_modules').update({ placed_session_id: created.id }).eq('key', m.key);
  return { ok: true, sessionId: created.id };
}
