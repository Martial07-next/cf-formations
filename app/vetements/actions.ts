'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { staffOf } from '@/lib/session-staff';
import { validSignature } from '@/lib/emargement';
import { clampQty, LOAN_SELECT, loanText, missingText, type ClothingLoan } from '@/lib/vetements';
import { logTrace } from '@/lib/trace-server';
import { getCurrentProfile } from '@/lib/supabase/server';

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
  const me = await getCurrentProfile();
  const { data, error } = await admin
    .from('clothing_loans')
    .insert({
      lent_by: me?.id || null,
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
  const what = loanText({ vestes, pantalons, baudriers } as ClothingLoan);
  await logTrace([
    { entity: 'pret', action: 'prete', recordId: data.id, traineeId, sessionId, detail: what, snapshot: { vestes, pantalons, baudriers } },
    ...(sign ? [{ entity: 'pret' as const, action: 'signe', recordId: data.id, traineeId, sessionId, channel: 'tablette' as const, detail: `${what} · fait à ${sign.city.trim()}`, signature: sign.signature }] : []),
  ]);
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
  await logTrace({ entity: 'pret', action: 'signe', recordId: id, traineeId: loan.trainee_id, sessionId: loan.session_id, channel: 'tablette', detail: `${loanText(loan)} · fait à ${sign.city.trim()}`, signature: sign.signature });
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
  const me = await getCurrentProfile();
  const { error } = await admin
    .from('clothing_loans')
    .update({
      returned_by: me?.id || null,
      returned_vestes: vestes,
      returned_pantalons: pantalons,
      ...(loan.baudriers ? { returned_baudriers: baudriers } : {}),
      return_note: String(ret.note || '').trim().slice(0, 300) || null,
      return_signature: ret.signature,
      returned_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  const after = { ...loan, returned_at: 'x', returned_vestes: vestes, returned_pantalons: pantalons, returned_baudriers: baudriers } as ClothingLoan;
  const manque = missingText(after);
  await logTrace({
    entity: 'pret', action: manque ? 'restitue_incomplet' : 'restitue', recordId: id, traineeId: loan.trainee_id, sessionId: loan.session_id, channel: 'tablette',
    detail: [`Rendu : ${loanText({ vestes, pantalons, baudriers } as ClothingLoan)}`, manque, String(ret.note || '').trim()].filter(Boolean).join(' · '),
    signature: ret.signature,
  });
  refresh(loan);
  return { ok: true };
}

export async function deleteLoan(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const { admin, loan } = await loanById(id);
  if (!loan) return { ok: false, error: 'Prêt introuvable.' };
  const { error } = await admin.from('clothing_loans').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logTrace({ entity: 'pret', action: 'supprime', recordId: id, traineeId: loan.trainee_id, sessionId: loan.session_id, detail: `${loanText(loan)}${loan.signed_at ? ' · prêt signé' : ' · non signé'}${loan.returned_at ? ' · déjà rendu' : ''}`, snapshot: loan as any });
  refresh(loan);
  return { ok: true };
}

const QR_MIGRATION = 'Exécute d’abord la migration 75 (supabase/migration_phase75.sql) dans Supabase.';

/** Lien du QR code pour signer un prêt sur le téléphone du stagiaire (créé à la première demande). */
export async function loanSignToken(id: string): Promise<Result<{ token: string }>> {
  const { admin, loan } = await loanById(id);
  if (!loan) return { ok: false, error: 'Prêt introuvable.' };
  if (!(await canHandle(loan))) return FORBIDDEN;
  if (loan.signed_at) return { ok: false, error: 'Ce prêt est déjà signé.' };
  if ((loan as any).sign_token) return { ok: true, token: (loan as any).sign_token };
  const { randomBytes } = await import('crypto');
  const token = randomBytes(24).toString('base64url');
  const { error } = await admin.from('clothing_loans').update({ sign_token: token }).eq('id', id);
  if (error) return { ok: false, error: QR_MIGRATION };
  await logTrace({ entity: 'pret', action: 'qr', recordId: id, traineeId: loan.trainee_id, sessionId: loan.session_id, detail: loanText(loan) });
  return { ok: true, token };
}

/** Le prêt est-il signé ? (la tablette attend la signature faite sur le téléphone). */
export async function loanSigned(id: string): Promise<boolean> {
  const { loan } = await loanById(id);
  if (!loan || !(await canHandle(loan))) return false;
  return Boolean(loan.signed_at);
}

/** Page du QR code (sans compte) : ce qui est prêté et à qui ; jamais d'autre donnée. */
export async function loanByToken(token: string): Promise<
  Result<{ traineeName: string; vestes: number; pantalons: number; baudriers: number; address: string | null; signed: boolean }>
> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'Ce QR code n’est pas valable.' };
  const admin = createAdminClient();
  const { data: l, error } = await admin.from('clothing_loans').select('*, trainees(full_name, address)').eq('sign_token', token).maybeSingle();
  if (error || !l) return { ok: false, error: 'Ce QR code n’est plus valable. Demande au formateur de l’afficher à nouveau.' };
  const t: any = Array.isArray((l as any).trainees) ? (l as any).trainees[0] : (l as any).trainees;
  return {
    ok: true,
    traineeName: t?.full_name || 'Stagiaire',
    vestes: (l as any).vestes,
    pantalons: (l as any).pantalons,
    baudriers: (l as any).baudriers || 0,
    address: (l as any).address || t?.address || null,
    signed: Boolean((l as any).signed_at),
  };
}

/** Signature du prêt depuis le téléphone du stagiaire (QR code). */
export async function signLoanByToken(token: string, sign: SignInput): Promise<Result> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'Ce QR code n’est pas valable.' };
  const admin = createAdminClient();
  const { data: l } = await admin.from('clothing_loans').select(LOAN_SELECT).eq('sign_token', token).maybeSingle();
  const loan = l as ClothingLoan | null;
  if (!loan) return { ok: false, error: 'Ce QR code n’est plus valable.' };
  if (loan.signed_at) return { ok: false, error: 'Ce prêt est déjà signé.' };
  const err = checkSign(sign);
  if (err) return { ok: false, error: err };
  const { error } = await admin
    .from('clothing_loans')
    .update({ address: sign.address.trim().slice(0, 300), city: sign.city.trim().slice(0, 120), signature: sign.signature, signed_at: new Date().toISOString() })
    .eq('id', loan.id)
    .is('signed_at', null);
  if (error) return { ok: false, error: error.message };
  await admin.from('trainees').update({ address: sign.address.trim().slice(0, 300) }).eq('id', loan.trainee_id);
  await logTrace({ entity: 'pret', action: 'signe', anonymous: true, recordId: loan.id, traineeId: loan.trainee_id, sessionId: loan.session_id, channel: 'qr', detail: `${loanText(loan)} · fait à ${sign.city.trim()}`, signature: sign.signature });
  refresh(loan);
  return { ok: true };
}
