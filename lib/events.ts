export type EventKind = 'externe' | 'repas' | 'examen' | 'recrutement' | 'forum' | 'autre';

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

export const EVENT_KIND: Record<string, (typeof EVENT_KINDS)[number]> = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k]));

export function eventOnDay(e: { start_date: string; end_date: string }, day: string) {
  return e.start_date <= day && e.end_date >= day;
}

export function eventTimeLabel(e: { start_time: string | null; end_time: string | null }) {
  if (!e.start_time) return 'Journée';
  const f = (t: string) => t.slice(0, 5).replace(':', 'h');
  return e.end_time ? `${f(e.start_time)}–${f(e.end_time)}` : `dès ${f(e.start_time)}`;
}
