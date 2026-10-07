export type Role = 'admin' | 'referent' | 'formateur' | 'consultation';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  referent: 'Référent cadre',
  formateur: 'Formateur',
  consultation: 'Consultation',
};

export const ROLE_OPTIONS: Role[] = ['admin', 'referent', 'formateur', 'consultation'];

/**
 * Un admin (bureau administratif) ou un référent cadre peut créer/modifier/
 * supprimer le contenu (sessions, formateurs, salles, formations, stagiaires).
 * Un formateur ou un compte consultation reste en lecture seule.
 * La gestion des comptes utilisateurs (Administration) reste réservée à 'admin'.
 */
export function canManage(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'referent';
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin';
}
