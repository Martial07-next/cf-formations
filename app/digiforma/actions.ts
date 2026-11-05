'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { placeModuleRow } from '@/lib/digiforma-place';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Placer un module Digiforma sur le planning : la session est créée (dates du
 * module, vrais stagiaires à jour), rattachée à sa formation et à son parcours,
 * puis sa fiche s'ouvre pour choisir la salle et le formateur.
 */
export async function placeDigiformaModule(key: string, templateId: string | null = null, programId: string | null = null): Promise<Result<{ sessionId: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: m, error } = await supabase.from('digiforma_modules').select('*').eq('key', key).maybeSingle();
  if (error) return { ok: false, error: 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.' };
  if (!m) return { ok: false, error: 'Module introuvable : relance la synchronisation Digiforma.' };
  const prog = programId || (m as any).program_id || null;
  const r = await placeModuleRow(supabase, m, templateId, prog);
  // Parcours choisi : retenu pour tous les modules de cette session Digiforma (semaines suivantes, stages).
  if (r.ok && prog) await supabase.from('digiforma_modules').update({ program_id: prog }).eq('df_session_id', (m as any).df_session_id);
  if (r.ok) revalidatePath('/');
  return r;
}

/** Retirer un module de la liste « à placer » (introuvable, inutile) ou le remettre. */
export async function dismissDigiformaModule(key: string, on: boolean): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('digiforma_modules').update({ covered_by: on ? 'dismissed' : null }).eq('key', key);
  if (error) return { ok: false, error: 'Exécute d’abord la migration 58 (supabase/migration_phase58.sql) dans Supabase.' };
  revalidatePath('/');
  return { ok: true };
}

/** Supprimer une session créée depuis Digiforma qu'on ne retrouve pas (salle jamais choisie). */
export async function deleteDigiformaSession(sessionId: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  await supabase.from('digiforma_modules').update({ placed_session_id: null, covered_by: 'dismissed' }).eq('placed_session_id', sessionId);
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}
