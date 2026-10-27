/**
 * CF Réseaux City 3D : état de la ville transmis par le serveur à la scène.
 *
 * Données planning → adaptateur (lib/city/load.ts) → CityState → simulation
 * (lib/city/sim.ts) → scène 3D (components/city). L'état ne contient que des
 * comptes, des prénoms et des statuts : jamais de nom de stagiaire, de
 * coordonnées, de document ni de motif d'absence.
 */

export type BuildingId = 'bat1' | 'bat2';

/** Familles d'équipements représentées dans les salles, déduites des formations possibles. */
export type WorkshopFamily = 'irve' | 'aerien' | 'souterrain' | 'electrique' | 'fibre';

export const FAMILY_LABEL: Record<WorkshopFamily, string> = {
  irve: 'Bornes de recharge (IRVE)',
  aerien: 'Réseau aérien',
  souterrain: 'Réseau souterrain',
  electrique: 'Armoires électriques',
  fibre: 'Fibre optique',
};

export type CityRoom = {
  id: string;
  name: string;
  building: BuildingId | null;
  /** Numéro de salle (1 à 6) : place la salle dans le plan du bâtiment. */
  number: number | null;
  capacity: number;
  available: boolean;
  families: WorkshopFamily[];
  workshops: string[];
};

export type CitySession = {
  id: string;
  title: string;
  roomId: string | null;
  building: BuildingId | null;
  /** Formation extérieure (INTRA) : nom de l'entreprise. */
  external: string | null;
  /** Horaire effectif du jour, « HH:MM » (session_days, sinon horaire de la session). */
  start: string;
  end: string;
  /** Formateur(s) qui animent ce jour-là (remplaçant compris). */
  trainerIds: string[];
  validated: number;
  waiting: number;
  /** Stagiaires émargés ce jour (null : émargement non lisible pour ce compte). */
  presentAm: number | null;
  presentPm: number | null;
  status: 'confirmee' | 'planifiee';
};

export type AvatarLook = {
  skin: string;
  hair: 'court' | 'long' | 'chignon' | 'rase' | 'boucle';
  hairColor: string;
  top: string;
  bottom: string;
  accessory: 'aucun' | 'casque' | 'casquette' | 'lunettes' | 'gilet';
  /** Chemise de vacances au Beach Club. */
  vacation: string;
};

export type TrainerStatus = 'formation' | 'exterieur' | 'conge' | 'indisponible' | 'non_affecte';

export const TRAINER_STATUS_LABEL: Record<TrainerStatus, string> = {
  formation: 'En formation',
  exterieur: 'En formation extérieure',
  conge: 'En congé',
  indisponible: 'Indisponible',
  non_affecte: 'Non affecté',
};

export type CityTrainer = {
  id: string;
  /** Prénom (+ initiale du nom en cas d'homonyme) : rien d'autre n'est transmis. */
  label: string;
  status: TrainerStatus;
  sessionIds: string[];
  look: AvatarLook;
  /** Personnage enregistré par le formateur (sinon personnage par défaut). */
  custom: boolean;
};

export type CityAlert = { id: string; title: string; reasons: string[] };

export type CityLink = { href: string; label: string };

export type CityState = {
  date: string;
  generatedAt: string;
  rooms: CityRoom[];
  sessions: CitySession[];
  trainers: CityTrainer[];
  /** Sessions qui commencent dans les 7 jours suivant la date affichée. */
  upcoming: number;
  alerts: CityAlert[];
  /** Fiche formateur du compte connecté (pour créer son personnage). */
  myTrainerId: string | null;
  /** Liens du bungalow Administration, selon les droits du compte. */
  adminLinks: CityLink[];
  /** Migration 45 non exécutée : personnages par défaut uniquement. */
  avatarsMissing?: boolean;
};

/** Réglages visuels (navigateur) : estimations et confort, jamais des données réelles. */
export type CitySettings = {
  /** Véhicules estimés par stagiaire (covoiturage, transports en commun). */
  carRatio: number;
  /** Pause déjeuner représentée (par défaut celle du calcul des heures du planning : 12h–13h). */
  lunchStart: string;
  lunchEnd: string;
  quality: 'eleve' | 'standard' | 'economique';
  reducedMotion: boolean;
};

export const DEFAULT_SETTINGS: CitySettings = {
  carRatio: 0.7,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  quality: 'standard',
  reducedMotion: false,
};

export const SKINS = ['#f2d3bd', '#e3b48f', '#c98d64', '#9c6644', '#6e4529', '#4a2e1c'];
export const HAIR_COLORS = ['#1f1a17', '#3b2a20', '#6b4a2f', '#a8753e', '#d8b56a', '#8c8c8c', '#e9e4da', '#a3362a'];
export const OUTFIT_COLORS = ['#17241b', '#2f6fb0', '#1f3b63', '#8a1f2b', '#e0a526', '#e8e4da', '#5d6d63', '#3d2f5c', '#0f7a4a', '#c4472f'];
export const VACATION_COLORS = ['#ff7a59', '#08fa64', '#38b6ff', '#ffd23f', '#ff5fa2', '#fffdf3'];
export const HAIR_STYLES: { value: AvatarLook['hair']; label: string }[] = [
  { value: 'court', label: 'Courts' },
  { value: 'long', label: 'Longs' },
  { value: 'chignon', label: 'Chignon' },
  { value: 'boucle', label: 'Bouclés' },
  { value: 'rase', label: 'Rasés' },
];
export const ACCESSORIES: { value: AvatarLook['accessory']; label: string }[] = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'casque', label: 'Casque de chantier' },
  { value: 'gilet', label: 'Gilet haute visibilité' },
  { value: 'casquette', label: 'Casquette' },
  { value: 'lunettes', label: 'Lunettes' },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Personnage valide (valeurs connues uniquement), sinon valeur par défaut. */
export function sanitizeLook(raw: Partial<Record<keyof AvatarLook, unknown>> | null | undefined, fallback: AvatarLook): AvatarLook {
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
  return {
    skin: color(raw?.skin, fallback.skin),
    hair: pick(raw?.hair, HAIR_STYLES.map((h) => h.value), fallback.hair),
    hairColor: color(raw?.hairColor, fallback.hairColor),
    top: color(raw?.top, fallback.top),
    bottom: color(raw?.bottom, fallback.bottom),
    accessory: pick(raw?.accessory, ACCESSORIES.map((a) => a.value), fallback.accessory),
    vacation: color(raw?.vacation, fallback.vacation),
  };
}

/** Petit hachage stable (répartition visuelle déterministe). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Personnage par défaut d'un formateur, à partir de sa couleur du planning. */
export function defaultLook(id: string, color?: string | null): AvatarLook {
  const h = hash(id);
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIR_STYLES[(h >>> 3) % HAIR_STYLES.length].value,
    hairColor: HAIR_COLORS[(h >>> 6) % HAIR_COLORS.length],
    top: color && HEX.test(color) ? color.toLowerCase() : OUTFIT_COLORS[(h >>> 9) % OUTFIT_COLORS.length],
    bottom: '#2b2f36',
    accessory: 'aucun',
    vacation: VACATION_COLORS[(h >>> 12) % VACATION_COLORS.length],
  };
}

/** « 08:30 » → 510 (minutes depuis minuit). */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fmtMin = (min: number) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
};
