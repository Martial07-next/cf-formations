/** Certificat de réalisation : nature de l'action choisie par le formateur pour chaque stagiaire. */
export type CertNature = 'formation' | 'bilan' | 'vae' | 'apprentissage';
export const CERT_NATURES: { key: CertNature; label: string }[] = [
  { key: 'formation', label: 'action de formation' },
  { key: 'bilan', label: 'bilan de compétences' },
  { key: 'vae', label: 'action de VAE' },
  { key: 'apprentissage', label: 'action de formation par apprentissage' },
];
/** Correction faite par le formateur (« Erreur constatée ») : remplace les valeurs calculées. */
export type CertFix = { action?: string; startDate?: string; endDate?: string; hours?: number; note?: string; by?: string; at?: string };
export type CertData = { trainees?: Record<string, { nature?: CertNature | null; fix?: CertFix | null }> };

/** Correction valide (texte, dates AAAA-MM-JJ, heures) ou null. */
export function cleanFix(v: any): CertFix | null {
  if (!v || typeof v !== 'object') return null;
  const out: CertFix = {};
  const action = String(v.action || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (action) out.action = action;
  for (const k of ['startDate', 'endDate'] as const) if (/^\d{4}-\d{2}-\d{2}$/.test(String(v[k] || ''))) out[k] = String(v[k]);
  const h = Number(v.hours);
  if (Number.isFinite(h) && h > 0 && h <= 2000) out.hours = Math.round(h * 100) / 100;
  const note = String(v.note || '').trim().slice(0, 300);
  if (note) out.note = note;
  if (v.by) out.by = String(v.by).slice(0, 120);
  if (v.at) out.at = String(v.at).slice(0, 40);
  return Object.keys(out).some((k) => ['action', 'startDate', 'endDate', 'hours'].includes(k)) ? out : null;
}
export const isCertNature = (v: unknown): v is CertNature => CERT_NATURES.some((n) => n.key === v);
/** Nature choisie pour chaque stagiaire : fiche complète. */
export function certDone(data: CertData | null | undefined, traineeIds: string[]) {
  return traineeIds.length > 0 && traineeIds.every((id) => isCertNature(data?.trainees?.[id]?.nature));
}
