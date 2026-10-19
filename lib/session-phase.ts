/**
 * Avancement d'une session selon la date : « En cours » dès le jour où elle
 * commence, « Terminée » une fois l'heure de fin passée (heure de Paris).
 */
export type SessionPhase = 'en-cours' | 'terminee' | null;

export const PHASE_LABEL: Record<Exclude<SessionPhase, null>, string> = {
  'en-cours': 'En cours',
  terminee: 'Terminée',
};

/** `nowKey` : « 2026-10-19T09:30 », heure de Paris (parisNowKey). */
export function sessionPhase(startAt: string, endAt: string, nowKey: string): SessionPhase {
  if (endAt.slice(0, 16) <= nowKey) return 'terminee';
  if (startAt.slice(0, 10) <= nowKey.slice(0, 10)) return 'en-cours';
  return null;
}
