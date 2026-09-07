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
