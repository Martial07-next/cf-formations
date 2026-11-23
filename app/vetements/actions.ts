'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { staffOf } from '@/lib/session-staff';
import { validSignature } from '@/lib/emargement';
import { clampQty, LOAN_SELECT, type ClothingLoan } from '@/lib/vetements';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 27 (supabase/migration_phase27.sql) dans Supabase.';

function refresh(l: { trainee_id: string; session_id: string | null }) {
  revalidatePath(`/stagiaires/${l.trainee_id}`);
  if (l.session_id) revalidatePath(`/sessions/${l.session_id}`);
}

/** Droit d'agir sur un prêt : équipe de la session du prêt, sinon bureau / admin. */
async function canHandle(loan: { session_id: string | null }) {
  if (loan.session_id && (await staffOf(loan.session_id))) return true;
  return Boolean(await requireManager());
}

async function loanById(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('clothing_loans').select(LOAN_SELECT).eq('id', id).maybeSingle();
  return { admin, loan: data as ClothingLoan | null };
}

type SignInput = { address: string; city: string; signature: string };

function checkSign(s: SignInput) {
  if (!String(s.address || '').trim()) return 'Indique l’adresse du stagiaire.';
  if (!String(s.city || '').trim()) return 'Indique la ville (« Fait à »).';
  if (!validSignature(s.signature)) return 'Le stagiaire doit signer dans le cadre.';
  return null;
}

type Qty = { vestes: number; pantalons: number; baudriers?: number };

/** Enregistre un prêt (vêtements TST, baudriers), signé tout de suite ou à faire signer plus tard. */
async function createLoan(traineeId: string, sessionId: string | null, qty: Qty, sign: SignInput | null): Promise<Result<{ id: string }>> {
  const vestes = clampQty(qty.vestes);
  const pantalons = clampQty(qty.pantalons);
  const baudriers = clampQty(qty.baudriers);
  if (vestes + pantalons + baudriers === 0) return { ok: false, error: 'Indique au moins une veste, un pantalon ou un baudrier.' };
  if (sign) {
    const err = checkSign(sign);
    if (err) return { ok: false, error: err };
  }
  const admin = createAdminClient();
  if (sessionId) {
    const { data: enrolled } = await admin.from('session_trainees').select('trainee_id').eq('session_id', sessionId).eq('trainee_id', traineeId).maybeSingle();
    if (!enrolled) return { ok: false, error: 'Ce stagiaire n’est pas inscrit à la session.' };
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('clothing_loans')
    .insert({
      trainee_id: traineeId,
      session_id: sessionId,
      vestes,
      pantalons,
      // Colonne de la migration 74 : seulement si des baudriers sont prêtés.
      ...(baudriers ? { baudriers } : {}),
      ...(sign ? { address: sign.address.trim().slice(0, 300), city: sign.city.trim().slice(0, 120), signature: sign.signature, signed_at: now } : {}),
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: /baudriers|clothing_loans_some/i.test(error.message) ? 'Exécute d’abord la migration 74 (supabase/migration_phase74.sql) dans Supabase.' : MIGRATION };
  if (sign) await admin.from('trainees').update({ address: sign.address.trim().slice(0, 300) }).eq('id', traineeId);
  refresh({ trainee_id: traineeId, session_id: sessionId });
  return { ok: true, id: data.id };
}

/**
 * Prêt à un stagiaire de la session (choisi : certains ont leur propre
 * équipement). Signature tout de suite, ou plus tard via le QR code.
 */
export async function lendClothes(sessionId: string, traineeId: string, qty: Qty, sign: SignInput | null): Promise<Result<{ id: string }>> {
  if (!(await staffOf(sessionId))) return FORBIDDEN;
  return createLoan(traineeId, sessionId, qty, sign);
}

/** Prêt depuis la fiche du stagiaire : rattaché à une de ses sessions, ou à aucune. */
export async function lendFromTrainee(traineeId: string, sessionId: string | null, qty: Qty, sign: SignInput | null): Promise<Result<{ id: string }>> {
  const allowed = sessionId ? (await staffOf(sessionId)) || (await requireManager()) : await requireManager();
  if (!allowed) return FORBIDDEN;
  return createLoan(traineeId, sessionId || null, qty, sign);
}

/** Signature d'un prêt resté « à signer ». */
export async function signLoan(id: string, sign: SignInput): Promise<Result> {
  const { admin, loan } = await loanById(id);
  if (!loan) return { ok: false, error: 'Prêt introuvable.' };
  if (!(await canHandle(loan))) return FORBIDDEN;
  if (loan.signed_at) return { ok: false, error: 'Ce prêt est déjà signé.' };
  const err = checkSign(sign);
  if (err) return { ok: false, error: err };
  const { error } = await admin
    .from('clothing_loans')
    .update({ address: sign.address.trim().slice(0, 300), city: sign.city.trim().slice(0, 120), signature: sign.signature, signed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await admin.from('trainees').update({ address: sign.address.trim().slice(0, 300) }).eq('id', loan.trainee_id);
  refresh(loan);
  return { ok: true };
}

/**
 * Retour des vêtements : quantités rendues (au total), note, signature du
 * stagiaire. S'il manque un vêtement, le prêt reste « rendu incomplet » et
 * peut être complété plus tard.
 */
export async function returnClothes(id: string, ret: { vestes: number; pantalons: number; baudriers?: number; note: string; signature: string }): Promise<Result> {
  const { admin, loan } = await loanById(id);
  if (!loan) return { ok: false, error: 'Prêt introuvable.' };
  if (!(await canHandle(loan))) return FORBIDDEN;
  if (!validSignature(ret.signature)) return { ok: false, error: 'Le stagiaire doit signer le retour.' };
  const vestes = Math.min(loan.vestes, clampQty(ret.vestes));
  const pantalons = Math.min(loan.pantalons, clampQty(ret.pantalons));
  const baudriers = Math.min(loan.baudriers || 0, clampQty(ret.baudriers));
  const { error } = await admin
    .from('clothing_loans')
    .update({
      returned_vestes: vestes,
      returned_pantalons: pantalons,
      ...(loan.baudriers ? { returned_baudriers: baudriers } : {}),
      return_note: String(ret.note || '').trim().slice(0, 300) || null,
      return_signature: ret.signature,
      returned_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh(loan);
  return { ok: true };
}

export async function deleteLoan(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const { admin, loan } = await loanById(id);
  if (!loan) return { ok: false, error: 'Prêt introuvable.' };
  const { error } = await admin.from('clothing_loans').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh(loan);
  return { ok: true };
}
