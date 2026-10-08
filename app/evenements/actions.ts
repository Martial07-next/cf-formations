'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { EVENT_KINDS } from '@/lib/events';

type Result = { ok: true } | { ok: false; error: string };

function readEvent(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const allDay = formData.get('all_day') === 'on';
  return {
    kind: get('kind') || 'externe',
    title: get('title').slice(0, 120),
    start_date: get('start_date'),
    end_date: get('end_date') || get('start_date'),
    start_time: allDay ? null : get('start_time') || null,
    end_time: allDay ? null : get('end_time') || null,
    location: get('location') || null,
    participants: get('participants') || null,
    notes: get('notes') || null,
  };
}

function validate(e: ReturnType<typeof readEvent>): string | null {
  if (!EVENT_KINDS.some((k) => k.value === e.kind)) return 'Type inconnu.';
  if (!e.title) return 'Indique un intitulé.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(e.end_date)) return 'Dates invalides.';
  if (e.end_date < e.start_date) return 'La date de fin doit être après la date de début.';
  if (e.start_time && e.end_time && e.end_time <= e.start_time) return "L'heure de fin doit être après l'heure de début.";
  return null;
}

async function saveTrainers(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, formData: FormData) {
  const ids = [...new Set(formData.getAll('trainer_ids').map(String).filter(Boolean))];
  await supabase.from('planning_event_trainers').delete().eq('event_id', eventId);
  if (ids.length) {
    const { error } = await supabase.from('planning_event_trainers').insert(ids.map((trainer_id) => ({ event_id: eventId, trainer_id })));
    if (error) return error.message;
  }
  return null;
}

/** Évènements : purement informatifs, ils ne bloquent jamais une session. */
export async function createEvent(formData: FormData): Promise<Result> {
  const profile = await requireManager();
  if (!profile) return FORBIDDEN;
  const e = readEvent(formData);
  const invalid = validate(e);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { data, error } = await supabase.from('planning_events').insert({ ...e, created_by: profile.id }).select('id').single();
  if (error) return { ok: false, error: error.message };
  const trainerError = await saveTrainers(supabase, data.id, formData);
  revalidatePath('/');
  return trainerError ? { ok: false, error: `Évènement créé, mais formateurs non enregistrés : ${trainerError}` } : { ok: true };
}

export async function updateEvent(id: string, formData: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const e = readEvent(formData);
  const invalid = validate(e);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { error } = await supabase.from('planning_events').update(e).eq('id', id);
  if (error) return { ok: false, error: error.message };
  const trainerError = await saveTrainers(supabase, id, formData);
  revalidatePath('/');
  return trainerError ? { ok: false, error: trainerError } : { ok: true };
}

export async function deleteEvent(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('planning_events').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}
