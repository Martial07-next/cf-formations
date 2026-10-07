'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { parseSessionForm, findSessionConflict } from '@/lib/session-form';
import { isSessionStatus } from '@/lib/status';

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
  const conflict = await findSessionConflict(supabase, parsed.value);
  if (conflict) return { ok: false, error: conflict };

  const { data, error } = await supabase.from('sessions').insert(parsed.value).select('id').single();
  if (error) return { ok: false, error: error.message };

  // Dernier jour partiel calculé automatiquement (ex. 17 h 30 → 3e jour 09:00–12:30).
  const lastDayEnd = String(formData.get('last_day_end') || '');
  const startDate = parsed.value.start_at.slice(0, 10);
  const endDate = parsed.value.end_at.slice(0, 10);
  if (/^\d{2}:\d{2}$/.test(lastDayEnd) && endDate > startDate) {
    const startTime = parsed.value.start_at.slice(11, 16);
    if (lastDayEnd > startTime) {
      await supabase
        .from('session_days')
        .upsert({ session_id: data.id, day: endDate, start_time: startTime, end_time: lastDayEnd }, { onConflict: 'session_id,day' });
    }
  }

  refresh();
  return { ok: true, id: data.id };
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
