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
