/** Certificat de réalisation : nature de l'action choisie par le formateur pour chaque stagiaire. */
export type CertNature = 'formation' | 'bilan' | 'vae' | 'apprentissage';
export const CERT_NATURES: { key: CertNature; label: string }[] = [
  { key: 'formation', label: 'action de formation' },
  { key: 'bilan', label: 'bilan de compétences' },
  { key: 'vae', label: 'action de VAE' },
  { key: 'apprentissage', label: 'action de formation par apprentissage' },
];
export type CertData = { trainees?: Record<string, { nature?: CertNature | null }> };
export const isCertNature = (v: unknown): v is CertNature => CERT_NATURES.some((n) => n.key === v);
/** Nature choisie pour chaque stagiaire : fiche complète. */
export function certDone(data: CertData | null | undefined, traineeIds: string[]) {
  return traineeIds.length > 0 && traineeIds.every((id) => isCertNature(data?.trainees?.[id]?.nature));
}
