'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();
  const title = String(formData.get('title') || '').trim();
  const reference = String(formData.get('reference') || '').trim() || null;
  const category = String(formData.get('category') || '').trim() || null;
  const duration_hours = Number(formData.get('duration_hours') || 0);
  const max_trainees_raw = String(formData.get('max_trainees') || '');
  const max_trainees = max_trainees_raw ? Number(max_trainees_raw) : null;
  const description = String(formData.get('description') || '').trim() || null;
  if (!title || duration_hours <= 0) return { ok: false, error: 'Titre et durée (> 0) requis.' };
  const { error } = await supabase
    .from('templates')
    .insert({ title, reference, category, duration_hours, max_trainees, description });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/modeles');
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/modeles');
  return { ok: true };
}
