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
