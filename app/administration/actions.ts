'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateRole(userId: string, role: 'admin' | 'formateur') {
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/administration');
  return { ok: true };
}
