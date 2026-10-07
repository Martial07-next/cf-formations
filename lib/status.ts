/**
 * Statuts d'une session. La valeur stockée "planifiee" est affichée
 * "En attente" (session enregistrée, pas encore confirmée).
 */
export type SessionStatus = 'confirmee' | 'planifiee' | 'brouillon';

export const SESSION_STATUSES: { value: SessionStatus; label: string }[] = [
  { value: 'confirmee', label: 'Confirmée' },
  { value: 'planifiee', label: 'En attente' },
  { value: 'brouillon', label: 'Brouillon' },
];

export const SESSION_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  SESSION_STATUSES.map((s) => [s.value, s.label])
);

export function isSessionStatus(v: string): v is SessionStatus {
  return SESSION_STATUSES.some((s) => s.value === v);
}
