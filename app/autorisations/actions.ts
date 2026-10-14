'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { canEditStartTimes } from '@/lib/roles';
import { validSignature } from '@/lib/emargement';
import { authMissing, isAuthKind, validAuthData, AUTH_KIND, type AuthKind } from '@/lib/autorisations';
import { loadAutorContext } from '@/lib/autorisations-server';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 24 (supabase/migration_phase24.sql) dans Supabase.';

function refreshTrainee(traineeId: string, sessionId?: string | null) {
  revalidatePath(`/stagiaires/${traineeId}`);
  if (sessionId) revalidatePath(`/sessions/${sessionId}`);
}

/** Bureau, référent ou formateur de la session (y compris remplaçant). */
async function staffOf(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (canEditStartTimes(profile.role)) return profile;
  if (!profile.trainer_id) return null;
  const supabase = await createClient();
  const [{ data: s }, { data: days }] = await Promise.all([
    supabase.from('sessions').select('trainer_id').eq('id', sessionId).maybeSingle(),
    supabase.from('session_day_trainers').select('trainer_id').eq('session_id', sessionId),
  ]);
  const ok = s?.trainer_id === profile.trainer_id || ((days as any[]) || []).some((d) => d.trainer_id === profile.trainer_id);
  return ok ? profile : null;
}

/** Jeton du QR code des autorisations (créé à la première ouverture). */
export async function ensureAutorToken(sessionId: string, renew = false): Promise<Result<{ token: string }>> {
  if (!(await staffOf(sessionId))) return FORBIDDEN;
  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const { data: s, error: readError } = await admin.from('sessions').select('autor_token').eq('id', sessionId).maybeSingle();
  if (readError) return { ok: false, error: MIGRATION };
  if (s?.autor_token && !renew) return { ok: true, token: s.autor_token };
  const token = randomBytes(24).toString('base64url');
  const { error } = await admin.from('sessions').update({ autor_token: token }).eq('id', sessionId);
  if (error) return { ok: false, error: MIGRATION };
  return { ok: true, token };
}

/** Autorisations demandées sur cette session (ajustement de celles de la formation). */
export async function setSessionAuthKinds(sessionId: string, kinds: string[]): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ authorizations: kinds.filter(isAuthKind) }).eq('id', sessionId);
  if (error) return { ok: false, error: MIGRATION };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export type SignPayload = {
  docs: { kind: string; data: Record<string, unknown>; accepted?: boolean }[];
  city: string;
  signature: string;
};

/**
 * Le stagiaire signe ses autorisations (page du QR code, sans compte).
 * Seules celles encore manquantes sont enregistrées ; elles rejoignent sa fiche.
 */
export async function signAuthorizations(token: string, traineeId: string, payload: SignPayload): Promise<Result<{ count: number }>> {
  const ctx = await loadAutorContext(token);
  if (!ctx.ok) return ctx;
  const trainee = ctx.trainees.find((t) => t.id === traineeId);
  if (!trainee) return { ok: false, error: 'Stagiaire introuvable sur cette session.' };
  if (!validSignature(payload.signature)) return { ok: false, error: 'Signe dans le cadre avant de valider.' };
  const city = String(payload.city || '').trim().slice(0, 120);
  if (!city) return { ok: false, error: 'Indique la ville (« Fait à »).' };

  const rows: { trainee_id: string; kind: AuthKind; data: object; accepted: boolean; signature: string; city: string; session_id: string; collected_by: null }[] = [];
  for (const kind of trainee.missing) {
    const doc = payload.docs.find((d) => d.kind === kind);
    if (!doc) return { ok: false, error: `${AUTH_KIND[kind].short} : à remplir.` };
    const data = validAuthData(kind, doc.data);
    const accepted = kind === 'image' ? doc.accepted !== false : true;
    const missing = authMissing(kind, data, accepted);
    if (missing.length) return { ok: false, error: `${AUTH_KIND[kind].short} : ${missing.join(', ')}.` };
    rows.push({ trainee_id: traineeId, kind, data, accepted, signature: payload.signature, city, session_id: ctx.sessionId, collected_by: null });
  }
  if (!rows.length) return { ok: true, count: 0 };

  const admin = createAdminClient();
  const { error } = await admin.from('trainee_authorizations').insert(rows);
  if (error) return { ok: false, error: 'Enregistrement impossible, réessaie.' };

  // Adresse / entreprise : reprises dans la fiche du stagiaire.
  const address = rows.map((r) => (r.data as any).address).find(Boolean);
  const company = rows.map((r) => (r.data as any).company).find(Boolean);
  const patch: Record<string, string> = {};
  if (address) patch.address = address;
  if (company && !trainee.company) patch.company = company;
  if (Object.keys(patch).length) await admin.from('trainees').update(patch).eq('id', traineeId);

  revalidatePath(`/autorisations/${token}`);
  refreshTrainee(traineeId, ctx.sessionId);
  return { ok: true, count: rows.length };
}

/** Vêtements / livrets rendus (une nouvelle attestation vêtements sera demandée la prochaine fois). */
export async function markReturned(id: string, returned: boolean): Promise<Result> {
  const profile = await requireManager();
  if (!profile) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trainee_authorizations')
    .update(returned ? { returned_at: new Date().toISOString(), returned_by: profile.id } : { returned_at: null, returned_by: null })
    .eq('id', id)
    .select('trainee_id, session_id')
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message || 'Autorisation introuvable.' };
  refreshTrainee(data.trainee_id, data.session_id);
  return { ok: true };
}

/** Supprime une autorisation (elle sera redemandée à la prochaine formation). */
export async function deleteAuthorization(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase.from('trainee_authorizations').delete().eq('id', id).select('trainee_id, session_id').maybeSingle();
  if (error || !data) return { ok: false, error: error?.message || 'Autorisation introuvable.' };
  refreshTrainee(data.trainee_id, data.session_id);
  return { ok: true };
}
