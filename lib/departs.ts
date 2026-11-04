/**
 * Attestations de départ anticipé et décharge de responsabilité (migration 56).
 * Remplies par le stagiaire avec le QR code de la session : la date et l'heure
 * de départ sont celles de l'envoi.
 */

export type EarlyDeparture = {
  id: string;
  session_id: string;
  trainee_id: string;
  departed_at: string;
  reason: string;
  details: string | null;
  formation_title: string | null;
  city: string | null;
  signature: string;
};

export const DEPART_SELECT = 'id, session_id, trainee_id, departed_at, reason, details, formation_title, city, signature';

export const DEPART_REASONS = [
  'Formation terminée',
  'Rendez-vous médical',
  'Raison familiale',
  'Demande de l’employeur',
  'Contrainte de transport',
  'Autre',
] as const;

/** Départ anticipé possible : réglage de la formation, sinon automatique (jamais pour l'IRVE). */
export function departureAllowed(setting: boolean | null | undefined, title: string | null | undefined): boolean {
  if (typeof setting === 'boolean') return setting;
  return !/\birve\b/i.test(title || '');
}

/** Motif complet : « Autre » remplacé par la précision donnée. */
export function reasonText(d: Pick<EarlyDeparture, 'reason' | 'details'>): string {
  const details = (d.details || '').trim();
  if (d.reason === 'Autre') return details || 'Autre';
  return details ? `${d.reason} (${details})` : d.reason;
}

/** « 23/10/2026 » et « 14h30 », heure de Paris. */
export function departWhen(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const time = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return { date, time };
}
