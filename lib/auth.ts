import { getCurrentProfile } from '@/lib/supabase/server';
import { canManage, canEditSessions } from '@/lib/roles';

export const FORBIDDEN = { ok: false as const, error: "Action non autorisée pour ton compte." };

/**
 * Garde-fous côté serveur pour les Server Actions (le RLS Supabase protège
 * aussi les tables). Voir lib/roles.ts pour les droits de chaque rôle.
 */
/** Administrateur ou bureau administratif. */
export async function requireManager() {
  const profile = await getCurrentProfile();
  return profile && canManage(profile.role) ? profile : null;
}

/** Modification de sessions existantes : + référent cadre. */
export async function requireSessionEditor() {
  const profile = await getCurrentProfile();
  return profile && canEditSessions(profile.role) ? profile : null;
}

/** Administrateur uniquement (comptes, paramètres, intégrations, données). */
export async function requireAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' ? profile : null;
}
