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

export type Busy = { start: string; end: string; title: string };

/** Créneaux libres d'une journée (par défaut 7 h – 20 h), entre les occupations. */
export function freeWindows(busy: { start: string; end: string }[], from = '07:00', to = '20:00'): { start: string; end: string }[] {
  const sorted = [...busy].sort((a, b) => a.start.localeCompare(b.start));
  const out: { start: string; end: string }[] = [];
  let cur = from;
  for (const b of sorted) {
    if (b.start > cur) out.push({ start: cur, end: b.start < to ? b.start : to });
    if (b.end > cur) cur = b.end;
    if (cur >= to) break;
  }
  if (cur < to) out.push({ start: cur, end: to });
  return out.filter((w) => w.start < w.end);
}

export const hm = (t: string) => t.slice(0, 5).replace(':', 'h');
export const windowsText = (w: { start: string; end: string }[]) =>
  w.length ? w.map((x) => `${hm(x.start)}–${hm(x.end)}`).join(', ') : 'aucun créneau libre';
