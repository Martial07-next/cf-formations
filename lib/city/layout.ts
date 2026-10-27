/**
 * Plan de la mini-ville (unités ≈ mètres, x vers l'est, z vers le sud).
 *
 * Sources :
 *  · BAT 1 : croquis fourni (salles S1, S2, S3, WC, cuisine, entrée, places P,
 *    bungalow Administration, parkings à l'est et au sud) et vue aérienne
 *    (toit plat foncé, D425 au nord, rond-point au nord-est, rue du Champ de Tir à l'ouest).
 *  · BAT 2 : vue aérienne (toit en deux pans, 12 puits de lumière, parvis au sud),
 *    de l'autre côté de la Rocade Minière (D621), après le pont de la D425.
 * Les dimensions sont proportionnelles au croquis ; hauteurs non connues :
 * un niveau (à confirmer). Rien ici n'est une donnée du planning.
 */

export type V2 = [number, number];
export type Rect = { x: number; z: number; w: number; d: number };

// ---- BAT 1 (20 rue du Champ de Tir) --------------------------------------
export const BAT1: Rect & { h: number } = { x: 20, z: -12.5, w: 36, d: 25, h: 4.2 };
/** Pièces du croquis (plan validé). */
export const BAT1_ROOMS: { key: string; label: string; number?: number; rect: Rect }[] = [
  { key: 'S3', label: 'Salle 3', number: 3, rect: { x: 20, z: -12.5, w: 11.5, d: 14.4 } },
  { key: 'S1', label: 'Salle 1', number: 1, rect: { x: 20, z: 1.9, w: 11.5, d: 10.6 } },
  { key: 'COUL', label: 'Couloir', rect: { x: 31.5, z: -12.5, w: 5.2, d: 25 } },
  { key: 'WC', label: 'WC', rect: { x: 36.7, z: -12.5, w: 9.5, d: 3.3 } },
  { key: 'LOC', label: 'Local', rect: { x: 36.7, z: -9.2, w: 9.5, d: 8.5 } },
  { key: 'CUIS', label: 'Cuisine', rect: { x: 46.2, z: -12.5, w: 9.8, d: 11.8 } },
  { key: 'S2', label: 'Salle 2', number: 2, rect: { x: 36.7, z: -0.7, w: 19.3, d: 13.2 } },
];
export const BAT1_DOOR: V2 = [34.1, 12.5];
/** Bloc au sud-ouest du croquis (non nommé) : usage à préciser. */
export const BAT1_ANNEX: Rect & { h: number } = { x: 19.3, z: 13.4, w: 10.2, d: 16.7, h: 3.4 };
/** Bungalow administratif (croquis). */
export const BUNGALOW: Rect & { h: number } = { x: 30.8, z: 22.2, w: 24.9, d: 7.5, h: 3 };

// ---- BAT 2 (Parc d'Activité de la Haute Rive) ----------------------------
export const BAT2: Rect & { h: number } = { x: -115, z: -20, w: 22, d: 32, h: 5.2 };
export const BAT2_DOOR: V2 = [-104, 12];
/** Sans plan intérieur : zones indicatives des salles 4, 5, 6 (pas de cloisons dessinées). */
export const BAT2_ZONES: { number: number; label: string; rect: Rect }[] = [
  { number: 4, label: 'Salle 4', rect: { x: -114, z: -19, w: 20, d: 9.6 } },
  { number: 5, label: 'Salle 5', rect: { x: -114, z: -9.2, w: 20, d: 10 } },
  { number: 6, label: 'Salle 6', rect: { x: -114, z: 1, w: 20, d: 10 } },
];

// ---- Routes -------------------------------------------------------------
export const D425 = { z: -26.5, w: 9, x0: -240, x1: 170 };
export const ROUNDABOUT = { x: 100, z: -26.5, r: 9 };
export const ROCADE = { x: -33, w: 16, z0: -200, z1: 160 };
export const BRIDGE = { x0: -48, x1: -18, rampW: -70, rampE: 4, h: 6 };
export const CHAMP_DE_TIR = { x: 11, w: 7, z0: -31, z1: 60 };
export const HAUTE_RIVE = { x: -80, w: 6, z0: -31, z1: 31 };

/** Hauteur de la chaussée : la D425 passe en pont au-dessus de la rocade. */
export function roadY(x: number, z: number): number {
  if (z < D425.z - D425.w / 2 - 0.5 || z > D425.z + D425.w / 2 + 0.5) return 0;
  if (x <= BRIDGE.rampW || x >= BRIDGE.rampE) return 0;
  if (x < BRIDGE.x0) return ((x - BRIDGE.rampW) / (BRIDGE.x0 - BRIDGE.rampW)) * BRIDGE.h;
  if (x > BRIDGE.x1) return ((BRIDGE.rampE - x) / (BRIDGE.rampE - BRIDGE.x1)) * BRIDGE.h;
  return BRIDGE.h;
}

/** Enrobé des sites (voies internes et parkings). */
export const ASPHALT: Rect[] = [
  { x: 14.5, z: -19.5, w: 63, d: 6 }, // voie nord BAT 1
  { x: 56.5, z: -19.5, w: 30, d: 52 }, // parking est BAT 1
  { x: 30.5, z: 12.8, w: 26, d: 9.2 }, // cour entre bâtiment et bungalow
  { x: -119.5, z: 13, w: 42.5, d: 18 }, // parvis BAT 2
];

// ---- Parkings -----------------------------------------------------------
export type Slot = {
  id: string;
  site: 'bat1' | 'bat2';
  x: number;
  z: number;
  /** Points depuis la voie interne jusqu'à la place (entrée en marche avant). */
  approach: V2[];
  /** Sortie : recul jusqu'à ce point, puis voie interne. */
  backOut: V2;
  /** Cheminement piéton jusqu'à la porte. */
  walk: V2[];
};

const SITE1_IN: V2[] = [[13.5, -15.5], [64.5, -15.5], [65.75, -13]];
const BAT1_FINAL: V2[] = [[40, 13.4], [34.1, 13.4], [34.1, 12.4]];
const SITE2_IN: V2[] = [[-81, -21], [-81, 20.25], [-83, 21.25]];
const BAT2_FINAL: V2[] = [[-104, 20.9], [-104, 12.4]];

function slots(): Slot[] {
  const out: Slot[] = [];
  // BAT 1, colonne contre le bâtiment (9 places), voiture tête vers l'ouest.
  for (let i = 0; i < 9; i++) {
    const z = -10.8 + i * 2.7;
    out.push({ id: `b1a${i}`, site: 'bat1', x: 60.8, z, approach: [...SITE1_IN, [65.75, z - 2.2], [64.6, z], [60.8, z]], backOut: [65.4, z], walk: [[58.3, z], [57.5, z], [57.5, 16.5], ...BAT1_FINAL] });
  }
  // Colonne en face (9 places), tête vers l'est.
  for (let i = 0; i < 9; i++) {
    const z = -10.8 + i * 2.7;
    out.push({ id: `b1b${i}`, site: 'bat1', x: 73.2, z, approach: [...SITE1_IN, [65.75, z - 2.2], [69, z], [73.2, z]], backOut: [67.8, z], walk: [[70.6, z], [66.75, z], [66.75, 16.5], [57.5, 16.5], ...BAT1_FINAL] });
  }
  // Groupe au sud-est (3 places), tête vers l'est.
  for (let i = 0; i < 3; i++) {
    const z = 14.7 + i * 2.6;
    out.push({ id: `b1c${i}`, site: 'bat1', x: 80.3, z, approach: [...SITE1_IN, [65.75, 12], [67.5, z], [80.3, z]], backOut: [74, z], walk: [[77.4, z], [66.75, 16.5], [57.5, 16.5], ...BAT1_FINAL] });
  }
  // Rangée du bas (5 places), tête vers le sud.
  for (let i = 0; i < 5; i++) {
    const x = 63.3 + i * 2.7;
    out.push({ id: `b1d${i}`, site: 'bat1', x, z: 28, approach: [...SITE1_IN, [65.75, 20], [x, 22.8], [x, 28]], backOut: [x, 22.6], walk: [[x, 25.3], [x, 23], [57.5, 18], ...BAT1_FINAL] });
  }
  // Deux places devant l'entrée (croquis « P P »), tête vers l'ouest.
  for (let i = 0; i < 2; i++) {
    const z = 15.5 + i * 3;
    out.push({ id: `b1e${i}`, site: 'bat1', x: 35, z, approach: [...SITE1_IN, [65.75, 12], [64, 17], [41.5, z], [35, z]], backOut: [41.5, z], walk: [[38.6, 17], ...BAT1_FINAL] });
  }
  // BAT 2, rangée nord (tête vers le nord) avec passage piéton au centre.
  const rowA = [-116.6, -113.9, -111.2, -108.5, -99.5, -96.8, -94.1, -91.4];
  rowA.forEach((x, i) =>
    out.push({ id: `b2a${i}`, site: 'bat2', x, z: 17.6, approach: [...SITE2_IN, [x + 3, 21.25], [x, 19.6], [x, 17.6]], backOut: [x, 22.4], walk: [[x, 20.9], ...BAT2_FINAL] })
  );
  // Rangée sud (tête vers le sud).
  for (let i = 0; i < 8; i++) {
    const x = -116.6 + i * 3.3;
    out.push({ id: `b2b${i}`, site: 'bat2', x, z: 26.6, approach: [...SITE2_IN, [x + 3, 21.25], [x, 23.6], [x, 26.6]], backOut: [x, 21.6], walk: [[x, 23.6], [-104, 23.6], ...BAT2_FINAL] });
  }
  return out;
}
export const SLOTS: Slot[] = slots();
/** Ordre de remplissage : places les plus proches de l'entrée d'abord. */
export const SLOT_ORDER: Record<'bat1' | 'bat2', string[]> = {
  bat1: [...['b1a8', 'b1a7', 'b1a6', 'b1a5', 'b1a4', 'b1a3', 'b1a2', 'b1a1', 'b1a0'], ...Array.from({ length: 5 }, (_, i) => `b1d${i}`), ...Array.from({ length: 9 }, (_, i) => `b1b${8 - i}`), 'b1c0', 'b1c1', 'b1c2'],
  bat2: ['b2a3', 'b2a4', 'b2a2', 'b2a5', 'b2a1', 'b2a6', 'b2a0', 'b2a7', ...Array.from({ length: 8 }, (_, i) => `b2b${i}`)],
};

/** Itinéraires d'arrivée (jusqu'à l'entrée du site) et de départ (depuis la voie interne). */
const ROUND_W2E: V2[] = [[91, -24.5], [97, -17.6], [103, -17.6], [109, -24.5]];
const ROUND_E2W: V2[] = [[109, -28.5], [103, -35.4], [97, -35.4], [91, -28.5]];
export const ROUTES = {
  bat1: {
    arrive: [
      [[-240, -24.5], [8, -24.5], [9.5, -21], [9.5, -17.5]] as V2[],
      [[170, -28.5], ...ROUND_E2W, [13, -28.5], [10, -26], [9.5, -21], [9.5, -17.5]] as V2[],
    ],
    leave: [
      [[67.8, -17.5], [13, -17.5], [12.5, -21], [11, -27], [8, -28.5], [-240, -28.5]] as V2[],
      [[67.8, -17.5], [13, -17.5], [12.5, -21], [14, -24.5], ...ROUND_W2E, [170, -24.5]] as V2[],
    ],
    /** Voie interne au retour (avant la sortie). */
    internal: (back: V2): V2[] => [back, [67.8, Math.min(back[1], 20)], [67.8, -13]],
  },
  bat2: {
    arrive: [
      [[-240, -24.5], [-83, -24.5], [-81, -22]] as V2[],
      [[170, -28.5], ...ROUND_E2W, [-78, -28.5], [-81, -25], [-81, -22]] as V2[],
    ],
    leave: [
      [[-79, -21], [-79, -26], [-82, -28.5], [-240, -28.5]] as V2[],
      [[-79, -21], [-77, -24.5], ...ROUND_W2E, [170, -24.5]] as V2[],
    ],
    internal: (back: V2): V2[] => [back, [-80, 23.25], [-79, 20]],
  },
};

/** Arrêts de bus : stagiaires venus sans voiture (part non motorisée de l'estimation). */
export const BUS_STOP: Record<'bat1' | 'bat2', { spawn: V2; walk: V2[] }> = {
  bat1: { spawn: [16.2, -22], walk: [[16.6, -13.8], [57.5, -13.8], [57.5, 16.5], ...BAT1_FINAL] },
  bat2: { spawn: [-76.2, -21.5], walk: [[-76.4, 20.9], ...BAT2_FINAL] },
};

/** Coin pause (déjeuner) devant chaque bâtiment. */
export const PAUSE_SPOT: Record<'bat1' | 'bat2', V2> = { bat1: [44, 18], bat2: [-104, 18] };

// ---- Beach Club (îlot imaginaire, hors carte réelle) -----------------------
export const BEACH = { x: 18, z: 92, r: 24 };
/** Transats : rangée face à la mer. */
export const LOUNGERS: V2[] = Array.from({ length: 12 }, (_, i) => [BEACH.x - 15 + (i % 6) * 6, BEACH.z + 6 + Math.floor(i / 6) * 7] as V2);

// ---- Décor --------------------------------------------------------------
/** Bâtiments voisins (volumes neutres, sans nom). */
export const NEIGHBOURS: (Rect & { h: number })[] = [
  { x: -170, z: 0, w: 26, d: 18, h: 6 },
  { x: -160, z: 32, w: 18, d: 22, h: 5 },
  { x: -150, z: -70, w: 30, d: 16, h: 7 },
  { x: -125, z: 46, w: 20, d: 14, h: 4.5 },
  { x: 92, z: 6, w: 16, d: 14, h: 4 },
  { x: 96, z: 34, w: 28, d: 20, h: 8 },
  { x: 60, z: -62, w: 24, d: 16, h: 5 },
];
export const TREES: V2[] = [
  // haie et arbres le long de la D425 (BAT 1)
  ...Array.from({ length: 12 }, (_, i) => [18 + i * 6, -22.6] as V2),
  [5, -10], [4, 6], [3, 22], [16, 34], [28, 34], [58, 34], [84, 30], [88, -12], [86, 2],
  // champ et talus de la rocade
  [-12, -12], [-8, 8], [-14, 30], [-52, -10], [-56, 16], [-60, 40], [-20, 50], [0, 48],
  // BAT 2
  [-122, -18], [-122, -4], [-122, 10], [-88, -16], [-88, -2], [-86, 34], [-110, 36], [-96, 36],
];
export const LAMPS: V2[] = [
  [16, -14], [40, -14], [62, -14], [76, -14], [62, 6], [76, 6], [62, 24], [80, 24], [44, 20.6],
  [-84, 14], [-96, 30.5], [-112, 30.5], [-120, 14], [-78, 0],
];

// ---- Caméra -------------------------------------------------------------
export type ViewKey = 'general' | 'bat1' | 'bat2' | 'admin' | 'parking' | 'beach';
export const VIEWS: Record<ViewKey, { label: string; target: [number, number, number]; dist: number }> = {
  general: { label: 'Vue générale', target: [-22, 0, 18], dist: 330 },
  bat1: { label: 'Bâtiment 1', target: [44, 0, 6], dist: 105 },
  bat2: { label: 'Bâtiment 2', target: [-102, 0, 6], dist: 95 },
  admin: { label: 'Administration', target: [43, 0, 26], dist: 48 },
  parking: { label: 'Parking', target: [66, 0, 8], dist: 80 },
  beach: { label: 'Beach Club', target: [BEACH.x, 0, BEACH.z], dist: 70 },
};
/** Direction isométrique de la caméra (depuis le sud-est, en hauteur). */
export const ISO_DIR: [number, number, number] = [0.62, 0.72, 0.78];
