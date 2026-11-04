'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { validSignature } from '@/lib/emargement';
import { loadDepartContext } from '@/lib/departs-server';
import { DEPART_REASONS } from '@/lib/departs';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const MIGRATION = 'Exécute d’abord la migration 56 (supabase/migration_phase56.sql) dans Supabase.';

/**
 * Le stagiaire envoie son attestation de départ anticipé (page du QR code,
 * sans compte). Date et heure : celles de l'envoi, fixées par le serveur.
 */
export async function recordDeparture(
  token: string,
  traineeId: string,
  input: { reason: string; details?: string; city: string; signature: string }
): Promise<Result<{ departedAt: string }>> {
  const ctx = await loadDepartContext(token);
  if (!ctx.ok) return ctx;
  if (!ctx.allowed) return { ok: false, error: 'Le départ anticipé n’est pas possible sur cette formation : adresse-toi au formateur.' };
  if (!ctx.trainees.some((t) => t.id === traineeId)) return { ok: false, error: 'Stagiaire introuvable sur cette session.' };
  const reason = DEPART_REASONS.find((r) => r === input.reason);
  if (!reason) return { ok: false, error: 'Choisis la raison du départ.' };
  const details = String(input.details || '').trim().slice(0, 500);
  if (reason === 'Autre' && !details) return { ok: false, error: 'Précise la raison du départ.' };
  const city = String(input.city || '').trim().slice(0, 120);
  if (!city) return { ok: false, error: 'Indique la ville (« Fait à »).' };
  if (!validSignature(input.signature)) return { ok: false, error: 'Signe dans le cadre avant d’envoyer.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('early_departures')
    .insert({ session_id: ctx.sessionId, trainee_id: traineeId, reason, details: details || null, formation_title: ctx.formationTitle, city, signature: input.signature })
    .select('departed_at')
    .single();
  if (error) return { ok: false, error: 'Enregistrement impossible, réessaie.' };
  revalidatePath(`/sessions/${ctx.sessionId}`);
  return { ok: true, departedAt: (data as any).departed_at };
}

/** Supprimer une attestation (erreur de stagiaire, envoi en double) : bureau / admin. */
export async function deleteDeparture(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase.from('early_departures').delete().eq('id', id).select('session_id').maybeSingle();
  if (error) return { ok: false, error: MIGRATION };
  if (data?.session_id) revalidatePath(`/sessions/${data.session_id}`);
  return { ok: true };
}
