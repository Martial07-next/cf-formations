'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Cherche si `traineeId` est déjà VALIDÉ sur une autre session dont le
 * créneau chevauche [startAt, endAt]. Un stagiaire ne peut pas suivre deux
 * formations en même temps.
 */
export async function findTraineeConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  traineeId: string,
  startAt: string,
  endAt: string,
  excludeSessionId?: string
): Promise<{ sessionId: string; title: string } | null> {
  const { data } = await supabase
    .from('session_trainees')
    .select('status, sessions(id, title, start_at, end_at)')
    .eq('trainee_id', traineeId)
    .eq('status', 'validee');

  for (const row of data || []) {
    const s: any = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!s || s.id === excludeSessionId) continue;
    if (s.start_at < endAt && s.end_at > startAt) return { sessionId: s.id, title: s.title };
  }
  return null;
}

export async function updateSessionDetails(sessionId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const title = String(formData.get('title') || '').trim();
  const reference = String(formData.get('reference') || '').trim() || null;
  const roomId = String(formData.get('room_id') || '');
  const trainerId = String(formData.get('trainer_id') || '') || null;
  const startAt = String(formData.get('start_at') || '');
  const endAt = String(formData.get('end_at') || '');
  const status = String(formData.get('status') || 'planifiee');
  const maxTraineesRaw = String(formData.get('max_trainees') || '');
  const maxTrainees = maxTraineesRaw ? Number(maxTraineesRaw) : null;
  const notes = String(formData.get('notes') || '').trim() || null;

  if (!title || !roomId || !startAt || !endAt) {
    return { ok: false, error: 'Titre, salle, début et fin sont obligatoires.' };
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return { ok: false, error: 'La fin doit être après le début.' };
  }

  const { data: overlaps, error: overlapError } = await supabase
    .from('sessions')
    .select('id, title, room_id, trainer_id')
    .neq('id', sessionId)
    .lt('start_at', endAt)
    .gt('end_at', startAt);
  if (overlapError) return { ok: false, error: overlapError.message };

  const roomClash = overlaps?.find((s) => s.room_id === roomId);
  if (roomClash) return { ok: false, error: `Conflit : la salle est déjà réservée pour "${roomClash.title}".` };
  if (trainerId) {
    const trainerClash = overlaps?.find((s) => s.trainer_id === trainerId);
    if (trainerClash) return { ok: false, error: `Conflit : ce formateur anime déjà "${trainerClash.title}".` };
  }

  const { error } = await supabase
    .from('sessions')
    .update({
      title,
      reference,
      room_id: roomId,
      trainer_id: trainerId,
      start_at: startAt,
      end_at: endAt,
      status,
      max_trainees: maxTrainees,
      notes,
    })
    .eq('id', sessionId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  revalidatePath('/sessions');
  return { ok: true };
}

export async function addTraineeToSession(
  sessionId: string,
  traineeId: string,
  status: 'validee' | 'en_attente'
): Promise<ActionResult> {
  if (!traineeId) return { ok: false, error: 'Choisis un stagiaire.' };
  const supabase = await createClient();

  if (status === 'validee') {
    const { data: session } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
    if (session) {
      const conflict = await findTraineeConflict(supabase, traineeId, session.start_at, session.end_at, sessionId);
      if (conflict) {
        return { ok: false, error: `Conflit : ce stagiaire est déjà validé sur "${conflict.title}" sur ce créneau.` };
      }
    }
  }

  const { error } = await supabase
    .from('session_trainees')
    .insert({ session_id: sessionId, trainee_id: traineeId, status });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ce stagiaire est déjà inscrit à cette session.' };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export async function removeTraineeFromSession(sessionId: string, traineeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('session_trainees')
    .delete()
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export async function setTraineeStatus(
  sessionId: string,
  traineeId: string,
  status: 'validee' | 'en_attente'
): Promise<ActionResult> {
  const supabase = await createClient();

  if (status === 'validee') {
    const { data: session } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
    if (session) {
      const conflict = await findTraineeConflict(supabase, traineeId, session.start_at, session.end_at, sessionId);
      if (conflict) {
        return { ok: false, error: `Conflit : ce stagiaire est déjà validé sur "${conflict.title}" sur ce créneau.` };
      }
    }
  }

  const { error } = await supabase
    .from('session_trainees')
    .update({ status })
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}


export async function setSessionDayTime(
  sessionId: string,
  day: string,
  startTime: string,
  endTime: string
): Promise<ActionResult> {
  if (!startTime || !endTime) return { ok: false, error: 'Heure de début et de fin requises.' };
  if (endTime <= startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };

  const supabase = await createClient();
  const { error } = await supabase
    .from('session_days')
    .upsert(
      { session_id: sessionId, day, start_time: startTime, end_time: endTime },
      { onConflict: 'session_id,day' }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return { ok: true };
}

export async function resetSessionDayTime(sessionId: string, day: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('session_days').delete().eq('session_id', sessionId).eq('day', day);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return { ok: true };
}

export type CsvImportResult =
  | { ok: true; added: number; updated: number; skipped: number; errors: string[] }
  | { ok: false; error: string };

/**
 * Importe des stagiaires depuis un CSV et les inscrit à cette session.
 * Colonnes attendues (insensibles à la casse) : Nom (requis), Email, Entreprise, Statut.
 * Statut accepte "validé"/"validee" ou "en attente"/"en_attente" (défaut : en attente).
 * Un stagiaire existant est reconnu par e-mail (prioritaire) ou par nom exact ;
 * sinon une nouvelle fiche stagiaire est créée.
 */
export async function importTraineesCsv(sessionId: string, formData: FormData): Promise<CsvImportResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choisis un fichier CSV.' };
  }

  const Papa = (await import('papaparse')).default;
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-détection ; / ,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { ok: false, error: 'Fichier CSV illisible. Vérifie le format (colonnes séparées par , ou ;).' };
  }

  const norm = (s: string) => s.trim().toLowerCase();
  function getField(row: Record<string, string>, ...names: string[]): string {
    for (const key of Object.keys(row)) {
      if (names.includes(norm(key))) return (row[key] || '').trim();
    }
    return '';
  }

  const supabase = await createClient();
  const { data: sessionRow } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const full_name = getField(row, 'nom', 'nom complet', 'name');
    const email = getField(row, 'email', 'e-mail', 'mail') || null;
    const company = getField(row, 'entreprise', 'société', 'company') || null;
    const statutRaw = norm(getField(row, 'statut', 'status'));
    let status: 'validee' | 'en_attente' = statutRaw.startsWith('valid') ? 'validee' : 'en_attente';

    if (!full_name) {
      skipped++;
      errors.push(`Ligne ${i + 2} : nom manquant, ignorée.`);
      continue;
    }

    // Cherche un stagiaire existant (par e-mail, sinon par nom exact).
    let traineeId: string | null = null;
    if (email) {
      const { data } = await supabase.from('trainees').select('id').ilike('email', email).maybeSingle();
      traineeId = data?.id || null;
    }
    if (!traineeId) {
      const { data } = await supabase.from('trainees').select('id').ilike('full_name', full_name).maybeSingle();
      traineeId = data?.id || null;
    }

    if (!traineeId) {
      const { data, error } = await supabase
        .from('trainees')
        .insert({ full_name, email, company })
        .select('id')
        .single();
      if (error || !data) {
        errors.push(`Ligne ${i + 2} (${full_name}) : ${error?.message || 'création impossible'}.`);
        continue;
      }
      traineeId = data.id;
    }

    if (status === 'validee' && sessionRow && traineeId) {
      const conflict = await findTraineeConflict(supabase, traineeId, sessionRow.start_at, sessionRow.end_at, sessionId);
      if (conflict) {
        status = 'en_attente';
        errors.push(`Ligne ${i + 2} (${full_name}) : déjà validé sur "${conflict.title}" sur ce créneau — mis en attente.`);
      }
    }

    const { error: linkError } = await supabase
      .from('session_trainees')
      .upsert({ session_id: sessionId, trainee_id: traineeId, status }, { onConflict: 'session_id,trainee_id' });

    if (linkError) {
      errors.push(`Ligne ${i + 2} (${full_name}) : ${linkError.message}`);
      continue;
    }
    added++;
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, added, updated, skipped, errors };
}

export async function saveDigiformaRef(sessionId: string, digiformaRef: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('sessions')
    .update({ digiforma_ref: digiformaRef.trim() || null })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export type DigiformaImportResult =
  | { ok: true; imported: number; heldBack: number }
  | { ok: false; error: string };

/**
 * Récupère les stagiaires d'une session Digiforma (via son id/référence) et les
 * inscrit directement dans cette session — pas de ressaisie manuelle.
 * Un stagiaire Digiforma est considéré confirmé, donc inscrit en statut "validée".
 */
export async function importFromDigiforma(sessionId: string, digiformaRef: string): Promise<DigiformaImportResult> {
  if (!digiformaRef.trim()) return { ok: false, error: 'Renseigne la référence/l\'id de session Digiforma.' };

  const { digiformaFetchSessionTrainees } = await import('@/lib/digiforma');
  let trainees;
  try {
    trainees = await digiformaFetchSessionTrainees(digiformaRef.trim());
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  if (trainees.length === 0) {
    return { ok: false, error: 'Aucun stagiaire trouvé pour cette référence chez Digiforma.' };
  }

  const supabase = await createClient();
  const { data: sessionRow } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
  let imported = 0;
  let heldBack = 0;

  for (const t of trainees) {
    let traineeId: string | null = null;
    if (t.email) {
      const { data } = await supabase.from('trainees').select('id').ilike('email', t.email).maybeSingle();
      traineeId = data?.id || null;
    }
    if (!traineeId) {
      const { data } = await supabase.from('trainees').select('id').ilike('full_name', t.fullName).maybeSingle();
      traineeId = data?.id || null;
    }
    if (!traineeId) {
      const { data, error } = await supabase
        .from('trainees')
        .insert({ full_name: t.fullName, email: t.email })
        .select('id')
        .single();
      if (error || !data) continue;
      traineeId = data.id;
    }

    let status: 'validee' | 'en_attente' = 'validee';
    if (sessionRow && traineeId) {
      const conflict = await findTraineeConflict(supabase, traineeId, sessionRow.start_at, sessionRow.end_at, sessionId);
      if (conflict) {
        status = 'en_attente';
        heldBack++;
      }
    }

    const { error: linkError } = await supabase
      .from('session_trainees')
      .upsert({ session_id: sessionId, trainee_id: traineeId, status }, { onConflict: 'session_id,trainee_id' });
    if (!linkError) imported++;
  }

  await supabase.from('sessions').update({ digiforma_ref: digiformaRef.trim() }).eq('id', sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, imported, heldBack };
}
