'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createTrainer(formData: FormData) {
  const supabase = await createClient();
  const full_name = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim() || null;
  const specialty = String(formData.get('specialty') || '').trim() || null;
  if (!full_name) return { ok: false, error: 'Le nom est requis.' };
  const { error } = await supabase.from('trainers').insert({ full_name, email, specialty });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/formateurs');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteTrainer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('trainers').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/formateurs');
  revalidatePath('/');
  return { ok: true };
}
