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
