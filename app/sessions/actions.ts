'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { parseSessionForm, findSessionConflict, roomBusyDays } from '@/lib/session-form';
import type { Busy } from '@/lib/session-slots';
import { isSessionStatus } from '@/lib/status';
import { placeModules } from '@/lib/modules';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath('/');
  revalidatePath('/sessions');
}

export async function createSession(formData: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();

  // Formation du catalogue : formateurs habilités et modules.
  let templateModules: { name: string; duration_hours: number }[] = [];
  if (parsed.value.template_id) {
    const [{ data: qualified }, { data: mods }] = await Promise.all([
      supabase.from('template_trainers').select('trainer_id').eq('template_id', parsed.value.template_id),
      supabase.from('template_modules').select('name, duration_hours, position').eq('template_id', parsed.value.template_id).order('position'),
    ]);
    const ids = (qualified || []).map((q: any) => q.trainer_id);
    if (parsed.value.trainer_id && ids.length && !ids.includes(parsed.value.trainer_id)) {
      return { ok: false, error: "Ce formateur n'est pas habilité pour cette formation." };
    }
    templateModules = (mods || []).map((m: any) => ({ name: m.name, duration_hours: Number(m.duration_hours) }));
  }

  // Dernier jour partiel calculé automatiquement (ex. 17 h 30 → 3e jour 09:00–12:30).
  const lastDayEnd = String(formData.get('last_day_end') || '');
  const startDate = parsed.value.start_at.slice(0, 10);
  const endDate = parsed.value.end_at.slice(0, 10);
  const startTime = parsed.value.start_at.slice(11, 16);
  const lastDay = /^\d{2}:\d{2}$/.test(lastDayEnd) && endDate > startDate && lastDayEnd > startTime
    ? { day: endDate, start_time: startTime, end_time: lastDayEnd }
    : null;

  const conflict = await findSessionConflict(supabase, parsed.value, undefined, lastDay ? [lastDay] : []);
  if (conflict) return { ok: false, error: conflict };

  // Formation ajoutée depuis un parcours POEC (migration 23).
  const poecId = String(formData.get('poec_id') || '') || null;
  const { data, error } = await supabase
    .from('sessions')
    .insert((poecId ? { ...parsed.value, poec_id: poecId } : parsed.value) as Record<string, unknown>)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  if (lastDay) {
    await supabase.from('session_days').upsert({ session_id: data.id, ...lastDay }, { onConflict: 'session_id,day' });
  }

  // Modules (ex. MA1 lundi, MA2 mardi, MA3 mercredi), placés sur les jours de la session.
  if (templateModules.length) {
    const endDay = parsed.value.end_at.slice(0, 10);
    const placed = placeModules(startDate, parsed.value.start_at.slice(11, 16), templateModules).map((m) => ({
      ...m,
      session_id: data.id,
      start_day: m.start_day > endDay ? endDay : m.start_day,
      end_day: m.end_day > endDay ? endDay : m.end_day,
    }));
    await supabase.from('session_modules').insert(placed);
  }

  // Parcours POEC : le groupe (toujours les mêmes stagiaires) est inscrit d'office.
  if (poecId) {
    const { data: members } = await supabase.from('poec_trainees').select('trainee_id').eq('program_id', poecId);
    const rows = ((members as any[]) || []).map((m) => ({ session_id: data.id, trainee_id: m.trainee_id, status: 'validee' }));
    if (rows.length) await supabase.from('session_trainees').upsert(rows, { onConflict: 'session_id,trainee_id' });
    refresh();
    revalidatePath(`/poec/${poecId}`);
    redirect(`/poec/${poecId}?ajout=${data.id}`);
  }

  refresh();
  // Ouverture directe de la fiche de la nouvelle session (ajout des stagiaires).
  // Redirection côté serveur : fiable, contrairement à une navigation lancée
  // côté client juste après l'action.
  redirect(`/sessions/${data.id}?nouvelle=1`);
}

export async function updateSessionStatus(sessionId: string, status: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!isSessionStatus(status)) return { ok: false, error: 'Statut inconnu.' };
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ status }).eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  refresh();
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export async function deleteSession(sessionId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Disponibilité d'une salle sur les jours choisis (formulaire de session). */
export async function roomAvailability(roomId: string, days: string[], excludeId?: string): Promise<Record<string, Busy[]>> {
  if (!(await requireManager())) return {};
  const valid = (days || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60);
  if (!/^[0-9a-f-]{36}$/.test(roomId) || !valid.length) return {};
  const supabase = await createClient();
  return roomBusyDays(supabase, roomId, valid, excludeId && /^[0-9a-f-]{36}$/.test(excludeId) ? excludeId : undefined);
}
