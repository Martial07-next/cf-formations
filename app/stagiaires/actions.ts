'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createTrainee(formData: FormData) {
  const supabase = await createClient();
  const full_name = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim() || null;
  const company = String(formData.get('company') || '').trim() || null;
  if (!full_name) return { ok: false, error: 'Le nom est requis.' };
  const { error } = await supabase.from('trainees').insert({ full_name, email, company });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  return { ok: true };
}

export async function deleteTrainee(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('trainees').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  return { ok: true };
}
