import { randomBytes } from 'node:crypto';
import type { createAdminClient } from '@/lib/supabase/admin';
import { nextTrainerColor } from '@/lib/colors';
import type { Role } from '@/lib/roles';

/** Création des comptes (administration, demandes d'accès). Serveur uniquement. */

type ServiceClient = ReturnType<typeof createAdminClient>;

/**
 * Fiche formateur d'un compte : déjà liée → rien à faire ; une fiche porte le
 * même e-mail → on la lie ; sinon (si `create`) on crée la fiche, avec sa couleur.
 */
export async function ensureTrainerProfile(admin: ServiceClient, userId: string, fullName: string, email: string | null, create: boolean) {
  const { data: linked } = await admin.from('trainers').select('id').eq('profile_id', userId).maybeSingle();
  if (linked) return true;
  if (email) {
    const { data: existing } = await admin
      .from('trainers')
      .select('id, profile_id')
      .ilike('email', email.replace(/[\\%_]/g, (c) => '\\' + c))
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.profile_id) return false; // fiche déjà liée à un autre compte
      const { error } = await admin.from('trainers').update({ profile_id: userId }).eq('id', existing.id);
      return !error;
    }
  }
  if (!create) return false;
  const { data: used } = await admin.from('trainers').select('color');
  const { error } = await admin.from('trainers').insert({
    full_name: fullName,
    email,
    status: 'actif',
    profile_id: userId,
    color: nextTrainerColor((used || []).map((r: any) => r.color)),
  });
  return !error;
}

/** Mot de passe provisoire lisible (sans caractères ambigus). */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}


/** Crée un compte avec son rôle (et la fiche formateur liée pour un formateur / référent). */
export async function createAccount(
  admin: ServiceClient,
  input: { fullName: string; email: string; role: Role; password: string }
): Promise<{ ok: true; userId: string; trainerLinked: boolean } | { ok: false; error: string }> {
  const { fullName, email, role, password } = input;
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
  // Le trigger handle_new_user crée le profil (sans accès) : on applique le rôle choisi.
  const { error: profileError } = await admin.from('profiles').upsert({ id: userId, full_name: fullName, role }, { onConflict: 'id' });
  if (profileError) return { ok: false, error: `Compte créé, mais rôle non appliqué : ${profileError.message}` };
  const trainerLinked =
    role === 'formateur' || role === 'referent' ? await ensureTrainerProfile(admin, userId, fullName, email, role === 'formateur') : false;
  return { ok: true, userId, trainerLinked };
}
