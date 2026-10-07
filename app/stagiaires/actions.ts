'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { findOrCreateTrainee } from '@/lib/trainee-conflict';
import { buildFullName, readTraineeName } from '@/lib/trainee-name';

export async function createTrainee(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = readTraineeName(formData);
  const email = String(formData.get('email') || '').trim() || null;
  const company = String(formData.get('company') || '').trim() || null;
  if (!name.last_name) return { ok: false, error: 'Le nom est requis.' };
  const { error } = await supabase.from('trainees').insert({ ...name, full_name: buildFullName(name), email, company });
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
  | { ok: true; created: number; matched: number; skipped: number; errors: string[] }
  | { ok: false; error: string };

/**
 * Importe des stagiaires depuis un CSV dans l'annuaire (sans les lier à une
 * session — ça se fait ensuite depuis la fiche de la session concernée).
 * Colonnes attendues (insensibles à la casse) : Prénom, Nom (requis), Email, Entreprise.
 */
export async function importTraineesCsvGlobal(formData: FormData): Promise<ImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choisis un fichier CSV.' };

  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, error: 'Fichier CSV illisible. Vérifie le format (colonnes séparées par , ou ;).' };
  }

  const supabase = await createClient();
  let created = 0;
  let matched = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    // « Prénom » + « Nom », ou un seul « Nom complet ».
    const first_name = getField(row, 'prénom', 'prenom', 'first name', 'firstname') || null;
    const last_name = getField(row, 'nom', 'nom complet', 'name', 'last name', 'lastname');
    const full_name = [first_name, last_name].filter(Boolean).join(' ');
    const email = getField(row, 'email', 'e-mail', 'mail') || null;
    const company = getField(row, 'entreprise', 'société', 'company') || null;

    if (!last_name) {
      skipped++;
      errors.push(`Ligne ${i + 2} : nom manquant, ignorée.`);
      continue;
    }
    const result = await findOrCreateTrainee(supabase, { first_name, last_name }, email, company);
    if (!result) {
      errors.push(`Ligne ${i + 2} (${full_name}) : import impossible.`);
      continue;
    }
    if (result.created) created++;
    else matched++;
  }

  revalidatePath('/stagiaires');
  return { ok: true, created, matched, skipped, errors };
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

  for (const t of trainees) {
    const result = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
    if (!result) {
      errors.push(`${t.fullName} : import impossible.`);
      continue;
    }
    if (result.created) created++;
    else matched++;
  }

  revalidatePath('/stagiaires');
  return { ok: true, created, matched, skipped: 0, errors };
}
