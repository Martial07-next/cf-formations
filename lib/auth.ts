import { getCurrentProfile } from '@/lib/supabase/server';
import { canManage } from '@/lib/roles';

export const FORBIDDEN = { ok: false as const, error: "Action non autorisée pour ton compte." };

/**
 * Garde-fous côté serveur pour les Server Actions. Le RLS Supabase protège
 * déjà les tables, mais certaines actions appellent aussi l'API Digiforma
 * (avec la clé secrète) : on vérifie donc le rôle avant tout appel.
 */
export async function requireManager() {
  const profile = await getCurrentProfile();
  return profile && canManage(profile.role) ? profile : null;
}

export async function requireAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === 'admin' ? profile : null;
}
