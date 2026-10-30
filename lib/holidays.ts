/**
 * Jours fériés (même calcul que la plateforme CF Congés : dates fixes + jours
 * mobiles d'après Pâques).
 *
 * Un férié en semaine n'est PAS un jour de formation, sauf si la direction a
 * répondu « Oui, travaillé » dans CF Congés (synchronisé dans worked_holidays).
 * Les sessions qui tombent sur un férié non travaillé sont décalées d'un jour
 * ouvré (lib/holiday-shifts.ts). Appliqué à partir de HOLIDAYS_FROM : les
 * sessions passées ne changent pas.
 */

export const HOLIDAYS_FROM = '2026-10-30';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const cache = new Map<number, Map<string, string>>();
/** Fériés légaux d'une année : « AAAA-MM-JJ » → libellé. */
export function holidaysOf(year: number): Map<string, string> {
  let map = cache.get(year);
  if (!map) {
    const p = easter(year);
    map = new Map([
      [iso(utc(year, 0, 1)), 'Jour de l’an'],
      [iso(plus(p, 1)), 'Lundi de Pâques'],
      [iso(utc(year, 4, 1)), 'Fête du Travail'],
      [iso(utc(year, 4, 8)), 'Victoire 1945'],
      [iso(plus(p, 39)), 'Ascension'],
      [iso(plus(p, 50)), 'Lundi de Pentecôte'],
      [iso(utc(year, 6, 14)), 'Fête nationale'],
      [iso(utc(year, 7, 15)), 'Assomption'],
      [iso(utc(year, 10, 1)), 'Toussaint'],
      [iso(utc(year, 10, 11)), 'Armistice'],
      [iso(utc(year, 11, 25)), 'Noël'],
    ]);
    cache.set(year, map);
  }
  return map;
}

// Fériés travaillés (décision « Oui » de la direction dans CF Congés).
let worked = new Set<string>();
/** Fériés travaillés connus (serveur : chargés avec le profil ; navigateur : par la mise en page). */
export function setWorkedHolidays(days: string[]) {
  worked = new Set(days);
}
export function workedHolidays(): string[] {
  return [...worked];
}

/** Férié d'une date (à partir de HOLIDAYS_FROM), travaillé ou non. */
export function holidayOn(day: string): { label: string; worked: boolean } | null {
  if (day < HOLIDAYS_FROM) return null;
  const label = holidaysOf(Number(day.slice(0, 4))).get(day);
  return label ? { label, worked: worked.has(day) } : null;
}

/** Férié non travaillé : pas de formation ce jour-là. */
export function isClosedHoliday(day: string): boolean {
  const h = holidayOn(day);
  return Boolean(h && !h.worked);
}

const weekend = (day: string) => {
  const w = new Date(day + 'T00:00:00Z').getUTCDay();
  return w === 0 || w === 6;
};
/** Jour de formation possible : en semaine et pas un férié non travaillé. */
export function isWorkingDay(day: string): boolean {
  return !weekend(day) && !isClosedHoliday(day);
}
/** Jour ouvré suivant / précédent (« AAAA-MM-JJ »). */
export function nextWorkingDay(day: string): string {
  let d = new Date(day + 'T00:00:00Z');
  do d = plus(d, 1);
  while (!isWorkingDay(iso(d)));
  return iso(d);
}
export function previousWorkingDay(day: string): string {
  let d = new Date(day + 'T00:00:00Z');
  do d = plus(d, -1);
  while (!isWorkingDay(iso(d)));
  return iso(d);
}
