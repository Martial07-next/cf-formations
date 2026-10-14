/** Prêts de vêtements TST : seulement aux stagiaires qui n'ont pas leurs propres EPI. */

export type ClothingLoan = {
  id: string;
  trainee_id: string;
  session_id: string | null;
  vestes: number;
  pantalons: number;
  address: string | null;
  city: string | null;
  signature: string | null;
  signed_at: string | null;
  created_at: string;
  returned_vestes: number | null;
  returned_pantalons: number | null;
  return_signature: string | null;
  returned_at: string | null;
  return_note: string | null;
};

export const LOAN_SELECT =
  'id, trainee_id, session_id, vestes, pantalons, address, city, signature, signed_at, created_at, returned_vestes, returned_pantalons, return_signature, returned_at, return_note';

export type LoanStatus = 'a_signer' | 'prete' | 'incomplet' | 'restitue';

/** Vêtements encore dehors (prêtés − rendus). */
export function missingOf(l: ClothingLoan) {
  if (!l.returned_at) return { vestes: l.vestes, pantalons: l.pantalons };
  return {
    vestes: Math.max(0, l.vestes - (l.returned_vestes ?? 0)),
    pantalons: Math.max(0, l.pantalons - (l.returned_pantalons ?? 0)),
  };
}

export function loanStatus(l: ClothingLoan): LoanStatus {
  if (!l.signed_at) return 'a_signer';
  if (!l.returned_at) return 'prete';
  const m = missingOf(l);
  return m.vestes + m.pantalons > 0 ? 'incomplet' : 'restitue';
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  a_signer: 'Prêt à signer',
  prete: 'Prêtés · à rendre',
  incomplet: 'Rendu incomplet',
  restitue: 'Rendus',
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 1 veste, 2 pantalons » */
export function clothesText(vestes: number, pantalons: number) {
  return [vestes ? plural(vestes, 'veste', 'vestes') : '', pantalons ? plural(pantalons, 'pantalon', 'pantalons') : ''].filter(Boolean).join(', ') || 'rien';
}

/** « Manque : 1 pantalon » (vide si tout est rendu). */
export function missingText(l: ClothingLoan) {
  if (!l.returned_at) return '';
  const m = missingOf(l);
  return m.vestes + m.pantalons > 0 ? `Manque : ${clothesText(m.vestes, m.pantalons)}` : '';
}

export const clampQty = (v: unknown) => Math.max(0, Math.min(20, Math.round(Number(v) || 0)));
