/** Titres d'habilitation des stagiaires (migration 46) : constantes partagées. */

export type TitleFile = {
  id: string;
  trainee_id: string;
  file_name: string;
  mime: string;
  size: number;
  source: 'stagiaire' | 'formateur' | 'bureau';
  created_at: string;
};

/** Formats acceptés → extension enregistrée. */
export const TITLE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
};
export const TITLE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
export const TITLE_MAX_BYTES = 10 * 1024 * 1024;
/** Recto, verso… : quelques fichiers par stagiaire et par session. */
export const TITLE_MAX_FILES = 4;

export const TITLE_SOURCE_LABEL: Record<TitleFile['source'], string> = {
  stagiaire: 'déposé par le stagiaire',
  formateur: 'scanné par le formateur',
  bureau: 'ajouté par le bureau',
};

/**
 * Titre d'habilitation fourni : case cochée dans le tour de table, ou fichier
 * déposé. Sans tour de table (désactivé pour la formation) ou avec « titre non
 * exigé pour cette session », rien n'est bloqué.
 */
export function titleOk(
  traineeId: string,
  tdt: { data: { titles?: Record<string, boolean>; noTitle?: boolean } | null } | null,
  files: Pick<TitleFile, 'trainee_id'>[]
): boolean {
  if (!tdt || tdt.data?.noTitle) return true;
  return Boolean(tdt.data?.titles?.[traineeId]) || files.some((f) => f.trainee_id === traineeId);
}

/** Taille lisible (« 1,2 Mo »). */
export function fileSize(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
