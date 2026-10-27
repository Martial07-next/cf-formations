/**
 * Moteur de simulation : transforme l'état réel (sessions, horaires, effectifs)
 * en trajectoires d'animation, puis donne la position de chaque agent à une
 * heure donnée. Tout ce qui sort d'ici est une représentation visuelle :
 * véhicules et trajets sont des estimations, jamais des déplacements suivis.
 */
import {
  BAT1_ROOMS,
  BAT2_ZONES,
  BAT1,
  BAT2,
  BUS_STOP,
  LOUNGERS,
  PAUSE_SPOT,
  ROUTES,
  SLOTS,
  SLOT_ORDER,
  roadY,
  type Rect,
  type Slot,
  type V2,
} from './layout';
import { hash, toMin, type BuildingId, type CitySettings, type CityState } from './types';

export type Motion = { car: number; walk: number };
/** Vitesses en mètres par minute de scène. Temps réel : vitesses réalistes. */
export const MOTION_LIVE: Motion = { car: 540, walk: 80 };
/** Exploration et simulation : trajets étirés pour rester visibles en accéléré. */
export const MOTION_SIM: Motion = { car: 13, walk: 4.5 };

const frac = (s: string) => (hash(s) % 1000) / 1000;
const CAR_COLORS = ['#e9e7e1', '#2a2d33', '#8d949c', '#1d3557', '#a4161a', '#c9cdd2', '#3a5a40', '#f1f1ee', '#5e6472', '#c97b2a'];
const SHIRT_COLORS = ['#3a6ea5', '#5a6b7b', '#2f4858', '#8b5e3c', '#6b8f71', '#4a4e69', '#9a8c98', '#c9ada7', '#335c67', '#7f5539'];
const SKINS = ['#f2d3bd', '#e3b48f', '#c98d64', '#9c6644', '#6e4529'];

// ---- Chemins ------------------------------------------------------------
export type Path = { pts: V2[]; acc: number[]; len: number };
export function mkPath(pts: V2[]): Path {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, acc, len: acc[acc.length - 1] || 0 };
}
/** Point et direction à la fraction u (0–1) du chemin. */
export function along(p: Path, u: number): { x: number; z: number; dx: number; dz: number } {
  const d = Math.max(0, Math.min(1, u)) * p.len;
  let i = 1;
  while (i < p.pts.length - 1 && p.acc[i] < d) i++;
  const a = p.pts[i - 1];
  const b = p.pts[i] || a;
  const seg = p.acc[i] - p.acc[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (d - p.acc[i - 1]) / seg));
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: b[0] - a[0], dz: b[1] - a[1] };
}
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// ---- Agents -------------------------------------------------------------
export type CarAgent = {
  id: string;
  site: BuildingId;
  color: string;
  slot: Slot;
  arrive: Path;
  leave: Path;
  /** Recul hors de la place (marche arrière). */
  back: Path;
  t0: number; // début du trajet d'arrivée
  t1: number; // garée
  t2: number; // début du départ (recul)
  t3: number; // fin du recul
  t4: number; // sortie de la scène
  trainer: boolean;
};

export type WalkerAgent = {
  id: string;
  site: BuildingId;
  sessionId: string;
  trainerId?: string;
  color: string;
  skin: string;
  walkIn: Path;
  tIn0: number;
  tIn1: number;
  tOut0: number;
  tOut1: number;
  seat: [number, number];
  /** Pause déjeuner représentée : sortie dans la cour. */
  pause: { t0: number; t1: number; spot: V2; walk: number } | null;
};

export type Plan = {
  cars: CarAgent[];
  walkers: WalkerAgent[];
  /** Véhicules estimés par site (avant plafonnement visuel) et places disponibles. */
  estimate: Record<BuildingId, { cars: number; shown: number; slots: number }>;
};

/** Zone d'une salle dans le bâtiment : plan validé (BAT 1) ou zone indicative (BAT 2). */
export function roomRect(building: BuildingId, num: number | null): { rect: Rect; front: 'w' | 'e' | 'n'; validated: boolean } {
  if (building === 'bat1') {
    const r = BAT1_ROOMS.find((x) => x.number === num);
    if (r) return { rect: r.rect, front: r.number === 2 ? 'e' : 'w', validated: true };
    return { rect: { x: BAT1.x + 2, z: BAT1.z + 2, w: BAT1.w - 4, d: BAT1.d - 4 }, front: 'w', validated: false };
  }
  const z = BAT2_ZONES.find((x) => x.number === num);
  return { rect: z ? z.rect : { x: BAT2.x + 1, z: BAT2.z + 1, w: BAT2.w - 2, d: BAT2.d - 2 }, front: 'n', validated: false };
}

/** Places assises (stagiaires) et position du formateur dans une salle. */
export function seats(building: BuildingId, num: number | null, n: number): { trainer: [number, number]; seats: [number, number][] } {
  const { rect: r, front } = roomRect(building, num);
  const out: [number, number][] = [];
  const m = 1.4;
  if (front === 'n') {
    const cols = Math.max(1, Math.floor((r.w - 2 * m) / 1.7));
    for (let i = 0; i < n; i++) out.push([r.x + m + (i % cols) * 1.7 + 0.6, r.z + 3 + Math.floor(i / cols) * 1.6]);
    return { trainer: [r.x + r.w / 2, r.z + 1.2], seats: out };
  }
  const rows = Math.max(1, Math.floor((r.d - 2 * m) / 1.6));
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / rows);
    const x = front === 'w' ? r.x + 3.2 + col * 1.8 : r.x + r.w - 3.2 - col * 1.8;
    out.push([x, r.z + m + (i % rows) * 1.6 + 0.4]);
  }
  return { trainer: [front === 'w' ? r.x + 1.3 : r.x + r.w - 1.3, r.z + r.d / 2], seats: out };
}

const CAP: Record<CitySettings['quality'], number> = { eleve: 16, standard: 12, economique: 6 };

/**
 * Plan d'animation de la journée. Véhicules : arrondi(stagiaires validés × ratio),
 * plafonné aux places du site ; personnages : densité visuelle plafonnée par session.
 */
export function buildPlan(state: CityState, settings: CitySettings, motion: Motion): Plan {
  const cars: CarAgent[] = [];
  const walkers: WalkerAgent[] = [];
  const estimate: Plan['estimate'] = { bat1: { cars: 0, shown: 0, slots: SLOT_ORDER.bat1.length }, bat2: { cars: 0, shown: 0, slots: SLOT_ORDER.bat2.length } };
  const slotById = new Map(SLOTS.map((s) => [s.id, s]));
  const busy: Record<string, [number, number][]> = {};
  const lastStart: Record<string, number> = {};
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const L0 = toMin(settings.lunchStart);
  const L1 = toMin(settings.lunchEnd);

  const freeSlot = (site: BuildingId, a: number, b: number): Slot | null => {
    for (const id of SLOT_ORDER[site]) {
      const ranges = busy[id] || [];
      if (ranges.every(([x, y]) => b < x - 2 || a > y + 2)) {
        (busy[id] ||= []).push([a, b]);
        return slotById.get(id)!;
      }
    }
    return null;
  };

  const addCar = (key: string, site: BuildingId, parkAt: number, leaveAt: number, trainer: boolean): CarAgent | null => {
    const routeIdx = hash(key) % 2;
    const arriveRoute = ROUTES[site].arrive[routeIdx];
    const probe = mkPath([...arriveRoute, ...SLOTS[0].approach]);
    const drive = probe.len / motion.car;
    const slot = freeSlot(site, parkAt - drive, leaveAt + drive);
    if (!slot) return null;
    const arrive = mkPath([...arriveRoute, ...slot.approach]);
    const back = mkPath([[slot.x, slot.z], slot.backOut]);
    const leave = mkPath([...ROUTES[site].internal(slot.backOut), ...ROUTES[site].leave[(hash(key + 'l') % 2)]]);
    // Espacement sur une même voie : pas deux voitures au même endroit.
    const lane = `${site}${routeIdx}`;
    let t0 = parkAt - arrive.len / motion.car;
    const gap = 14 / motion.car;
    if (lastStart[lane] !== undefined && t0 < lastStart[lane] + gap) t0 = lastStart[lane] + gap;
    lastStart[lane] = t0;
    const t1 = t0 + arrive.len / motion.car;
    const t2 = Math.max(leaveAt, t1 + 1);
    const t3 = t2 + Math.max(back.len / (motion.car * 0.35), 0.05);
    const t4 = t3 + leave.len / motion.car;
    const car: CarAgent = { id: key, site, color: CAR_COLORS[hash(key) % CAR_COLORS.length], slot, arrive, back, leave, t0, t1, t2, t3, t4, trainer };
    cars.push(car);
    return car;
  };

  const sessions = [...state.sessions].filter((s) => s.building && !s.external).sort((a, b) => a.start.localeCompare(b.start));
  for (const s of sessions) {
    const site = s.building as BuildingId;
    const S = toMin(s.start);
    const E = toMin(s.end);
    const room = s.roomId ? roomById.get(s.roomId) : null;
    const shown = Math.min(s.validated, CAP[settings.quality]);
    const lay = seats(site, room?.number ?? null, shown);
    const estCars = Math.round(s.validated * settings.carRatio);
    estimate[site].cars += estCars;
    const pause = E - S > 300 && L1 > L0 && S < L0 && E > L1;

    // Formateur(s) : arrivée avant les stagiaires, départ après.
    s.trainerIds.forEach((tid, k) => {
      const car = addCar(`${s.id}-t${k}`, site, S - 55 + frac(tid) * 10, E + 14, true);
      const walk = mkPath(car ? car.slot.walk : [BUS_STOP[site].spawn, ...BUS_STOP[site].walk]);
      const tIn0 = car ? car.t1 + 0.4 : S - 45;
      const tIn1 = tIn0 + walk.len / motion.walk;
      const tOut1 = car ? car.t2 - 0.3 : E + 20;
      const tOut0 = tOut1 - walk.len / motion.walk;
      walkers.push({
        id: `${s.id}-t${k}`, site, sessionId: s.id, trainerId: tid, color: '#17241b', skin: '#e3b48f',
        walkIn: walk, tIn0, tIn1, tOut0, tOut1, seat: lay.trainer,
        pause: pause ? { t0: L0, t1: L1, spot: [PAUSE_SPOT[site][0] - 2, PAUSE_SPOT[site][1] - 1.5], walk: Math.min(8, 30 / motion.walk) } : null,
      });
    });

    // Stagiaires : une part arrive en voiture (ratio), le reste à pied depuis l'arrêt.
    const viaCar = Math.round(shown * settings.carRatio);
    const extraCars = Math.max(0, estCars - viaCar);
    for (let i = 0; i < shown; i++) {
      const key = `${s.id}-s${i}`;
      const arriveAt = S - 48 + frac(key) * 36;
      const leaveAt = E + 3 + frac(key + 'o') * 18;
      let walk: Path;
      let tIn0: number;
      let tOut1: number;
      const car = i < viaCar ? addCar(key, site, arriveAt, leaveAt, false) : null;
      if (car) {
        walk = mkPath(car.slot.walk);
        tIn0 = car.t1 + 0.3 + frac(key + 'd') * 0.6;
        tOut1 = car.t2 - 0.3;
      } else {
        walk = mkPath([BUS_STOP[site].spawn, ...BUS_STOP[site].walk]);
        tIn0 = arriveAt - walk.len / motion.walk;
        tOut1 = leaveAt + walk.len / motion.walk;
      }
      const dur = walk.len / motion.walk;
      walkers.push({
        id: key, site, sessionId: s.id, color: SHIRT_COLORS[hash(key) % SHIRT_COLORS.length], skin: SKINS[hash(key + 'k') % SKINS.length],
        walkIn: walk, tIn0, tIn1: tIn0 + dur, tOut0: tOut1 - dur, tOut1, seat: lay.seats[i],
        pause: pause ? { t0: L0 + frac(key + 'p') * 6, t1: L1 - frac(key + 'q') * 6, spot: [PAUSE_SPOT[site][0] + (i % 4) * 1.3, PAUSE_SPOT[site][1] + Math.floor(i / 4) * 1.3], walk: Math.min(8, 30 / motion.walk) } : null,
      });
    }
    // Véhicules estimés au-delà des personnages affichés : garés, sans passager montré.
    for (let i = 0; i < extraCars; i++) addCar(`${s.id}-x${i}`, site, S - 45 + frac(`${s.id}x${i}`) * 34, E + 4 + frac(`${s.id}y${i}`) * 18, false);
  }
  for (const site of ['bat1', 'bat2'] as BuildingId[]) estimate[site].shown = cars.filter((c) => c.site === site && !c.trainer).length;
  return { cars, walkers, estimate };
}

// ---- Positions à l'heure T ------------------------------------------------
export type CarPose = { x: number; y: number; z: number; yaw: number; blink: boolean } | null;
const yawOf = (dx: number, dz: number) => Math.atan2(-dz, dx);

export function carAt(c: CarAgent, T: number): CarPose {
  if (T < c.t0 || T > c.t4) return null;
  if (T < c.t1) {
    const u = (T - c.t0) / (c.t1 - c.t0);
    const p = along(c.arrive, u);
    // Clignotant : dernier tiers du trajet (entrée sur le site et manœuvre).
    return { x: p.x, y: roadY(p.x, p.z), z: p.z, yaw: yawOf(p.dx, p.dz), blink: u > 0.78 };
  }
  const end = along(c.arrive, 1);
  const parkedYaw = yawOf(end.dx, end.dz);
  if (T < c.t2) return { x: c.slot.x, y: 0, z: c.slot.z, yaw: parkedYaw, blink: false };
  if (T < c.t3) {
    const p = along(c.back, ease((T - c.t2) / (c.t3 - c.t2)));
    return { x: p.x, y: 0, z: p.z, yaw: parkedYaw, blink: true };
  }
  const p = along(c.leave, (T - c.t3) / (c.t4 - c.t3));
  return { x: p.x, y: roadY(p.x, p.z), z: p.z, yaw: yawOf(p.dx, p.dz), blink: false };
}

export type WalkerPose = { x: number; z: number; yaw: number; walking: boolean; inside: boolean; seated: boolean } | null;

export function walkerAt(w: WalkerAgent, T: number): WalkerPose {
  if (T < w.tIn0 || T > w.tOut1) return null;
  if (T < w.tIn1) {
    const p = along(w.walkIn, (T - w.tIn0) / (w.tIn1 - w.tIn0));
    return { x: p.x, z: p.z, yaw: yawOf(p.dx, p.dz), walking: true, inside: false, seated: false };
  }
  if (T > w.tOut0) {
    const p = along(w.walkIn, 1 - (T - w.tOut0) / (w.tOut1 - w.tOut0));
    return { x: p.x, z: p.z, yaw: yawOf(-p.dx, -p.dz), walking: true, inside: false, seated: false };
  }
  const door = w.walkIn.pts[w.walkIn.pts.length - 1];
  if (w.pause && T > w.pause.t0 && T < w.pause.t1) {
    const k = w.pause.walk;
    const go = (T - w.pause.t0) / k;
    const back = (w.pause.t1 - T) / k;
    const [sx, sz] = w.pause.spot;
    if (go < 1) return { x: door[0] + (sx - door[0]) * go, z: door[1] + (sz - door[1]) * go, yaw: yawOf(sx - door[0], sz - door[1]), walking: true, inside: false, seated: false };
    if (back < 1) return { x: door[0] + (sx - door[0]) * back, z: door[1] + (sz - door[1]) * back, yaw: yawOf(door[0] - sx, door[1] - sz), walking: true, inside: false, seated: false };
    return { x: sx, z: sz, yaw: Math.PI / 2 + (hash(w.id) % 6) - 3, walking: false, inside: false, seated: false };
  }
  return { x: w.seat[0], z: w.seat[1], yaw: 0, walking: false, inside: true, seated: !w.trainerId };
}

/** Salle occupée à l'heure T (avec 15 min de préparation et de rangement). */
export function roomBusyAt(state: CityState, roomId: string, T: number): boolean {
  return state.sessions.some((s) => s.roomId === roomId && T >= toMin(s.start) - 15 && T <= toMin(s.end) + 15);
}

/** Transats du Beach Club pour les formateurs en congé. */
export function beachSpots(n: number): V2[] {
  return LOUNGERS.slice(0, n);
}
