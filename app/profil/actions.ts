'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateOwnName(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non connecté.' };

  const full_name = String(formData.get('full_name') || '').trim();
  if (!full_name) return { ok: false, error: 'Le nom ne peut pas être vide.' };

  const { error } = await supabase.from('profiles').update({ full_name }).eq('id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/profil');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function updateOwnPassword(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: 'Non connecté.' };

  const currentPassword = String(formData.get('current_password') || '');
  const newPassword = String(formData.get('new_password') || '');
  const confirmPassword = String(formData.get('confirm_password') || '');

  if (!currentPassword || !newPassword) {
    return { ok: false, error: 'Renseigne ton mot de passe actuel et le nouveau.' };
  }
  if (newPassword.length < 6) {
    return { ok: false, error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'La confirmation ne correspond pas au nouveau mot de passe.' };
  }

  // On revérifie le mot de passe actuel avant d'autoriser le changement.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { ok: false, error: 'Mot de passe actuel incorrect.' };

  const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Première connexion avec le mot de passe temporaire donné par
 * l'administrateur : nouveau mot de passe choisi tout de suite, puis accès
 * direct à la plateforme (sans redemander le mot de passe actuel).
 */
export async function setFirstPassword(password: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expirée : reconnecte-toi.' };
  if (!user.user_metadata?.must_change_password) return { ok: true };
  if (password.length < 8) return { ok: false, error: '8 caractères minimum.' };
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return { ok: false, error: 'Mets au moins une lettre et un chiffre.' };
  if (password !== confirm) return { ok: false, error: 'Les deux mots de passe ne correspondent pas.' };
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) {
    return { ok: false, error: /different|same/i.test(error.message) ? 'Choisis un mot de passe différent du mot de passe temporaire.' : error.message };
  }
  return { ok: true };
}
