'use server';

import { createClient, type Role } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { ROLE_OPTIONS } from '@/lib/roles';

export async function updateRole(userId: string, role: Role) {
  const admin = await requireAdmin();
  if (!admin) return FORBIDDEN;
  if (!ROLE_OPTIONS.includes(role)) return { ok: false, error: 'Rôle inconnu.' };
  if (userId === admin.id) return { ok: false, error: 'Tu ne peux pas modifier ton propre rôle.' };
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/administration');
  return { ok: true };
}
