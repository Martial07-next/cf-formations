export type Role = 'admin' | 'bureau' | 'referent' | 'formateur' | 'consultation';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  bureau: 'Bureau administratif',
  referent: 'Référent cadre',
  formateur: 'Formateur',
  consultation: 'Consultation',
};

export const ROLE_OPTIONS: Role[] = ['admin', 'bureau', 'referent', 'formateur', 'consultation'];

/**
 * Droits par rôle :
 *  · Administrateur : gère la plateforme (comptes, paramètres, intégrations,
 *    suppression des données) + tout le reste.
 *  · Bureau administratif : gère le contenu (sessions : création, modification,
 *    suppression ; stagiaires et imports ; formateurs ; salles ; formations ; congés).
 *  · Référent cadre : consulte les sessions et peut seulement changer l'heure
 *    de début (jour par jour) ; suit son équipe et gère les congés de ses formateurs.
 *  · Formateur : consulte le planning, peut changer l'heure de début de ses sessions.
 *  · Consultation : lecture seule du planning.
 */
export function canManage(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'bureau';
}

/** Changer l'heure de début d'une session (jour par jour) : + référent cadre. */
export function canEditStartTimes(role: string | undefined | null): boolean {
  return canManage(role) || role === 'referent';
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin';
}
