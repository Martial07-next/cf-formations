'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canEditStartTimes } from '@/lib/roles';
import { FORBIDDEN, requireManager } from '@/lib/auth';
import { validSignature } from '@/lib/emargement';
import type { Half } from '@/lib/dossier';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHalf = (v: string): v is Half => v === 'am' || v === 'pm';
const migrationHint = (msg: string) =>
  /attendance_signatures|dossier_|sign_token|schema cache|does not exist|bucket/i.test(msg)
    ? 'Exécute d’abord la migration 16 (supabase/migration_phase16.sql) dans Supabase.'
    : msg;

/** Peut remplir le dossier : bureau, admin, référent cadre, ou le formateur de la session. */
async function fillRights(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const { data: s } = await supabase.from('sessions').select('id, trainer_id, sign_token, trainers(full_name)').eq('id', sessionId).maybeSingle();
  if (!s) return null;
  const allowed = canEditStartTimes(profile.role) || (!!profile.trainer_id && profile.trainer_id === s.trainer_id);
  return allowed ? { profile, session: s as any, supabase } : null;
}

function refresh(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
}

/** Jeton secret du QR code d'émargement (créé à la première ouverture). */
export async function ensureSignToken(sessionId: string, renew = false): Promise<Result<{ token: string }>> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  if (r.session.sign_token && !renew) return { ok: true, token: r.session.sign_token };
  const token = randomBytes(24).toString('base64url');
  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const { error } = await admin.from('sessions').update({ sign_token: token }).eq('id', sessionId);
  if (error) return { ok: false, error: migrationHint(error.message) };
  return { ok: true, token };
}

/** État de l'émargement, sans les images (rafraîchissement en direct). */
export async function attendanceState(sessionId: string): Promise<Result<{ rows: { signer: string; trainee_id: string | null; day: string; half: Half; status: string }[] }>> {
  const profile = await getCurrentProfile();
  if (!profile) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('attendance_signatures')
    .select('signer, trainee_id, day, half, status')
    .eq('session_id', sessionId);
  if (error) return { ok: false, error: migrationHint(error.message) };
  return { ok: true, rows: (data as any) || [] };
}

/** Signature du formateur pour une demi-journée. */
export async function trainerSign(sessionId: string, day: string, half: string, signature: string): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  if (!isDay(day) || !isHalf(half)) return { ok: false, error: 'Demi-journée invalide.' };
  if (!validSignature(signature)) return { ok: false, error: 'Signature vide.' };
  const trainerName = (Array.isArray(r.session.trainers) ? r.session.trainers[0] : r.session.trainers)?.full_name;
  await r.supabase.from('attendance_signatures').delete().eq('session_id', sessionId).eq('signer', 'formateur').eq('day', day).eq('half', half);
  const { error } = await r.supabase.from('attendance_signatures').insert({
    session_id: sessionId,
    signer: 'formateur',
    trainee_id: null,
    day,
    half,
    status: 'signe',
    signature,
    signer_name: trainerName || r.profile.full_name,
    signed_by: r.profile.id,
  });
  if (error) return { ok: false, error: migrationHint(error.message) };
  refresh(sessionId);
  return { ok: true };
}

/** Stagiaire absent sur une demi-journée, ou remise à zéro (signature à refaire). */
export async function setTraineeAttendance(sessionId: string, traineeId: string, day: string, half: string, mode: 'absent' | 'reset'): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  if (!isDay(day) || !isHalf(half)) return { ok: false, error: 'Demi-journée invalide.' };
  const del = await r.supabase
    .from('attendance_signatures')
    .delete()
    .eq('session_id', sessionId)
    .eq('signer', 'stagiaire')
    .eq('trainee_id', traineeId)
    .eq('day', day)
    .eq('half', half);
  if (del.error) return { ok: false, error: migrationHint(del.error.message) };
  if (mode === 'absent') {
    const { error } = await r.supabase.from('attendance_signatures').insert({
      session_id: sessionId,
      signer: 'stagiaire',
      trainee_id: traineeId,
      day,
      half,
      status: 'absent',
      signed_by: r.profile.id,
    });
    if (error) return { ok: false, error: migrationHint(error.message) };
  }
  refresh(sessionId);
  return { ok: true };
}

/** Toutes les données nécessaires pour générer les PDF (émargement + documents). */
export async function dossierExport(sessionId: string): Promise<
  Result<{
    signatures: any[];
    entries: any[];
    files: Record<string, string>;
  }>
> {
  const profile = await getCurrentProfile();
  if (!profile) return FORBIDDEN;
  const supabase = await createClient();
  const [{ data: signatures, error }, { data: entries }, { data: s }] = await Promise.all([
    supabase.from('attendance_signatures').select('signer, trainee_id, day, half, status, signature, signer_name, signed_at').eq('session_id', sessionId),
    supabase.from('dossier_entries').select('document_id, data, completed, updated_at').eq('session_id', sessionId),
    supabase.from('sessions').select('template_id').eq('id', sessionId).maybeSingle(),
  ]);
  if (error) return { ok: false, error: migrationHint(error.message) };
  let q = supabase.from('dossier_documents').select('id, storage_path');
  q = s?.template_id ? q.or(`session_id.eq.${sessionId},template_id.eq.${s.template_id}`) : q.eq('session_id', sessionId);
  const { data: docs } = await q;
  const files: Record<string, string> = {};
  for (const d of (docs as any[]) || []) {
    const { data: signed } = await supabase.storage.from('dossiers').createSignedUrl(d.storage_path, 600);
    if (signed?.signedUrl) files[d.id] = signed.signedUrl;
  }
  return { ok: true, signatures: (signatures as any) || [], entries: (entries as any) || [], files };
}

/** Lien temporaire de téléchargement d'un document du dossier. */
export async function documentUrl(documentId: string): Promise<Result<{ url: string }>> {
  const profile = await getCurrentProfile();
  if (!profile) return FORBIDDEN;
  const supabase = await createClient();
  const { data: d } = await supabase.from('dossier_documents').select('storage_path').eq('id', documentId).maybeSingle();
  if (!d) return { ok: false, error: 'Document introuvable.' };
  const { data, error } = await supabase.storage.from('dossiers').createSignedUrl(d.storage_path, 600);
  if (error || !data) return { ok: false, error: migrationHint(error?.message || 'Fichier introuvable.') };
  return { ok: true, url: data.signedUrl };
}

/** Enregistrement automatique d'un document rempli en ligne. */
export async function saveEntry(sessionId: string, documentId: string, data: unknown, completed?: boolean): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const json = JSON.stringify(data ?? {});
  if (json.length > 3_000_000) return { ok: false, error: 'Document trop lourd (trop de signatures ?).' };
  const row: Record<string, any> = {
    session_id: sessionId,
    document_id: documentId,
    data: JSON.parse(json),
    updated_by: r.profile.id,
    updated_at: new Date().toISOString(),
  };
  if (completed !== undefined) row.completed = completed;
  const { error } = await r.supabase.from('dossier_entries').upsert(row, { onConflict: 'session_id,document_id' });
  if (error) return { ok: false, error: migrationHint(error.message) };
  if (completed !== undefined) refresh(sessionId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents du dossier (bureau) : le fichier est envoyé directement dans le
// stockage par le navigateur, puis enregistré ici.
// ---------------------------------------------------------------------------

export async function registerDocument(input: {
  template_id?: string | null;
  session_id?: string | null;
  title: string;
  storage_path: string;
  file_name: string;
  filled_by: string;
  required: boolean;
}): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const title = String(input.title || '').trim().slice(0, 120);
  if (!title) return { ok: false, error: 'Donne un nom au document.' };
  if (!input.template_id && !input.session_id) return { ok: false, error: 'Document sans formation ni session.' };
  if (!/^(templates|sessions)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(input.storage_path)) return { ok: false, error: 'Fichier invalide.' };
  const filled_by = ['formateur', 'bureau', 'aucun'].includes(input.filled_by) ? input.filled_by : 'formateur';
  const supabase = await createClient();
  const owner = input.template_id ? { template_id: input.template_id } : { session_id: input.session_id };
  const { data: last } = await supabase
    .from('dossier_documents')
    .select('position')
    .match(owner)
    .order('position', { ascending: false })
    .limit(1);
  const { error } = await supabase.from('dossier_documents').insert({
    ...owner,
    title,
    storage_path: input.storage_path,
    file_name: String(input.file_name || '').slice(0, 200),
    filled_by,
    required: filled_by === 'aucun' ? false : Boolean(input.required),
    position: ((last?.[0] as any)?.position ?? -1) + 1,
  });
  if (error) {
    await supabase.storage.from('dossiers').remove([input.storage_path]);
    return { ok: false, error: migrationHint(error.message) };
  }
  revalidatePath('/modeles');
  if (input.session_id) refresh(input.session_id);
  return { ok: true };
}

export async function updateDocument(id: string, patch: { title?: string; filled_by?: string; required?: boolean }): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const row: Record<string, any> = {};
  if (patch.title !== undefined) row.title = String(patch.title).trim().slice(0, 120);
  if (patch.filled_by !== undefined && ['formateur', 'bureau', 'aucun'].includes(patch.filled_by)) row.filled_by = patch.filled_by;
  if (patch.required !== undefined) row.required = Boolean(patch.required);
  if (row.filled_by === 'aucun') row.required = false;
  const supabase = await createClient();
  const { error } = await supabase.from('dossier_documents').update(row).eq('id', id);
  if (error) return { ok: false, error: migrationHint(error.message) };
  revalidatePath('/modeles');
  revalidatePath('/sessions', 'layout');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: d } = await supabase.from('dossier_documents').select('storage_path').eq('id', id).maybeSingle();
  const { error } = await supabase.from('dossier_documents').delete().eq('id', id);
  if (error) return { ok: false, error: migrationHint(error.message) };
  if (d?.storage_path) await supabase.storage.from('dossiers').remove([d.storage_path]);
  revalidatePath('/modeles');
  revalidatePath('/sessions', 'layout');
  revalidatePath('/');
  return { ok: true };
}

/** Signature d'un stagiaire sur l'appareil du formateur (stagiaire sans téléphone). */
export async function staffTraineeSign(sessionId: string, traineeId: string, day: string, half: string, signature: string): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  if (!isDay(day) || !isHalf(half)) return { ok: false, error: 'Demi-journée invalide.' };
  if (!validSignature(signature)) return { ok: false, error: 'Signature vide.' };
  await r.supabase
    .from('attendance_signatures')
    .delete()
    .eq('session_id', sessionId)
    .eq('signer', 'stagiaire')
    .eq('trainee_id', traineeId)
    .eq('day', day)
    .eq('half', half);
  const { error } = await r.supabase.from('attendance_signatures').insert({
    session_id: sessionId,
    signer: 'stagiaire',
    trainee_id: traineeId,
    day,
    half,
    status: 'signe',
    signature,
    signed_by: r.profile.id,
  });
  if (error) return { ok: false, error: migrationHint(error.message) };
  refresh(sessionId);
  return { ok: true };
}
