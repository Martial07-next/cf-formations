export type EventKind = 'externe' | 'repas' | 'examen' | 'recrutement' | 'forum' | 'autre' | 'stage';

export type PlanningEvent = {
  id: string;
  kind: EventKind;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  participants: string | null;
  notes: string | null;
  trainer_ids: string[];
  /** Salariés concernés (migration 40). */
  employees?: { id: string; name: string }[];
  /** Évènement calculé (ex. stage d'un parcours POEC) : ouvert via ce lien, non modifiable ici. */
  href?: string;
};

/** Types d'évènements : libellé et couleur (l'icône est choisie dans components/planning-events.tsx). */
export const EVENT_KINDS: { value: EventKind; label: string; color: string }[] = [
  { value: 'externe', label: 'Évènement extérieur', color: '#0e7490' },
  { value: 'repas', label: 'Repas de groupe', color: '#b45309' },
  { value: 'examen', label: 'Passage CACES / SST', color: '#7c3aed' },
  { value: 'recrutement', label: 'Session de recrutement', color: '#be185d' },
  { value: 'forum', label: 'Forum', color: '#15803d' },
  { value: 'autre', label: 'Autre', color: '#475569' },
];

export const EVENT_KIND: Record<string, { value: EventKind; label: string; color: string }> = {
  ...Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k])),
  // Stages en entreprise des parcours POEC (non saisissables comme évènement).
  stage: { value: 'stage', label: 'Stage POEC en entreprise', color: '#0f766e' },
};

export function eventOnDay(e: { start_date: string; end_date: string }, day: string) {
  return e.start_date <= day && e.end_date >= day;
}

export function eventTimeLabel(e: { start_time: string | null; end_time: string | null }) {
  if (!e.start_time) return 'Journée';
  const f = (t: string) => t.slice(0, 5).replace(':', 'h');
  return e.end_time ? `${f(e.start_time)}–${f(e.end_time)}` : `dès ${f(e.start_time)}`;
}

const roomKeyOf = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Salle CF Réseaux occupée par un évènement : son « Lieu » est le nom d'une salle
 * de la plateforme (pas « À affecter », pas une formation en entreprise).
 * Une adresse ou un lieu extérieur : aucune salle (l'évènement reste à côté du jour).
 */
export function eventRoomId(location: string | null | undefined, rooms: { id: string; name: string; is_holding?: boolean | null; status?: string | null }[]): string | null {
  const k = roomKeyOf(location || '');
  if (!k) return null;
  const cf = rooms.filter((r) => !r.is_holding && r.status !== 'exterieur');
  const exact = cf.filter((r) => roomKeyOf(r.name) === k);
  if (exact.length === 1) return exact[0].id;
  // « Salle 2 » pour « Salle 2 · Cuincy » (ou l'inverse), seulement si une seule salle correspond.
  const near = cf.filter((r) => {
    const n = roomKeyOf(r.name);
    return n.startsWith(k + ' ') || k.startsWith(n + ' ');
  });
  return near.length === 1 ? near[0].id : null;
}

/** Créneau d'un évènement un jour donné (journée entière : toute la journée). */
export function eventSlot(e: { start_time: string | null; end_time: string | null }): { start: string; end: string } {
  const start = e.start_time ? e.start_time.slice(0, 5) : '00:00';
  const end = e.end_time ? e.end_time.slice(0, 5) : e.start_time ? '23:59' : '23:59';
  return { start, end };
}
