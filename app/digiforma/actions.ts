'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { addNewTrainees } from '@/lib/digiforma-sync';
import { markHolidaysAccounted } from '@/lib/holiday-shifts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Placer un module Digiforma sur le planning : la session est créée (dates du
 * module, stagiaires à jour au dernier passage), puis sa fiche s'ouvre pour
 * choisir la salle et le formateur.
 */
export async function placeDigiformaModule(key: string): Promise<Result<{ sessionId: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: m, error } = await supabase.from('digiforma_modules').select('*').eq('key', key).maybeSingle();
  if (error) return { ok: false, error: 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.' };
  if (!m) return { ok: false, error: 'Module introuvable : relance la synchronisation Digiforma.' };
  if ((m as any).placed_session_id) return { ok: true, sessionId: (m as any).placed_session_id };
  const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holding) return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };

  const title = (m as any).whole_session || !(m as any).name ? (m as any).df_session_name : `${(m as any).name}`;
  const { data: created, error: insError } = await supabase
    .from('sessions')
    .insert({
      title: title || 'Session Digiforma',
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
  await addNewTrainees(supabase, created as any, ((m as any).trainees as any[]) || []);
  await supabase.from('digiforma_modules').update({ placed_session_id: created.id }).eq('key', key);
  revalidatePath('/');
  return { ok: true, sessionId: created.id };
}
