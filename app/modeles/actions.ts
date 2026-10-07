'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';

function readTemplate(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const maxRaw = get('max_trainees');
  return {
    title: get('title'),
    category: get('category') || null, // « dossier » de la formation
    duration_hours: Number(get('duration_hours').replace(',', '.') || 0),
    max_trainees: maxRaw ? Number(maxRaw) : null,
    description: get('description') || null,
  };
}

function refresh() {
  revalidatePath('/modeles');
  revalidatePath('/');
}

export async function createTemplate(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et nombre d’heures (> 0) requis.' };
  const supabase = await createClient();
  const { error } = await supabase.from('templates').insert(t);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function updateTemplate(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et nombre d’heures (> 0) requis.' };
  const supabase = await createClient();
  const { error } = await supabase.from('templates').update(t).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
