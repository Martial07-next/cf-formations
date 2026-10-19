import { effectiveDayTime, weekdaysBetween, type DayOverride } from '@/lib/week';

/**
 * Créneaux réels d'une session, jour par jour (les nuits et week-ends ne
 * comptent pas) : une salle peut accueillir une session avant ou après une
 * autre le même jour, jamais pendant.
 */
export type DaySlot = { day: string; start: string; end: string };

export function sessionDaySlots(startAt: string, endAt: string, overrides: DayOverride[] = []): DaySlot[] {
  const days = weekdaysBetween(startAt, endAt);
  return (days.length ? days : [startAt.slice(0, 10)]).map((day) => ({ day, ...effectiveDayTime(day, startAt, endAt, overrides) }));
}

/** Premier jour où les deux sessions se chevauchent vraiment (heures comprises), sinon null. */
export function slotsOverlap(a: DaySlot[], b: DaySlot[]): DaySlot | null {
  for (const x of a) {
    const y = b.find((s) => s.day === x.day);
    if (y && x.start < y.end && x.end > y.start) return { day: x.day, start: x.start > y.start ? x.start : y.start, end: x.end < y.end ? x.end : y.end };
  }
  return null;
}
