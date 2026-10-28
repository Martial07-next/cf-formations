'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { createAccount, generatePassword } from '@/lib/accounts';
import { ROLE_OPTIONS, type Role } from '@/lib/roles';
import { normalizeEmail, verifyTurnstile } from '@/lib/turnstile';

type Result = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: FormDataEntryValue | null, max: number) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const back = (vue: string, params: Record<string, string>) => {
  const q = new URLSearchParams({ ...(vue ? { vue } : {}), ...params });
  redirect(`/login?${q.toString()}`);
};

async function clientIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

function service() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** Trop de demandes récentes (protection contre l'envoi massif). */
async function flooded(admin: ReturnType<typeof createAdminClient>) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('access_requests').select('id', { count: 'exact', head: true }).gte('created_at', since);
  return (count ?? 0) > 40;
}

/** Page de connexion : demande d'accès envoyée à l'administrateur. */
export async function requestAccess(formData: FormData) {
  if (clean(formData.get('website'), 100)) back('', { message: 'Demande envoyée.' }); // piège à robots
  if (!(await verifyTurnstile(formData, await clientIp()))) back('demande', { error: 'Vérification anti-robot non validée : réessaie.' });
  const fullName = clean(formData.get('full_name'), 120);
  const email = normalizeEmail(clean(formData.get('email'), 200));
  const role = clean(formData.get('role_wanted'), 30);
  const message = clean(formData.get('message'), 600);
  if (!fullName) back('demande', { error: 'Indique ton nom et ton prénom.' });
  if (!EMAIL.test(email)) back('demande', { error: 'Adresse e-mail invalide.' });
  const admin = service();
  if (!admin || (await flooded(admin))) back('demande', { error: 'Service momentanément indisponible, réessaie plus tard.' });
  const { error } = await admin!.from('access_requests').insert({
    kind: 'acces',
    full_name: fullName,
    email,
    role_wanted: ['formateur', 'referent', 'bureau', 'consultation'].includes(role) ? role : null,
    message: message || null,
  });
  if (error && error.code !== '23505') back('demande', { error: 'Envoi impossible (migration 38 à exécuter ?). Réessaie plus tard.' });
  back('', { message: 'Demande envoyée à l’administrateur. Tu recevras tes identifiants une fois ta demande acceptée.' });
}

/**
 * Mot de passe oublié : e-mail de réinitialisation (Supabase) et, en
 * parallèle, demande visible par l'administrateur (il peut donner un nouveau
 * mot de passe si l'e-mail n'arrive pas). Réponse identique dans tous les cas.
 */
export async function forgotPassword(formData: FormData) {
  if (!(await verifyTurnstile(formData, await clientIp()))) back('oubli', { error: 'Vérification anti-robot non validée : réessaie.' });
  const email = normalizeEmail(clean(formData.get('email'), 200));
  if (!EMAIL.test(email)) back('oubli', { error: 'Adresse e-mail invalide.' });
  const h = await headers();
  const origin = h.get('origin') || `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/mot-de-passe` }).catch(() => null);
  const admin = service();
  if (admin && !(await flooded(admin))) {
    await admin.from('access_requests').insert({ kind: 'mot_de_passe', email });
  }
  back('', {
    message: 'Si un compte existe pour cette adresse, un e-mail pour choisir un nouveau mot de passe vient d’être envoyé. L’administrateur est aussi prévenu.',
  });
}

/** Après le lien reçu par e-mail : choix du nouveau mot de passe. */
export async function setNewPassword(formData: FormData) {
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  if (password.length < 8) redirect('/mot-de-passe?error=' + encodeURIComponent('8 caractères minimum.'));
  if (password !== confirm) redirect('/mot-de-passe?error=' + encodeURIComponent('Les deux mots de passe ne correspondent pas.'));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) redirect('/mot-de-passe?error=' + encodeURIComponent('Lien expiré : refais une demande de mot de passe oublié.'));
  revalidatePath('/', 'layout');
  redirect('/');
}

// ------------------------------------------------------------------
// Administrateur
// ------------------------------------------------------------------

export type DecisionResult = { ok: true; email?: string; password?: string; trainerLinked?: boolean } | { ok: false; error: string };

async function load(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('access_requests').select('*').eq('id', id).maybeSingle();
  return { supabase, req: data as any };
}

async function close(supabase: Awaited<ReturnType<typeof createClient>>, id: string, me: string, status: string, note: string | null) {
  await supabase
    .from('access_requests')
    .update({ status, decision_note: note, decided_by: me, decided_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/administration');
  revalidatePath('/', 'layout');
}

/** Accepte une demande d'accès : crée le compte avec le rôle choisi, renvoie le mot de passe à transmettre. */
export async function acceptAccessRequest(id: string, role: Role): Promise<DecisionResult> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  if (!ROLE_OPTIONS.includes(role) || role === 'aucun') return { ok: false, error: "Choisis le type d'accès." };
  const admin = service();
  if (!admin) return { ok: false, error: 'Clé service Supabase absente sur le serveur.' };
  const { supabase, req } = await load(id);
  if (!req || req.kind !== 'acces' || req.status !== 'en_attente') return { ok: false, error: 'Demande introuvable ou déjà traitée.' };
  const password = generatePassword();
  const res = await createAccount(admin, { fullName: req.full_name || req.email, email: req.email, role, password });
  if (!res.ok) return res;
  await close(supabase, id, me.id, 'acceptee', null);
  revalidatePath('/formateurs');
  return { ok: true, email: req.email, password, trainerLinked: res.trainerLinked };
}

export async function refuseAccessRequest(id: string, note: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  const { supabase, req } = await load(id);
  if (!req || req.status !== 'en_attente') return { ok: false, error: 'Demande introuvable ou déjà traitée.' };
  await close(supabase, id, me.id, 'refusee', note.trim().slice(0, 300) || null);
  return { ok: true };
}

/** Mot de passe oublié : nouveau mot de passe provisoire pour le compte de cet e-mail. */
export async function resolvePasswordRequest(id: string): Promise<DecisionResult> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  const admin = service();
  if (!admin) return { ok: false, error: 'Clé service Supabase absente sur le serveur.' };
  const { supabase, req } = await load(id);
  if (!req || req.kind !== 'mot_de_passe' || req.status !== 'en_attente') return { ok: false, error: 'Demande introuvable ou déjà traitée.' };
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((u) => (u.email || '').toLowerCase() === req.email.toLowerCase());
  if (!user) {
    await close(supabase, id, me.id, 'refusee', 'Aucun compte avec cet e-mail.');
    return { ok: false, error: 'Aucun compte avec cet e-mail : demande classée.' };
  }
  if (user.id === me.id) return { ok: false, error: 'Change ton propre mot de passe depuis « Mon profil ».' };
  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password, user_metadata: { must_change_password: true } });
  if (error) return { ok: false, error: error.message };
  await close(supabase, id, me.id, 'traitee', null);
  return { ok: true, email: req.email, password };
}

/** Demande sans suite (ex. mot de passe retrouvé) : classée. */
export async function dismissRequest(id: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return FORBIDDEN;
  const { supabase } = await load(id);
  await close(supabase, id, me.id, 'traitee', 'Classée sans suite.');
  return { ok: true };
}
