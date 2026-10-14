import type { SupabaseClient } from '@supabase/supabase-js';

/** Organisation interne : qui a fait quoi (comptes de l'équipe, historique). */

export type Staff = { id: string; full_name: string; role: string };

export async function loadStaff(supabase: SupabaseClient): Promise<Staff[]> {
  const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
  return ((data as Staff[]) || []).filter((p) => p.full_name);
}

/** Personnes à qui confier une session ou une relance (bureau, admin, référents). */
export function internalStaff(staff: Staff[]) {
  return staff.filter((p) => ['admin', 'bureau', 'referent'].includes(p.role));
}

/** « Sarah Dupont » → « Sarah D. » (affichage compact du planning). */
export function shortName(full: string | null | undefined): string {
  if (!full) return '';
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  // Comptes saisis « NOM Prénom » : on garde le prénom.
  const [a, b] = parts;
  const first = a === a.toUpperCase() && b !== b.toUpperCase() ? b : a;
  const last = first === a ? b : a;
  return `${first} ${last[0]?.toUpperCase() || ''}.`;
}

export const ACTIVITY_LABEL: Record<string, string> = {
  session_creee: 'a créé la session',
  session_modifiee: 'a modifié',
  gestionnaire: 'gestionnaire →',
  stagiaire_valide: 'a inscrit (validé)',
  stagiaire_attente: 'a mis en attente',
  statut_valide: 'a validé',
  statut_attente: 'a remis en attente',
  stagiaire_retire: 'a retiré',
  relance: 'a relancé',
  suivi_attribue: 'a confié la relance de',
};

const STATUS_WORD: Record<string, string> = { confirmee: 'confirmée', planifiee: 'planifiée', brouillon: 'brouillon' };

export function activityDetail(action: string, detail: string | null) {
  if (!detail) return '';
  if (action === 'session_modifiee') return detail.replace(/statut : (\w+)/, (_, s) => `statut (${STATUS_WORD[s] || s})`);
  return detail;
}

/** « il y a 3 j », « aujourd'hui » */
export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}

export const frShortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }) : '';
