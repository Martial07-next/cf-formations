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

/** Bureau administratif : la liste reste modifiable le premier jour de la session (retardataire, absent, client ajouté sur Digiforma…). */
export function firstDayOpen(startAt: string): boolean {
  return parisNowKey().slice(0, 10) <= startAt.slice(0, 10);
}

export const LOCKED_MESSAGE =
  'La session a commencé : la liste des stagiaires est figée (plus d’ajout, de retrait ni de modification). Le bureau peut encore la modifier le premier jour ; ensuite, seul l’administrateur peut la corriger.';

/** Message d'erreur si la liste de cette session est figée pour le compte connecté, sinon null. */
export async function traineesLockError(sessionId: string): Promise<string | null> {
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createClient()]);
  if (profile?.role === 'admin') return null;
  const { data } = await supabase.from('sessions').select('start_at').eq('id', sessionId).maybeSingle();
  if (!data || !sessionStarted(data.start_at)) return null;
  // Bureau : modifications encore possibles le jour même du début.
  if (profile?.role === 'bureau' && firstDayOpen(data.start_at)) return null;
  return LOCKED_MESSAGE;
}
