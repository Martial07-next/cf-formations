'use server';

import { createClient, type Role } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { ROLE_OPTIONS } from '@/lib/roles';
import { createAccount, ensureTrainerProfile, generatePassword } from '@/lib/accounts';

export async function updateRole(userId: string, role: Role) {
  const admin = await requireAdmin();
  if (!admin) return FORBIDDEN;
  if (!ROLE_OPTIONS.includes(role)) return { ok: false, error: 'Rôle inconnu.' };
  if (userId === admin.id) return { ok: false, error: 'Tu ne peux pas modifier ton propre rôle.' };
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  // Passage en « Formateur » : on crée (ou lie) sa fiche formateur.
  if (role === 'formateur') {
    const service = serviceClient();
    if (service) {
      const [{ data: profile }, { data: authUser }] = await Promise.all([
        service.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
        service.auth.admin.getUserById(userId),
      ]);
      await ensureTrainerProfile(service, userId, profile?.full_name || authUser?.user?.email || 'Formateur', authUser?.user?.email ?? null, true);
    }
  }
  revalidatePath('/administration');
  revalidatePath('/formateurs');
  return { ok: true };
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

  const res = await createAccount(admin, { fullName, email, role, password });
  if (!res.ok) return res;
  const { trainerLinked } = res;

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

/**
 * Modifie un accès : nom prénom, e-mail et, si renseigné, mot de passe
 * (saisi ou généré). Renvoie le mot de passe à transmettre.
 */
export async function updateUserAccess(
  userId: string,
  input: { full_name: string; email: string; password: string; generate: boolean }
): Promise<{ ok: true; password: string | null } | { ok: false; error: string }> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  const admin = serviceClient();
  if (!admin) return { ok: false, error: NO_SERVICE_KEY };
  const fullName = String(input.full_name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!fullName) return { ok: false, error: 'Indique le nom prénom.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' };
  if (input.password && input.password.length < 8) return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' };
  if (userId === me.id && (input.password || input.generate)) return { ok: false, error: 'Change ton propre mot de passe depuis « Mon profil ».' };
  const password = input.password || (input.generate ? generatePassword() : null);
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    ...(password ? { password } : {}),
  });
  if (error) return { ok: false, error: /already|registered|exists/i.test(error.message) ? 'Un autre compte utilise déjà cet e-mail.' : error.message };
  const { error: pErr } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId);
  if (pErr) return { ok: false, error: pErr.message };
  revalidatePath('/administration');
  return { ok: true, password };
}
