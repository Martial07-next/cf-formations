'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type ActionResult = { ok: true } | { ok: false; error: string };

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
