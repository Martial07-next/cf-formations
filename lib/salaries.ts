/** Documents des salariés : droit à l'image et remise de matériel. */

export type EmployeeDocKind = 'image' | 'materiel';

/** Matériel du modèle « Attestation de remise de matériel » (fixe = « 1 » imprimé, sinon quantité). */
export const MATERIAL_ITEMS = [
  { key: 'ordinateur', label: 'Ordinateur', fixed: true },
  { key: 'clavier', label: 'Clavier', fixed: true },
  { key: 'souris', label: 'Souris', fixed: true },
  { key: 'ecran', label: 'Écran', fixed: false },
  { key: 'chaussures', label: 'Paire(s) de chaussures de sécurité', fixed: false },
  { key: 'casque', label: 'Casque', fixed: false },
  { key: 'manteau', label: 'Manteau / Gilet', fixed: false },
  { key: 'telephone', label: 'Téléphone portable', fixed: true },
] as const;

export type MaterialKey = (typeof MATERIAL_ITEMS)[number]['key'];
export type MaterialData = Partial<Record<MaterialKey, number>> & { address?: string };

export type Employee = {
  id: string;
  full_name: string;
  email: string | null;
  job: string | null;
  address: string | null;
  profile_id: string | null;
  token: string;
  active: boolean;
};

export type EmployeeDoc = {
  id: string;
  employee_id: string;
  kind: EmployeeDocKind;
  data: MaterialData;
  accepted: boolean;
  signature: string | null;
  city: string | null;
  signed_at: string | null;
  returned_at: string | null;
  return_signature: string | null;
  created_at: string;
};

export const EMPLOYEE_SELECT = 'id, full_name, email, job, address, profile_id, token, active';
export const EMPLOYEE_DOC_SELECT = 'id, employee_id, kind, data, accepted, signature, city, signed_at, returned_at, return_signature, created_at';

export const DOC_LABEL: Record<EmployeeDocKind, string> = { image: 'Droit à l’image', materiel: 'Remise de matériel' };

/** « 1 ordinateur, 2 casques… » */
export function materialSummary(d: MaterialData): string {
  return MATERIAL_ITEMS.filter((i) => (d[i.key] || 0) > 0)
    .map((i) => `${d[i.key]} ${i.label.toLowerCase()}`)
    .join(', ');
}

export function cleanMaterial(raw: any): MaterialData {
  const out: MaterialData = {};
  for (const i of MATERIAL_ITEMS) {
    const n = Math.max(0, Math.min(i.fixed ? 1 : 20, Math.round(Number(raw?.[i.key]) || 0)));
    if (n) out[i.key] = n;
  }
  return out;
}

export function validEmployeeToken(t: string) {
  return /^[A-Za-z0-9_-]{24,64}$/.test(t);
}
