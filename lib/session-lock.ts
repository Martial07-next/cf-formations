import { createClient, getCurrentProfile } from '@/lib/supabase/server';

/**
 * Liste des stagiaires figée dès l'heure de début de la session : plus
 * d'ajout, de retrait ni de modification des inscriptions (sauf
 * correction par l'administrateur).
 */

export { parisToday, parisNowKey } from '@/lib/paris-time';
import { parisNowKey } from '@/lib/paris-time';

/** Commencée : l'heure de début (heure affichée au planning) est passée. */
export function sessionStarted(startAt: string): boolean {
  return startAt.slice(0, 16) <= parisNowKey();
}

export const LOCKED_MESSAGE =
  'La session a commencé : la liste des stagiaires est figée (plus d’ajout, de retrait ni de modification). Seul l’administrateur peut la corriger.';

/** Message d'erreur si la liste de cette session est figée pour le compte connecté, sinon null. */
export async function traineesLockError(sessionId: string): Promise<string | null> {
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createClient()]);
  if (profile?.role === 'admin') return null;
  const { data } = await supabase.from('sessions').select('start_at').eq('id', sessionId).maybeSingle();
  return data && sessionStarted(data.start_at) ? LOCKED_MESSAGE : null;
}
