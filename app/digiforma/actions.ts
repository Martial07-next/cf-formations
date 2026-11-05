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
  const r = await placeModuleRow(supabase, m, templateId, programId || (m as any).program_id || null);
  if (r.ok) revalidatePath('/');
  return r;
}
