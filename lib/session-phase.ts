/**
 * Avancement d'une session selon la date et l'heure (heure de Paris) :
 * « En cours » à partir de son heure de début (ex. 15 h : pas avant),
 * « Terminée » une fois l'heure de fin passée.
 */
export type SessionPhase = 'en-cours' | 'terminee' | null;

export const PHASE_LABEL: Record<Exclude<SessionPhase, null>, string> = {
  'en-cours': 'En cours',
  terminee: 'Terminée',
};

/** `nowKey` : « 2026-10-19T09:30 », heure de Paris (parisNowKey). */
export function sessionPhase(startAt: string, endAt: string, nowKey: string): SessionPhase {
  if (endAt.slice(0, 16) <= nowKey) return 'terminee';
  if (startAt.slice(0, 16) <= nowKey) return 'en-cours';
  return null;
}
