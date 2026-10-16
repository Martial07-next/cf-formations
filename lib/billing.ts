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
 * Pastille dossier sur le planning (où en est la session) :
 * - a-remplir : (vue formateur) documents qu'il lui reste à remplir ;
 * - attente-formateur : (vue équipe) documents attendus du formateur ;
 * - bureau : documents à compléter par le bureau ;
 * - formateur : (vue formateur) sa partie est remplie ;
 * - en-attente / a-facturer / en-cours : facturation ;
 * - complet : dossier rempli et facturation faite.
 */
export type DossierBadgeKind = 'complet' | 'formateur' | 'a-remplir' | 'attente-formateur' | 'bureau' | 'a-facturer' | 'en-cours' | 'en-attente';
export type DossierBadge = { kind: DossierBadgeKind; n?: number };

const docs = (n = 0) => `${n} document${n > 1 ? 's' : ''}`;

export function dossierBadgeLabel(b: DossierBadge): string {
  switch (b.kind) {
    case 'complet': return 'Dossier complet';
    case 'formateur': return 'Dossier rempli par le formateur';
    case 'a-remplir': return `${docs(b.n)} à remplir`;
    case 'attente-formateur': return `${docs(b.n)} en attente du formateur`;
    case 'bureau': return `${docs(b.n)} à compléter (bureau)`;
    case 'a-facturer': return 'Facturation à faire';
    case 'en-cours': return 'Facturation en cours';
    case 'en-attente': return 'Facturation en attente';
  }
}

/** État de facturation d'une session (non facturée). */
export function billingStep(invoiceCount: number, dossierReady: boolean, ended: boolean): 'a-facturer' | 'en-cours' | 'en-attente' | null {
  if (invoiceCount > 0) return 'en-cours';
  if (dossierReady) return 'a-facturer';
  return ended ? 'en-attente' : null;
}
