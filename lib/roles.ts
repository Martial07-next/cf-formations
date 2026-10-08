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
 *  · Référent cadre : modifie les sessions existantes (pas de création ni de
 *    suppression, pas de gestion des stagiaires), suit son équipe et gère les
 *    congés de ses formateurs.
 *  · Formateur : consulte le planning, ajuste les horaires de ses sessions.
 *  · Consultation : lecture seule du planning.
 */
export function canManage(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'bureau';
}

/** Modifier une session existante (dates, salle, formateur, statut, horaires). */
export function canEditSessions(role: string | undefined | null): boolean {
  return canManage(role) || role === 'referent';
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin';
}
