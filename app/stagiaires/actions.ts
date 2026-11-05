'use server';

import { graftOnCatalogHours } from '@/lib/graft';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { traineesLockError } from '@/lib/session-lock';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { resolveTraineesBulk, findTraineeConflictsBulk, upsertSessionLinks } from '@/lib/trainee-conflict';
import { parseNameList } from '@/lib/name-list';
import { sameCompany } from '@/lib/company';
import { parseTraineeFile } from '@/lib/trainee-file';
import { buildFullName, readTraineeName, duplicateMessage, isDuplicateError } from '@/lib/trainee-name';

export async function createTrainee(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = readTraineeName(formData);
  const email = String(formData.get('email') || '').trim() || null;
  const company = String(formData.get('company') || '').trim() || null;
  if (!name.last_name) return { ok: false, error: 'Le nom est requis.' };
  // Même personne déjà dans l'annuaire (nom / prénom dans n'importe quel ordre,
  // accents, majuscules, tirets indifférents, ou même e-mail) : pas de doublon,
  // on complète seulement les informations manquantes de sa fiche.
  let res;
  try {
    [res] = await resolveTraineesBulk(supabase, [{ name, email, company }]);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Enregistrement impossible.' };
  }
  if (!res) return { ok: false, error: 'Enregistrement impossible.' };
  revalidatePath('/stagiaires');
  if (res.created) return { ok: true, message: 'Stagiaire ajouté.' };
  revalidatePath(`/stagiaires/${res.id}`);
  return {
    ok: true,
    message: res.completed
      ? `${buildFullName(name)} existait déjà : sa fiche a été complétée avec les nouvelles informations.`
      : `${buildFullName(name)} existait déjà : sa fiche contenait déjà ces informations.`,
  };
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
  const rawCursus = formData.get('enroll_cursus');
  const enrollCursus = rawCursus === 'initial' || rawCursus === 'recyclage' ? rawCursus : null;

  const rows = parseNameList(text, order);
  if (rows.length === 0) return { ok: false, error: 'Aucun nom trouvé. Colle une personne par ligne (Nom et Prénom).' };
  if (rows.length > 5000) return { ok: false, error: 'Trop de lignes d’un coup (5000 maximum).' };

  const supabase = await createClient();
  const session = sessionId
    ? (await supabase.from('sessions').select('id, start_at, end_at').eq('id', sessionId).maybeSingle()).data
    : null;
  if (sessionId && !session) return { ok: false, error: 'Session introuvable.' };
  if (sessionId) {
    const locked = await traineesLockError(sessionId);
    if (locked) return { ok: false, error: locked };
  }

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

  // Formation INTRA : entreprise donnée aux stagiaires qui n'en ont pas ;
  // un stagiaire déjà rattaché à une autre entreprise est signalé (pas de mélange).
  const company = String(formData.get('company') || '').trim().slice(0, 160);
  if (company && ids.length) {
    const { data: current } = await supabase.from('trainees').select('id, company').in('id', ids.map((x) => x.id));
    const noCompany = ((current as any[]) || []).filter((t) => !String(t.company || '').trim()).map((t) => t.id);
    if (noCompany.length) await supabase.from('trainees').update({ company }).in('id', noCompany);
    for (const t of (current as any[]) || []) {
      if (t.company && !sameCompany(t.company, company)) {
        const i = ids.find((x) => x.id === t.id)?.i;
        errors.push(`${i != null ? label(i) : 'Un stagiaire'} : déjà enregistré chez « ${t.company} », pas chez ${company}. Vérifie qu’il s’agit bien de la même personne.`);
      }
    }
  }

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
    // Initial / recyclage choisi pour toute la liste.
    const ok = ids.map((x) => x.id).filter((id) => !failed.get(id));
    if (enrollCursus && ok.length) {
      const { error } = await supabase.from('session_trainees').update({ cursus: enrollCursus }).eq('session_id', session.id).in('trainee_id', ok);
      if (error) errors.push('Initial / recyclage non enregistré (migration 29 à exécuter).');
    }
    // Session de parcours plus longue que le catalogue : les personnes greffées suivent les heures du catalogue.
    const graft = await graftOnCatalogHours(supabase, session.id, ok).catch(() => null);
    if (graft) errors.push(graft);
  }

  revalidatePath('/stagiaires');
  if (sessionId) revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, created, matched, enrolled, errors };
}

// ---- Corbeille (migration 60) ------------------------------------------------

const TRASH_MIGRATION = 'Exécute d’abord la migration 60 (supabase/migration_phase60.sql) dans Supabase.';

/** Mettre des fiches à la corbeille (ou les restaurer). */
export async function trashTrainees(ids: string[], on: boolean, reason = 'Mise à la corbeille'): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await requireManager())) return FORBIDDEN;
  const list = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 2000);
  if (!list.length) return { ok: true, count: 0 };
  const supabase = await createClient();
  const { error } = await supabase
    .from('trainees')
    .update(on ? { trashed_at: new Date().toISOString(), trashed_reason: reason.slice(0, 200) } : { trashed_at: null, trashed_reason: null })
    .in('id', list);
  if (error) return { ok: false, error: TRASH_MIGRATION };
  revalidatePath('/stagiaires');
  return { ok: true, count: list.length };
}

/** Fiches fictives (« Apprenant A », « Stagiaire 2 », « Test »…) encore actives : toutes à la corbeille. */
export async function trashPlaceholderTrainees(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { isPlaceholder } = await import('@/lib/digiforma-people');
  const found: string[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('trainees').select('id, first_name, last_name, full_name').is('trashed_at', null).order('id').range(from, from + 999);
    if (error) return { ok: false, error: TRASH_MIGRATION };
    if (!data?.length) break;
    for (const t of data as any[]) {
      const first = t.first_name ?? null;
      const last = t.last_name ?? (first ? null : t.full_name);
      if (isPlaceholder({ firstName: first, lastName: last ?? t.full_name })) found.push(t.id);
    }
    if (data.length < 1000) break;
  }
  if (!found.length) return { ok: true, count: 0 };
  return trashTrainees(found, true, 'Fiche fictive (nom générique)');
}

/** Vider la corbeille : suppression définitive des fiches choisies (déjà à la corbeille). */
export async function purgeTrainees(ids: string[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await requireManager())) return FORBIDDEN;
  const list = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 2000);
  if (!list.length) return { ok: true, count: 0 };
  const supabase = await createClient();
  const { error } = await supabase.from('trainees').delete().in('id', list).not('trashed_at', 'is', null);
  if (error) return { ok: false, error: 'Suppression impossible : une fiche est sans doute liée à des documents signés. Garde-la à la corbeille.' };
  revalidatePath('/stagiaires');
  return { ok: true, count: list.length };
}
