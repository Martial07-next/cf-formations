'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createSession(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();

  const title = String(formData.get('title') || '').trim();
  const roomId = String(formData.get('room_id') || '');
  const trainerId = String(formData.get('trainer_id') || '') || null;
  const templateId = String(formData.get('template_id') || '') || null;
  const startAt = String(formData.get('start_at') || '');
  const endAt = String(formData.get('end_at') || '');
  const status = String(formData.get('status') || 'planifiee');

  if (!title || !roomId || !startAt || !endAt) {
    return { ok: false, error: 'Titre, salle, début et fin sont obligatoires.' };
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return { ok: false, error: 'La fin doit être après le début.' };
  }

  // Détection de conflit : même salle, ou même formateur, sur un créneau qui se chevauche.
  const { data: overlaps, error: overlapError } = await supabase
    .from('sessions')
    .select('id, title, room_id, trainer_id')
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  if (overlapError) return { ok: false, error: overlapError.message };

  const roomClash = overlaps?.find((s) => s.room_id === roomId);
  if (roomClash) {
    return { ok: false, error: `Conflit : la salle est déjà réservée pour "${roomClash.title}" sur ce créneau.` };
  }
  if (trainerId) {
    const trainerClash = overlaps?.find((s) => s.trainer_id === trainerId);
    if (trainerClash) {
      return { ok: false, error: `Conflit : ce formateur anime déjà "${trainerClash.title}" sur ce créneau.` };
    }
  }

  const { error } = await supabase.from('sessions').insert({
    title,
    room_id: roomId,
    trainer_id: trainerId,
    template_id: templateId,
    start_at: startAt,
    end_at: endAt,
    status,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/sessions');
  return { ok: true };
}

export async function updateSessionStatus(sessionId: string, status: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ status }).eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/sessions');
  return { ok: true };
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/sessions');
  return { ok: true };
}
