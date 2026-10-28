'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fillRights } from '@/lib/dossier-rights';
import { FORBIDDEN } from '@/lib/auth';
import { TITLE_MAX_BYTES, TITLE_MAX_FILES, TITLE_MIME, type TitleFile } from '@/lib/titres';

/**
 * Titres d'habilitation (migration 46). Le fichier part directement du
 * navigateur vers le stockage privé grâce à une URL d'envoi signée, délivrée
 * ici après contrôle : formateur / bureau (droits du dossier) ou stagiaire
 * (jeton du QR code de la session, stagiaire validé sur la session).
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BUCKET = 'titres';
const MIGRATION = 'Exécute d’abord la migration 46 (supabase/migration_phase46.sql) dans Supabase.';
const hint = (msg: string) => (/habilitation_titles|title_token|schema cache|does not exist/i.test(msg) ? MIGRATION : msg);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function admin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Stagiaire validé sur la session ? */
async function enrolled(db: any, sessionId: string, traineeId: string) {
  const { data } = await db.from('session_trainees').select('trainee_id').eq('session_id', sessionId).eq('trainee_id', traineeId).eq('status', 'validee').maybeSingle();
  return Boolean(data);
}

function checkFile(name: string, mime: string, size: number): string | null {
  if (!TITLE_MIME[mime]) return 'Format non accepté : photo (JPG, PNG, HEIC) ou PDF.';
  if (!(size > 0) || size > TITLE_MAX_BYTES) return 'Fichier trop lourd (10 Mo maximum).';
  if (!name || name.length > 200) return 'Nom de fichier invalide.';
  return null;
}

async function signedUpload(db: any, sessionId: string, traineeId: string, mime: string): Promise<Result<{ path: string; token: string }>> {
  const { count } = await db.from('habilitation_titles').select('id', { count: 'exact', head: true }).eq('session_id', sessionId).eq('trainee_id', traineeId);
  if ((count || 0) >= TITLE_MAX_FILES) return { ok: false, error: `${TITLE_MAX_FILES} fichiers maximum par stagiaire : supprime d’abord un fichier.` };
  const path = `${sessionId}/${traineeId}/${Date.now()}-${randomBytes(6).toString('hex')}.${TITLE_MIME[mime]}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message || 'Envoi impossible.' };
  return { ok: true, path, token: data.token };
}

/** Enregistre le fichier une fois envoyé (vérifie qu'il existe bien, avec sa vraie taille). */
async function register(db: any, sessionId: string, traineeId: string, path: string, name: string, source: TitleFile['source'], createdBy: string | null): Promise<Result> {
  const prefix = `${sessionId}/${traineeId}/`;
  if (!path.startsWith(prefix) || !/^[0-9]+-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$/.test(path.slice(prefix.length))) return { ok: false, error: 'Fichier invalide.' };
  const { data: list } = await db.storage.from(BUCKET).list(prefix.slice(0, -1), { search: path.slice(prefix.length) });
  const obj = ((list as any[]) || []).find((o) => o.name === path.slice(prefix.length));
  if (!obj) return { ok: false, error: 'Le fichier n’a pas été reçu, réessaie.' };
  const size = Number(obj.metadata?.size || 0);
  const mime = String(obj.metadata?.mimetype || '');
  if (size > TITLE_MAX_BYTES || (mime && !TITLE_MIME[mime])) {
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, error: 'Fichier refusé (format ou taille).' };
  }
  const { error } = await db.from('habilitation_titles').insert({
    session_id: sessionId,
    trainee_id: traineeId,
    storage_path: path,
    file_name: name.slice(0, 200),
    mime: mime || 'application/octet-stream',
    size,
    source,
    created_by: createdBy,
  });
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, error: hint(error.message) };
  }
  return { ok: true };
}

// ---- Formateur / bureau --------------------------------------------------

export async function prepareTitleUpload(sessionId: string, traineeId: string, name: string, mime: string, size: number): Promise<Result<{ path: string; token: string }>> {
  if (!isUuid(sessionId) || !isUuid(traineeId)) return FORBIDDEN;
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const bad = checkFile(name, mime, size);
  if (bad) return { ok: false, error: bad };
  const db = admin();
  if (!db) return { ok: false, error: 'Configuration du serveur incomplète.' };
  if (!(await enrolled(db, sessionId, traineeId))) return { ok: false, error: 'Stagiaire non inscrit sur cette session.' };
  return signedUpload(db, sessionId, traineeId, mime);
}

export async function confirmTitleUpload(sessionId: string, traineeId: string, path: string, name: string): Promise<Result<{ files: TitleFile[] }>> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const db = admin();
  if (!db) return { ok: false, error: 'Configuration du serveur incomplète.' };
  const source = ['admin', 'bureau'].includes(r.profile.role) && !r.profile.trainer_id ? 'bureau' : 'formateur';
  const res = await register(db, sessionId, traineeId, path, name, source, r.profile.id);
  if (!res.ok) return res;
  revalidatePath(`/sessions/${sessionId}`);
  return listTitles(sessionId);
}

export async function listTitles(sessionId: string): Promise<Result<{ files: TitleFile[] }>> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const { data, error } = await r.supabase
    .from('habilitation_titles')
    .select('id, trainee_id, file_name, mime, size, source, created_at')
    .eq('session_id', sessionId)
    .order('created_at');
  if (error) return { ok: false, error: hint(error.message) };
  return { ok: true, files: (data as any) || [] };
}

/** Lien de téléchargement (10 min), nom de fichier « Titre d'habilitation - NOM ». */
export async function titleDownloadUrl(id: string, downloadName: string): Promise<Result<{ url: string }>> {
  if (!isUuid(id)) return FORBIDDEN;
  const db = admin();
  if (!db) return { ok: false, error: 'Configuration du serveur incomplète.' };
  const { data: row } = await db.from('habilitation_titles').select('session_id, storage_path').eq('id', id).maybeSingle();
  if (!row) return { ok: false, error: 'Fichier introuvable.' };
  // Lecture : mêmes droits que la table (dossier de la session ou facturation), via le RLS.
  const supabase = await createClient();
  const { data: visible } = await supabase.from('habilitation_titles').select('id').eq('id', id).maybeSingle();
  if (!visible) return FORBIDDEN;
  const safe = downloadName.replace(/[^\p{L}\p{N} ._'-]/gu, '').slice(0, 120) || 'Titre';
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 600, { download: safe });
  if (error || !data) return { ok: false, error: error?.message || 'Téléchargement impossible.' };
  return { ok: true, url: data.signedUrl };
}

export async function deleteTitle(id: string): Promise<Result<{ files: TitleFile[] }>> {
  if (!isUuid(id)) return FORBIDDEN;
  const db = admin();
  if (!db) return { ok: false, error: 'Configuration du serveur incomplète.' };
  const { data: row } = await db.from('habilitation_titles').select('session_id, storage_path').eq('id', id).maybeSingle();
  if (!row) return { ok: false, error: 'Fichier introuvable.' };
  const r = await fillRights(row.session_id);
  if (!r) return FORBIDDEN;
  await db.storage.from(BUCKET).remove([row.storage_path]);
  await db.from('habilitation_titles').delete().eq('id', id);
  revalidatePath(`/sessions/${row.session_id}`);
  return listTitles(row.session_id);
}

/** Jeton du QR code de dépôt (créé à la première demande, renouvelable). */
export async function ensureTitleToken(sessionId: string, renew = false): Promise<Result<{ token: string }>> {
  const r = await fillRights(sessionId);
  if (!r) return FORBIDDEN;
  const db = admin();
  if (!db) return { ok: false, error: 'Configuration du serveur incomplète.' };
  const { data: s, error: e1 } = await db.from('sessions').select('title_token').eq('id', sessionId).maybeSingle();
  if (e1) return { ok: false, error: hint(e1.message) };
  if (s?.title_token && !renew) return { ok: true, token: s.title_token };
  const token = randomBytes(24).toString('base64url');
  const { error } = await db.from('sessions').update({ title_token: token }).eq('id', sessionId);
  if (error) return { ok: false, error: hint(error.message) };
  return { ok: true, token };
}

// ---- Stagiaire (QR code, sans compte) --------------------------------------

/** Session du jeton, valable jusqu'à 30 jours après la fin de la formation. */
async function sessionOfToken(db: any, token: string): Promise<{ id: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data: s } = await db.from('sessions').select('id, end_at').eq('title_token', token).maybeSingle();
  if (!s) return null;
  if (Date.now() > new Date(s.end_at).getTime() + 30 * 86400000) return null;
  return { id: s.id };
}

export async function preparePublicTitleUpload(token: string, traineeId: string, name: string, mime: string, size: number): Promise<Result<{ path: string; token: string }>> {
  const db = admin();
  if (!db) return { ok: false, error: 'Service indisponible.' };
  const s = await sessionOfToken(db, token);
  if (!s) return { ok: false, error: 'Ce QR code n’est plus valable. Demande au formateur de l’afficher à nouveau.' };
  if (!isUuid(traineeId) || !(await enrolled(db, s.id, traineeId))) return { ok: false, error: 'Stagiaire introuvable sur cette formation.' };
  const bad = checkFile(name, mime, size);
  if (bad) return { ok: false, error: bad };
  return signedUpload(db, s.id, traineeId, mime);
}

export async function confirmPublicTitleUpload(token: string, traineeId: string, path: string, name: string): Promise<Result> {
  const db = admin();
  if (!db) return { ok: false, error: 'Service indisponible.' };
  const s = await sessionOfToken(db, token);
  if (!s || !isUuid(traineeId) || !(await enrolled(db, s.id, traineeId))) return { ok: false, error: 'Ce QR code n’est plus valable.' };
  const res = await register(db, s.id, traineeId, path, name, 'stagiaire', null);
  if (res.ok) revalidatePath(`/sessions/${s.id}`);
  return res;
}
