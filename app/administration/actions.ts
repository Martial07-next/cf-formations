'use server';

import { randomBytes } from 'node:crypto';
import { createClient, type Role } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { ROLE_OPTIONS } from '@/lib/roles';
import { nextTrainerColor } from '@/lib/colors';

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

/** Mot de passe provisoire lisible (sans caractères ambigus). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function serviceClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

const NO_SERVICE_KEY =
  "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée sur le serveur (Vercel) : impossible de gérer les accès depuis l'interface.";

export type CreateAccessResult =
  | { ok: true; email: string; password: string; trainerLinked: boolean }
  | { ok: false; error: string };

/**
 * Crée un accès à la plateforme (compte Supabase Auth) avec son rôle.
 * Pour un formateur ou un référent, la fiche formateur portant le même e-mail
 * est liée au compte ; pour un formateur sans fiche, elle est créée.
 */
export async function createUserAccess(formData: FormData): Promise<CreateAccessResult> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const admin = serviceClient();
  if (!admin) return { ok: false, error: NO_SERVICE_KEY };

  const fullName = String(formData.get('full_name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '') as Role;
  const typedPassword = String(formData.get('password') || '');

  if (!fullName) return { ok: false, error: 'Indique le nom complet.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' };
  if (!ROLE_OPTIONS.includes(role)) return { ok: false, error: "Choisis le type d'accès." };
  if (typedPassword && typedPassword.length < 8) {
    return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères (ou laisse vide pour en générer un).' };
  }
  const password = typedPassword || generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    const msg = error?.message || 'Création impossible.';
    return { ok: false, error: /already|registered|exists/i.test(msg) ? 'Un compte existe déjà avec cet e-mail.' : msg };
  }
  const userId = data.user.id;

  // Le trigger handle_new_user crée le profil (rôle « formateur ») : on applique le rôle choisi.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, full_name: fullName, role }, { onConflict: 'id' });
  if (profileError) return { ok: false, error: `Compte créé, mais rôle non appliqué : ${profileError.message}` };

  let trainerLinked = false;
  if (role === 'formateur' || role === 'referent') {
    const { data: existing } = await admin
      .from('trainers')
      .select('id, profile_id')
      .ilike('email', email.replace(/[\\%_]/g, (c) => '\\' + c))
      .limit(1)
      .maybeSingle();
    if (existing && !existing.profile_id) {
      const { error: linkError } = await admin.from('trainers').update({ profile_id: userId }).eq('id', existing.id);
      trainerLinked = !linkError;
    } else if (!existing && role === 'formateur') {
      const { data: used } = await admin.from('trainers').select('color');
      const { error: insertError } = await admin.from('trainers').insert({
        full_name: fullName,
        email,
        status: 'actif',
        profile_id: userId,
        color: nextTrainerColor((used || []).map((r: any) => r.color)),
      });
      trainerLinked = !insertError;
    }
  }

  revalidatePath('/administration');
  revalidatePath('/formateurs');
  return { ok: true, email, password, trainerLinked };
}

export async function resetUserPassword(userId: string): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  if (userId === me.id) return { ok: false, error: 'Change ton propre mot de passe depuis « Mon profil ».' };
  const admin = serviceClient();
  if (!admin) return { ok: false, error: NO_SERVICE_KEY };
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, password };
}

export async function deleteUserAccess(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  if (userId === me.id) return { ok: false, error: 'Tu ne peux pas supprimer ton propre accès.' };
  const admin = serviceClient();
  if (!admin) return { ok: false, error: NO_SERVICE_KEY };
  // Supprime le compte ; le profil suit (on delete cascade) et la fiche
  // formateur éventuelle est conservée, simplement déliée.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/administration');
  revalidatePath('/formateurs');
  return { ok: true };
}
