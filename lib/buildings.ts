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

/** Adresse complète de chaque bâtiment (documents officiels : émargement…). */
export const BUILDING_ADDRESS: Record<string, string> = {
  'BAT 1': 'BÂTIMENT 1 de CF RÉSEAUX · 20 rue du Champ de Tir, 59553 Cuincy',
  'BAT 2': "BÂTIMENT 2 de CF RÉSEAUX · 465 Parc d'Activité de la Haute Rive, 59553 Cuincy",
};

/**
 * Lieu de formation d'une salle : bâtiment d'après la salle (renseigné, sinon
 * déduit du numéro : salles 1 à 3 → BAT 1, salles 4 à 6 → BAT 2).
 */
type PlaceRoom = { name: string; location?: string | null; status?: string | null };
/** Salle d'une formation extérieure (INTRA) : entreprise + adresse saisie (migration 44). */
const external = (room: PlaceRoom | null) => room?.status === 'exterieur';

export function trainingPlace(room: PlaceRoom | null): string | null {
  if (!room) return null;
  if (external(room)) return room.location ? `${room.name} · ${room.location}` : room.name;
  let building = room.location && BUILDING_ADDRESS[room.location] ? room.location : null;
  if (!building) {
    const n = Number(room.name.match(/(\d+)/)?.[1]);
    if (n >= 1 && n <= 3) building = 'BAT 1';
    else if (n >= 4 && n <= 6) building = 'BAT 2';
  }
  return building ? `${room.name} · ${BUILDING_ADDRESS[building]}` : room.name;
}

/** Bâtiment et adresse seuls (sans la salle), ex. pour le « lieu de dispense ». */
export function buildingAddress(room: PlaceRoom | null): string | null {
  if (external(room)) return room!.location ? `${room!.name} · ${room!.location}` : room!.name;
  const place = trainingPlace(room);
  if (!place || !room) return null;
  return place.startsWith(`${room.name} · `) ? place.slice(room.name.length + 3) : null;
}

/** Adresse postale seule du bâtiment (ex. « 20 rue du Champ de Tir, 59553 Cuincy »). */
export function streetAddress(room: PlaceRoom | null): string | null {
  if (external(room)) return room!.location || null;
  const b = buildingAddress(room);
  return b ? b.split(' · ').slice(1).join(' · ') || null : null;
}
