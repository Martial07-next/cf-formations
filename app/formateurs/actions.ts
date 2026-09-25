'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createTrainer(formData: FormData) {
  const supabase = await createClient();
  const full_name = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim() || null;
  const phone = String(formData.get('phone') || '').trim() || null;
  const specialty = String(formData.get('specialty') || '').trim() || null;
  const availability = String(formData.get('availability') || '').trim() || null;
  const status = String(formData.get('status') || 'actif');
  if (!full_name) return { ok: false, error: 'Le nom est requis.' };
  const { error } = await supabase
    .from('trainers')
    .insert({ full_name, email, phone, specialty, availability, status });
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

export async function updateTrainerStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('trainers').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/formateurs');
  return { ok: true };
}
