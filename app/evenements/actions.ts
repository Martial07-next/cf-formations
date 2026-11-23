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
    // Évènement d'un parcours (migration 49) : seulement si le formulaire le propose.
    ...(formData.has('poec_id') && /^[0-9a-f-]{36}$/i.test(get('poec_id')) ? { poec_id: get('poec_id') } : {}),
  };
}

/** Parcours concerné : sa page « Semaine par semaine » est mise à jour. */
function refreshProgram(e: { poec_id?: string }) {
  if (e.poec_id) revalidatePath(`/poec/${e.poec_id}`);
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

/** Salariés concernés (migration 40) : nom copié pour l'affichage du planning. */
async function saveEmployees(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string, formData: FormData) {
  if (!formData.has('employees_present')) return null;
  const ids = [...new Set(formData.getAll('employee_ids').map(String).filter(Boolean))];
  const { error: delError } = await supabase.from('planning_event_employees').delete().eq('event_id', eventId);
  if (delError) return ids.length ? 'Exécute d’abord la migration 40 (supabase/migration_phase40.sql) dans Supabase.' : null;
  if (!ids.length) return null;
  const { data: choices } = await supabase.rpc('event_employee_choices');
  const rows = ((choices as { id: string; full_name: string }[]) || [])
    .filter((c) => ids.includes(c.id))
    .map((c) => ({ event_id: eventId, employee_id: c.id, employee_name: c.full_name }));
  if (!rows.length) return null;
  const { error } = await supabase.from('planning_event_employees').insert(rows);
  return error ? error.message : null;
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
  if (error) return { ok: false, error: /poec_id/.test(error.message) ? 'Exécute d’abord la migration 49 (supabase/migration_phase49.sql) dans Supabase.' : error.message };
  refreshProgram(e);
  const trainerError = await saveTrainers(supabase, data.id, formData);
  const employeeError = await saveEmployees(supabase, data.id, formData);
  revalidatePath('/');
  if (trainerError) return { ok: false, error: `Évènement créé, mais formateurs non enregistrés : ${trainerError}` };
  return employeeError ? { ok: false, error: `Évènement créé, mais salariés non enregistrés : ${employeeError}` } : { ok: true };
}

export async function updateEvent(id: string, formData: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const e = readEvent(formData);
  const invalid = validate(e);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { error } = await supabase.from('planning_events').update(e).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refreshProgram(e);
  const trainerError = await saveTrainers(supabase, id, formData);
  const employeeError = await saveEmployees(supabase, id, formData);
  revalidatePath('/');
  return trainerError || employeeError ? { ok: false, error: (trainerError || employeeError)! } : { ok: true };
}

export async function deleteEvent(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: before } = await supabase.from('planning_events').select('poec_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('planning_events').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refreshProgram({ poec_id: (before as any)?.poec_id || undefined });
  revalidatePath('/');
  return { ok: true };
}

/**
 * Entreprises connues (formation INTRA) : chargées seulement à l'ouverture de
 * la fenêtre INTRA, et non plus à chaque affichage du planning.
 */
export async function intraCompanies(): Promise<{ name: string; trainees: number }[]> {
  if (!(await requireManager())) return [];
  const { companyKey } = await import('@/lib/company');
  const supabase = await createClient();
  const byKey = new Map<string, { name: string; n: number }>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('trainees').select('company').not('company', 'is', null).range(from, from + 999);
    if (error || !data) break;
    for (const r of data as any[]) {
      const name = String(r.company || '').trim();
      const k = companyKey(name);
      if (!k) continue;
      const cur = byKey.get(k);
      if (cur) cur.n++;
      else byKey.set(k, { name, n: 1 });
    }
    if (data.length < 1000) break;
  }
  return [...byKey.values()].sort((a, b) => b.n - a.n).map((c) => ({ name: c.name, trainees: c.n }));
}
