'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createRoom(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get('name') || '').trim();
  const capacity = Number(formData.get('capacity') || 0);
  if (!name || capacity <= 0) return { ok: false, error: 'Nom et capacité (> 0) requis.' };
  const { error } = await supabase.from('rooms').insert({ name, capacity });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteRoom(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  revalidatePath('/');
  return { ok: true };
}
