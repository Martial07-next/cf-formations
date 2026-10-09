'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { resolveTraineesBulk, findTraineeConflictsBulk, upsertSessionLinks } from '@/lib/trainee-conflict';
import { parseNameList } from '@/lib/name-list';
import { parseTraineeFile } from '@/lib/trainee-file';
import { buildFullName, readTraineeName, duplicateMessage, isDuplicateError } from '@/lib/trainee-name';

export async function createTrainee(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = readTraineeName(formData);
  const email = String(formData.get('email') || '').trim() || null;
  const company = String(formData.get('company') || '').trim() || null;
  if (!name.last_name) return { ok: false, error: 'Le nom est requis.' };
  const full_name = buildFullName(name);
  const { error } = await supabase.from('trainees').insert({ ...name, full_name, email, company });
  if (isDuplicateError(error)) return { ok: false, error: duplicateMessage(full_name) };
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  return { ok: true };
}

export async function deleteTrainee(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('trainees').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  return { ok: true };
}

export async function updateTrainee(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = readTraineeName(formData);
  const email = String(formData.get('email') || '').trim() || null;
  const company = String(formData.get('company') || '').trim() || null;
  if (!name.last_name) return { ok: false, error: 'Le nom est requis.' };
  const { error } = await supabase
    .from('trainees')
    .update({ ...name, full_name: buildFullName(name), email, company })
    .eq('id', id);
  if (isDuplicateError(error)) return { ok: false, error: duplicateMessage(buildFullName(name)) };
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  revalidatePath(`/stagiaires/${id}`);
  return { ok: true };
}

function norm(s: string) {
  return s.trim().toLowerCase();
}
function getField(row: Record<string, string>, ...names: string[]): string {
  for (const key of Object.keys(row)) {
    if (names.includes(norm(key))) return (row[key] || '').trim();
  }
  return '';
}

export type ImportResult =
  | { ok: true; created: number; matched: number; skipped: number; duplicates?: number; completed?: number; errors: string[] }
  | { ok: false; error: string };

/**
 * Importe un fichier de stagiaires (Excel .xlsx ou CSV) dans l'annuaire.
 * Colonnes : NOM, PRENOM, ENTREPRISE, EMAIL. Les doublons du fichier sont
 * retirés ; un stagiaire déjà connu n'est jamais recréé (il est complété).
 */
export async function importTraineesCsvGlobal(formData: FormData): Promise<ImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choisis un fichier Excel (.xlsx) ou CSV.' };

  let parsed;
  try {
    parsed = await parseTraineeFile(file);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Fichier illisible.' };
  }
  if (!parsed.rows.length) return { ok: false, error: parsed.errors[0] || 'Aucun stagiaire trouvé dans le fichier.' };

  const supabase = await createClient();
  let created = 0;
  let matched = 0;
  let completed = 0;
  const errors = [...parsed.errors];

  let results;
  try {
    results = await resolveTraineesBulk(supabase, parsed.rows);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Import impossible.' };
  }
  parsed.rows.forEach((row, i) => {
    const result = results[i];
    if (!result) {
      errors.push(`Ligne ${row.line} (${buildFullName(row.name)}) : import impossible.`);
      return;
    }
    if (result.created) created++;
    else {
      matched++;
      if (result.completed) completed++;
    }
  });

  revalidatePath('/stagiaires');
  const skipped = parsed.errors.filter((e) => e.includes('ignorée')).length;
  return { ok: true, created, matched, completed, skipped, duplicates: parsed.duplicates, errors };
}

/** Récupère tous les stagiaires connus de Digiforma et les ajoute/reconnaît dans l'annuaire. */
export async function importTraineesFromDigiforma(): Promise<ImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const { digiformaListTrainees } = await import('@/lib/digiforma');
  let trainees;
  try {
    trainees = await digiformaListTrainees();
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  if (trainees.length === 0) {
    return { ok: false, error: "Digiforma n'a renvoyé aucun stagiaire." };
  }

  const supabase = await createClient();
  let created = 0;
  let matched = 0;
  const errors: string[] = [];

  let results;
  try {
    results = await resolveTraineesBulk(
      supabase,
      trainees.map((t) => ({ name: { first_name: t.firstName, last_name: t.lastName }, email: t.email }))
    );
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Import impossible.' };
  }
  trainees.forEach((t, i) => {
    const result = results[i];
    if (!result) errors.push(`${t.fullName} : import impossible.`);
    else if (result.created) created++;
    else matched++;
  });

  revalidatePath('/stagiaires');
  return { ok: true, created, matched, skipped: 0, errors };
}

export type PasteImportResult =
  | { ok: true; created: number; matched: number; enrolled: number; errors: string[] }
  | { ok: false; error: string };

/**
 * Importe une liste collée (Nom + Prénom, une personne par ligne).
 * Avec `sessionId`, les stagiaires sont aussi inscrits à cette session.
 */
export async function importTraineesFromText(formData: FormData): Promise<PasteImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const text = String(formData.get('list') || '');
  const order = formData.get('order') === 'prenom_nom' ? 'prenom_nom' : 'nom_prenom';
  const sessionId = String(formData.get('session_id') || '') || null;
  const enrollStatus = formData.get('enroll_status') === 'validee' ? 'validee' : 'en_attente';

  const rows = parseNameList(text, order);
  if (rows.length === 0) return { ok: false, error: 'Aucun nom trouvé. Colle une personne par ligne (Nom et Prénom).' };
  if (rows.length > 5000) return { ok: false, error: 'Trop de lignes d’un coup (5000 maximum).' };

  const supabase = await createClient();
  const session = sessionId
    ? (await supabase.from('sessions').select('id, start_at, end_at').eq('id', sessionId).maybeSingle()).data
    : null;
  if (sessionId && !session) return { ok: false, error: 'Session introuvable.' };

  let created = 0;
  let matched = 0;
  let enrolled = 0;
  const errors: string[] = [];

  let results;
  try {
    results = await resolveTraineesBulk(supabase, rows);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Import impossible.' };
  }
  const label = (i: number) => [rows[i].name.first_name, rows[i].name.last_name].filter(Boolean).join(' ');
  const ids: { id: string; i: number }[] = [];
  rows.forEach((row, i) => {
    const trainee = results[i];
    if (!trainee) {
      errors.push(`Ligne ${row.line} (${label(i)}) : création impossible.`);
      return;
    }
    if (trainee.created) created++;
    else matched++;
    if (!ids.some((x) => x.id === trainee.id)) ids.push({ id: trainee.id, i });
  });

  if (session && ids.length) {
    const conflicts =
      enrollStatus === 'validee'
        ? await findTraineeConflictsBulk(supabase, ids.map((x) => x.id), session.start_at, session.end_at, session.id)
        : new Map();
    const links = ids.map(({ id, i }) => {
      const conflict = conflicts.get(id);
      if (conflict) errors.push(`${label(i)} : déjà validé sur « ${conflict.title} » sur ce créneau, mis en attente.`);
      return { trainee_id: id, status: (conflict ? 'en_attente' : enrollStatus) as 'validee' | 'en_attente' };
    });
    const failed = await upsertSessionLinks(supabase, session.id, links);
    for (const { id, i } of ids) {
      const msg = failed.get(id);
      if (msg) errors.push(`${label(i)} : ${msg}`);
      else enrolled++;
    }
  }

  revalidatePath('/stagiaires');
  if (sessionId) revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, created, matched, enrolled, errors };
}
