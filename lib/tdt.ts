/** Colonnes et données du tour de table (module léger, sans génération PDF). */
export const TDT_COLUMNS = [
  { key: 'company', label: 'Société', width: 78 },
  { key: 'formations', label: 'Formations', width: 92, placeholder: 'Formations déjà suivies' },
  { key: 'poste', label: 'Poste occupé', width: 80 },
  { key: 'habilitations', label: 'Habilitations', width: 84 },
  { key: 'epi', label: 'EPI', width: 70, placeholder: 'EPI apportés / manquants' },
  { key: 'attentes', label: 'Attentes', width: 133 },
  { key: 'incidents', label: 'Incidents', width: 133 },
] as const;
export type TdtKey = (typeof TDT_COLUMNS)[number]['key'];
export type TdtRow = Partial<Record<TdtKey, string>>;
export type TdtData = { rows?: Record<string, TdtRow>; general?: string };
