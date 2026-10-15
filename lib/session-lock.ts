import { createClient, getCurrentProfile } from '@/lib/supabase/server';

/**
 * Liste des stagiaires figée dès l'heure de début de la session : plus
 * d'ajout, de retrait ni de modification des inscriptions (sauf
 * correction par l'administrateur).
 */

/** « 2026-10-15 » à Paris. */
export function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/** « 2026-10-15T09:30 » (heure de Paris), format des horaires de session. */
export function parisNowKey(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

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
