/** Palette de couleurs formateurs : contrastées entre elles et lisibles sur fond blanc. */
export const TRAINER_PALETTE = [
  '#2563eb', '#db2777', '#ea580c', '#7c3aed', '#0d9488', '#ca8a04',
  '#dc2626', '#0891b2', '#65a30d', '#9333ea', '#c2410c', '#4f46e5',
];

export const DEFAULT_TRAINER_COLOR = '#64748b';

/** Première couleur de la palette non utilisée (ou la moins utilisée). */
export function nextTrainerColor(used: (string | null)[]): string {
  const counts = new Map(TRAINER_PALETTE.map((c) => [c, 0]));
  for (const c of used) if (c && counts.has(c.toLowerCase())) counts.set(c.toLowerCase(), counts.get(c.toLowerCase())! + 1);
  let best = TRAINER_PALETTE[0];
  for (const c of TRAINER_PALETTE) if (counts.get(c)! < counts.get(best)!) best = c;
  return best;
}

export function isHexColor(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v);
}
