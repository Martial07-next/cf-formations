export type Role = 'admin' | 'responsable_formation' | 'formateur' | 'consultation';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  responsable_formation: 'Responsable formation',
  formateur: 'Formateur',
  consultation: 'Consultation',
};

/**
 * Un admin ou un responsable formation peut créer/modifier/supprimer le
 * contenu (salles, formateurs, formations, sessions, stagiaires). Un simple
 * formateur ou un compte consultation reste en lecture seule.
 * La gestion des comptes utilisateurs (Administration) reste réservée à 'admin' seul.
 */
export function canManage(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'responsable_formation';
}
