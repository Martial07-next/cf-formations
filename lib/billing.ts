/** Facturation des sessions (accès « Facturation » coché sur le compte). */

export type Invoice = {
  id: string;
  session_id: string;
  label: string;
  company: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
};

export const INVOICE_SELECT = 'id, session_id, label, company, amount, note, created_at';

export type BillingState = {
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
};

export const euros = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** « ENEDIS ×3 · SPIE ×1 » à partir des entreprises des stagiaires validés. */
export function companiesSummary(companies: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const c of companies) {
    const k = (c || '').trim() || 'Sans entreprise';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ company: k, count: n }));
}

/**
 * Pastille dossier sur le planning :
 * - complet : dossier rempli et facturation faite ;
 * - formateur : (vue formateur) tour de table / appréciation remplis ;
 * - a-facturer : il ne reste que la facturation ;
 * - en-cours : facture nommée, pas encore cochée « faite » ;
 * - en-attente : session terminée, dossier formateur pas encore rempli.
 */
export type DossierBadge = 'complet' | 'formateur' | 'a-facturer' | 'en-cours' | 'en-attente';

export const DOSSIER_BADGE_LABEL: Record<DossierBadge, string> = {
  complet: 'Dossier complet',
  formateur: 'Dossier rempli par le formateur',
  'a-facturer': 'Facturation à faire',
  'en-cours': 'Facturation en cours',
  'en-attente': 'Facturation en attente',
};

/** État de facturation d'une session (non facturée). */
export function billingStep(invoiceCount: number, dossierReady: boolean, ended: boolean): Exclude<DossierBadge, 'complet' | 'formateur'> | null {
  if (invoiceCount > 0) return 'en-cours';
  if (dossierReady) return 'a-facturer';
  return ended ? 'en-attente' : null;
}
