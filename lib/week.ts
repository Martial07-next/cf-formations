const DAY_MS = 24 * 60 * 60 * 1000;

/** Renvoie le lundi (00:00 UTC) de la semaine contenant `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.'];
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function weekDayLabels(monday: Date): string[] {
  return DAY_LABELS.map((label, i) => {
    const d = addDays(monday, i);
    return `${label} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 4)}.`;
  });
}

const FULL_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

/** Lignes de la grille semaine : un objet par jour ouvré (lundi→vendredi). */
export function weekDayRows(monday: Date): { iso: string; full: string; short: string; dateLabel: string }[] {
  return FULL_DAY_NAMES.map((full, i) => {
    const d = addDays(monday, i);
    return {
      iso: isoDate(d),
      full,
      short: DAY_LABELS[i],
      dateLabel: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 4)}.`,
    };
  });
}

export function fullDateLabel(date: Date): string {
  const dayName = FULL_DAY_NAMES[(date.getUTCDay() + 6) % 7] ?? '';
  return `${dayName} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function weekRangeLabel(monday: Date): string {
  const friday = addDays(monday, 4);
  const sameMonth = monday.getUTCMonth() === friday.getUTCMonth();
  const start = `${monday.getUTCDate()}${sameMonth ? '' : ' ' + MONTHS[monday.getUTCMonth()]}`;
  const end = `${friday.getUTCDate()} ${MONTHS[friday.getUTCMonth()]} ${friday.getUTCFullYear()}`;
  return `${start} – ${end}`;
}

/** Premier jour (00:00 UTC) du mois contenant `date`. */
export function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Dernier jour (00:00 UTC) du mois contenant `date`. */
export function lastOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function monthLabel(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Grille de semaines (lundi→vendredi) couvrant tout le mois de `date`,
 * y compris les jours des semaines à cheval sur le mois précédent/suivant.
 * Renvoie un tableau de semaines, chaque semaine étant un tableau de 5 dates.
 */
export function monthWeekGrid(date: Date): Date[][] {
  const start = mondayOf(firstOfMonth(date));
  const lastDay = lastOfMonth(date);
  const end = addDays(mondayOf(lastDay), 4); // vendredi de la dernière semaine
  const weeks: Date[][] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const week: Date[] = [];
    for (let i = 0; i < 5; i++) week.push(addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function isSameMonth(date: Date, reference: Date): boolean {
  return date.getUTCFullYear() === reference.getUTCFullYear() && date.getUTCMonth() === reference.getUTCMonth();
}

export function isSameDate(a: Date, b: Date): boolean {
  return isoDate(a) === isoDate(b);
}

/** Date (jour) au format court : "29 sept." */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 4)}.`;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return m === '00' ? `${h}h` : `${h}h${m}`;
}

/** true si le jour `dayIso` (YYYY-MM-DD) est couvert par la session [startAt, endAt]. */
export function dayIsInRange(dayIso: string, startAt: string, endAt: string): boolean {
  const startDay = startAt.slice(0, 10);
  const endDay = endAt.slice(0, 10);
  return dayIso >= startDay && dayIso <= endDay;
}

/** true si la session dure plus d'une journée civile. */
export function isMultiDay(startAt: string, endAt: string): boolean {
  return startAt.slice(0, 10) !== endAt.slice(0, 10);
}

/**
 * Libellé lisible de la période d'une session, adapté selon qu'elle dure
 * un seul jour (horaires seuls) ou plusieurs jours (dates + heures).
 */
export function formatSessionPeriod(startAt: string, endAt: string): string {
  if (!isMultiDay(startAt, endAt)) {
    return `${timeOf(startAt)} → ${timeOf(endAt)}`;
  }
  return `${shortDate(startAt)} ${timeOf(startAt)} → ${shortDate(endAt)} ${timeOf(endAt)}`;
}

export type DayOverride = { day: string; start_time: string; end_time: string };

/**
 * Horaire effectif d'un jour donné d'une session : celui défini spécifiquement
 * pour ce jour (session_days) s'il existe, sinon l'heure de début/fin de la
 * session appliquée à chaque jour par défaut.
 */
export function effectiveDayTime(
  dayIso: string,
  startAt: string,
  endAt: string,
  overrides: DayOverride[]
): { start: string; end: string } {
  const override = overrides.find((o) => o.day === dayIso);
  if (override) return { start: override.start_time.slice(0, 5), end: override.end_time.slice(0, 5) };
  return { start: timeOf(startAt).replace('h', ':').padEnd(5, '0'), end: timeOf(endAt).replace('h', ':').padEnd(5, '0') };
}

export function formatHHMM(time: string): string {
  return time.length >= 5 ? time.slice(0, 5).replace(':', 'h') : time;
}

/** Toutes les dates (YYYY-MM-DD) couvertes par [startAt, endAt], bornes incluses. */
export function daysBetween(startAt: string, endAt: string): string[] {
  const start = new Date(startAt.slice(0, 10) + 'T00:00:00Z');
  const end = new Date(endAt.slice(0, 10) + 'T00:00:00Z');
  const days: string[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    days.push(isoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Comme daysBetween, mais sans les samedis/dimanches (semaine de travail lundi→vendredi). */
export function weekdaysBetween(startAt: string, endAt: string): string[] {
  return daysBetween(startAt, endAt).filter((iso) => {
    const weekday = new Date(iso + 'T00:00:00Z').getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}
