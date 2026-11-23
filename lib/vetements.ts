/** Prêts de vêtements TST et de baudriers : seulement aux stagiaires qui n'ont pas leur propre équipement. */

export type ClothingLoan = {
  id: string;
  trainee_id: string;
  session_id: string | null;
  vestes: number;
  pantalons: number;
  /** Baudriers (migration 74 ; absent avant = 0). */
  baudriers?: number | null;
  address: string | null;
  city: string | null;
  signature: string | null;
  signed_at: string | null;
  created_at: string;
  returned_vestes: number | null;
  returned_pantalons: number | null;
  returned_baudriers?: number | null;
  return_signature: string | null;
  returned_at: string | null;
  return_note: string | null;
};

// Toutes les colonnes : fonctionne avec ou sans la migration 74 (baudriers).
export const LOAN_SELECT = '*';

export type LoanStatus = 'a_signer' | 'prete' | 'incomplet' | 'restitue';

/** Vêtements encore dehors (prêtés − rendus). */
export function missingOf(l: ClothingLoan) {
  const b = l.baudriers || 0;
  if (!l.returned_at) return { vestes: l.vestes, pantalons: l.pantalons, baudriers: b };
  return {
    vestes: Math.max(0, l.vestes - (l.returned_vestes ?? 0)),
    pantalons: Math.max(0, l.pantalons - (l.returned_pantalons ?? 0)),
    baudriers: Math.max(0, b - (l.returned_baudriers ?? 0)),
  };
}

export function loanStatus(l: ClothingLoan): LoanStatus {
  if (!l.signed_at) return 'a_signer';
  if (!l.returned_at) return 'prete';
  const m = missingOf(l);
  return m.vestes + m.pantalons + m.baudriers > 0 ? 'incomplet' : 'restitue';
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  a_signer: 'Prêt à signer',
  prete: 'Prêtés · à rendre',
  incomplet: 'Rendu incomplet',
  restitue: 'Rendus',
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « 1 veste, 2 pantalons, 1 baudrier » */
export function clothesText(vestes: number, pantalons: number, baudriers = 0) {
  return (
    [vestes ? plural(vestes, 'veste', 'vestes') : '', pantalons ? plural(pantalons, 'pantalon', 'pantalons') : '', baudriers ? plural(baudriers, 'baudrier', 'baudriers') : '']
      .filter(Boolean)
      .join(', ') || 'rien'
  );
}
/** Ce qui est prêté par un prêt. */
export const loanText = (l: ClothingLoan) => clothesText(l.vestes, l.pantalons, l.baudriers || 0);

/** « Manque : 1 pantalon » (vide si tout est rendu). */
export function missingText(l: ClothingLoan) {
  if (!l.returned_at) return '';
  const m = missingOf(l);
  return m.vestes + m.pantalons + m.baudriers > 0 ? `Manque : ${clothesText(m.vestes, m.pantalons, m.baudriers)}` : '';
}

export const clampQty = (v: unknown) => Math.max(0, Math.min(20, Math.round(Number(v) || 0)));
