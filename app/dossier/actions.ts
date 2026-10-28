'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canEditStartTimes } from '@/lib/roles';
import { FORBIDDEN, requireManager } from '@/lib/auth';
import { validSignature } from '@/lib/emargement';
import type { Half } from '@/lib/dossier';
import { EMARGEMENT_ENABLED } from '@/lib/features';
import { fillRights } from '@/lib/dossier-rights';

const EMARG_OFF = { ok: false as const, error: 'L’émargement se fait dans Digiforma.' };

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHalf = (v: string): v is Half => v === 'am' || v === 'pm';
const migrationHint = (msg: string) =>
  /attendance_signatures|dossier_|sign_token|schema cache|does not exist|bucket/i.test(msg)
    ? 'Exécute d’abord la migration 16 (supabase/migration_phase16.sql) dans Supabase.'
    : msg;

/** Peut remplir le dossier : bureau, admin, référent cadre, ou le formateur de la session. */
function refresh(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
}

/** Lire le dossier (signatures, documents remplis) : équipe, formateur de la session, compte Facturation. */
async function canReadDossier(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return false;
  return profile.can_invoice || Boolean(await fillRights(sessionId));
}

/** Jeton secret du QR code d'émargement (créé à la première ouverture). */
export async function ensureSignToken(sessionId: string, renew = false): Promise<Result<{ token: string }>> {
  if (!EMARGEMENT_ENABLED) return EMARG_OFF;
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
  if (!(await canReadDossier(sessionId))) return FORBIDDEN;
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
  if (!EMARGEMENT_ENABLED) return EMARG_OFF;
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  if (!isDay(day) || !isHalf(half)) return { ok: false, error: 'Demi-journée invalide.' };
  if (!validSignature(signature)) return { ok: false, error: 'Signature vide.' };
  // Le formateur de CE jour-là (remplaçant éventuel).
  const trainerName =
    r.days.find((d) => d.day === day)?.name || (Array.isArray(r.session.trainers) ? r.session.trainers[0] : r.session.trainers)?.full_name;
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
  if (!EMARGEMENT_ENABLED) return EMARG_OFF;
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
  if (!(await canReadDossier(sessionId))) return FORBIDDEN;
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
  if (!EMARGEMENT_ENABLED) return EMARG_OFF;
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

/** Tour de table : enregistrement automatique (et « terminé » si précisé). */
export async function saveTourDeTable(sessionId: string, data: unknown, completed?: boolean): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const json = JSON.stringify(data ?? {});
  if (json.length > 500_000) return { ok: false, error: 'Tour de table trop long.' };
  const row: Record<string, any> = {
    session_id: sessionId,
    kind: 'tour_de_table',
    data: JSON.parse(json),
    updated_by: r.profile.id,
    updated_at: new Date().toISOString(),
  };
  if (completed !== undefined) {
    row.completed = completed;
    row.completed_at = completed ? new Date().toISOString() : null;
  }
  const { error } = await r.supabase.from('session_forms').upsert(row, { onConflict: 'session_id,kind' });
  if (error) {
    return {
      ok: false,
      error: /session_forms|schema cache|does not exist/i.test(error.message)
        ? 'Exécute d’abord la migration 17 (supabase/migration_phase17.sql) dans Supabase.'
        : error.message,
    };
  }
  // Entreprise saisie dans le tour de table : reportée sur la fiche du stagiaire
  // (et donc partout sur la plateforme).
  const updated = await syncCompanies(sessionId, (row.data as any)?.rows || {});
  if (completed !== undefined || updated) refresh(sessionId);
  if (updated) {
    revalidatePath('/stagiaires');
    revalidatePath('/sessions');
  }
  return { ok: true };
}

/**
 * Met à jour l'entreprise des stagiaires de la session d'après le tour de
 * table. Le formateur n'a pas le droit de modifier l'annuaire : l'écriture
 * passe par le serveur, limitée aux stagiaires inscrits à cette session et au
 * seul champ « entreprise ». Renvoie le nombre de fiches modifiées.
 */
async function syncCompanies(sessionId: string, rows: Record<string, { company?: string }>): Promise<number> {
  const wanted = Object.entries(rows)
    .map(([id, r]) => [id, String(r?.company ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)] as const)
    .filter(([id, c]) => /^[0-9a-f-]{36}$/.test(id) && c);
  if (!wanted.length) return 0;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return 0;
  }
  const { data: links } = await admin
    .from('session_trainees')
    .select('trainee_id, trainees(company)')
    .eq('session_id', sessionId)
    .in('trainee_id', wanted.map(([id]) => id));
  const current = new Map(
    ((links as any[]) || []).map((l) => [l.trainee_id as string, ((Array.isArray(l.trainees) ? l.trainees[0] : l.trainees)?.company as string) || ''])
  );
  let n = 0;
  for (const [id, company] of wanted) {
    if (!current.has(id) || current.get(id) === company) continue;
    const { error } = await admin.from('trainees').update({ company }).eq('id', id);
    if (!error) n++;
  }
  return n;
}

/** Fiches d'appréciation individuelle : enregistrement automatique (terminé quand tous les avis sont donnés). */
export async function saveAppreciation(sessionId: string, data: unknown, completed: boolean): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const json = JSON.stringify(data ?? {});
  if (json.length > 500_000) return { ok: false, error: 'Fiches trop longues.' };
  const { data: before } = await r.supabase
    .from('session_forms')
    .select('completed')
    .eq('session_id', sessionId)
    .eq('kind', 'appreciation')
    .maybeSingle();
  const { error } = await r.supabase.from('session_forms').upsert(
    {
      session_id: sessionId,
      kind: 'appreciation',
      data: JSON.parse(json),
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_by: r.profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,kind' }
  );
  if (error) {
    return {
      ok: false,
      error: /session_forms|kind_check|schema cache|does not exist/i.test(error.message)
        ? 'Exécute d’abord la migration 21 (supabase/migration_phase21.sql) dans Supabase.'
        : error.message,
    };
  }
  if (Boolean((before as any)?.completed) !== completed) refresh(sessionId);
  return { ok: true };
}

/** Attestations de réussite (une par stagiaire) remplies et signées par le formateur. */
export async function saveReussite(sessionId: string, data: unknown, completed: boolean): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const json = JSON.stringify(data ?? {});
  if (json.length > 800_000) return { ok: false, error: 'Attestations trop longues.' };
  const { data: before } = await r.supabase
    .from('session_forms')
    .select('completed')
    .eq('session_id', sessionId)
    .eq('kind', 'reussite')
    .maybeSingle();
  const { error } = await r.supabase.from('session_forms').upsert(
    {
      session_id: sessionId,
      kind: 'reussite',
      data: JSON.parse(json),
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_by: r.profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,kind' }
  );
  if (error) {
    return {
      ok: false,
      error: /session_forms|kind_check|schema cache|does not exist/i.test(error.message)
        ? 'Exécute d’abord la migration 39 (supabase/migration_phase39.sql) dans Supabase.'
        : error.message,
    };
  }
  if (Boolean((before as any)?.completed) !== completed) refresh(sessionId);
  return { ok: true };
}

/** Fiches d'appréciation pour cette session : oui, non, ou comme la formation (null). */
export async function setSessionAppreciation(sessionId: string, value: boolean | null): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ fiche_appreciation: value }).eq('id', sessionId);
  if (error) {
    return {
      ok: false,
      error: /fiche_appreciation|schema cache/i.test(error.message) ? 'Exécute d’abord la migration 21 (supabase/migration_phase21.sql) dans Supabase.' : error.message,
    };
  }
  refresh(sessionId);
  return { ok: true };
}

/** « Documents remplis sur Digiforma » : coché par le formateur (suivi du dossier). */
export async function setDigiformaDone(sessionId: string, done: boolean): Promise<Result> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const now = new Date().toISOString();
  const { error } = await r.supabase.from('session_forms').upsert(
    { session_id: sessionId, kind: 'digiforma', data: {}, completed: done, completed_at: done ? now : null, updated_by: r.profile.id, updated_at: now },
    { onConflict: 'session_id,kind' }
  );
  if (error) return { ok: false, error: 'Exécute d’abord la migration 36 (supabase/migration_phase36.sql) dans Supabase.' };
  refresh(sessionId);
  return { ok: true };
}
