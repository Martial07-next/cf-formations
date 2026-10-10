'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { loadSigningContext, validSignature } from '@/lib/emargement';

/** Signature d'un stagiaire depuis le QR code (demi-journée en cours uniquement). */
export async function signAttendance(token: string, traineeId: string, signature: string) {
  const ctx = await loadSigningContext(String(token));
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  if (!ctx.slot) return { ok: false as const, error: 'L’émargement n’est pas ouvert en ce moment.' };
  const trainee = ctx.trainees.find((t) => t.id === traineeId);
  if (!trainee) return { ok: false as const, error: 'Stagiaire introuvable pour cette demi-journée.' };
  if (trainee.signed) return { ok: false as const, error: 'Tu as déjà signé pour cette demi-journée.' };
  if (!validSignature(String(signature))) return { ok: false as const, error: 'Signature vide : signe dans le cadre puis valide.' };

  const { error } = await createAdminClient().from('attendance_signatures').insert({
    session_id: ctx.sessionId,
    signer: 'stagiaire',
    trainee_id: traineeId,
    day: ctx.slot.day,
    half: ctx.slot.half,
    status: 'signe',
    signature,
  });
  if (error) {
    if (error.code === '23505') return { ok: false as const, error: 'Tu as déjà signé pour cette demi-journée.' };
    return { ok: false as const, error: 'Signature non enregistrée, réessaie.' };
  }
  return { ok: true as const };
}
