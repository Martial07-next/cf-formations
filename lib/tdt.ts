/** Colonnes et données du tour de table (module léger, sans génération PDF). */
export const TDT_COLUMNS = [
  { key: 'company', label: 'Société', width: 78 },
  { key: 'formations', label: 'Formations', width: 92, placeholder: 'Formations déjà suivies' },
  { key: 'poste', label: 'Poste occupé', width: 80 },
  { key: 'habilitations', label: 'Habilitations', width: 84 },
  { key: 'epi', label: 'EPI', width: 70, placeholder: 'EPI apportés / manquants' },
  { key: 'attentes', label: 'Attentes', width: 113 },
  { key: 'incidents', label: 'Incidents', width: 113 },
] as const;
export type TdtKey = (typeof TDT_COLUMNS)[number]['key'];
export type TdtRow = Partial<Record<TdtKey, string>>;
/** Colonne du PDF pour le titre d'habilitation (case du tour de table ou fichier déposé). */
export const TDT_TITLE_COL = { key: 'titre', label: 'Titre hab.', width: 40 };
export type TdtData = {
  rows?: Record<string, TdtRow>;
  general?: string;
  /** Titre d'habilitation fourni, par stagiaire (migration 46). */
  titles?: Record<string, boolean>;
  /** Titre non exigé pour cette session (ex. habilitation initiale) : décidé par le bureau. */
  noTitle?: boolean;
};
