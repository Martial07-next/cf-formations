/** Les deux adresses du centre : BAT 1 (salles 1, 2, 3) et BAT 2 (salles 4, 5, 6). */
export const BUILDINGS = ['BAT 1', 'BAT 2'] as const;

/** Tri des salles : par bâtiment, puis par nom (ordre naturel : Salle 2 avant Salle 10). */
export function compareRooms(
  a: { name: string; location?: string | null },
  b: { name: string; location?: string | null }
): number {
  const la = a.location || '~';
  const lb = b.location || '~';
  if (la !== lb) return la.localeCompare(lb, 'fr');
  return a.name.localeCompare(b.name, 'fr', { numeric: true });
}
