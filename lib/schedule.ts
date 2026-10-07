/**
 * Calcul « intelligent » des horaires de formation.
 *
 * Règles :
 *  · pause déjeuner de 12:00 à 13:00, non comptée dans les heures ;
 *  · une journée complète = 7 h de formation (ex. 09:00–17:00 avec la pause) ;
 *  · une formation plus longue se poursuit les jours ouvrés suivants
 *    (week-ends sautés), le dernier jour pouvant être partiel.
 * Ex. 21 h à partir du lundi 09:00 → lun., mar., mer. 09:00–17:00.
 */
export const LUNCH_START = 12 * 60;
export const LUNCH_END = 13 * 60;
export const FULL_DAY_MINUTES = 7 * 60;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes de formation entre deux heures : la pause est retirée si la journée l'englobe entièrement. */
export function trainingMinutes(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e <= s) return 0;
  const lunch = s <= LUNCH_START && e >= LUNCH_END ? LUNCH_END - LUNCH_START : 0;
  return e - s - lunch;
}

/** Heure de fin pour `minutes` de formation à partir de `start`, pause incluse si nécessaire. */
export function endTimeFor(start: string, minutes: number): string {
  let s = toMinutes(start);
  if (s > LUNCH_START && s < LUNCH_END) s = LUNCH_END; // début pendant la pause → 13:00
  const naive = s + minutes;
  // Une demi-journée qui se termine avant 13:00 (ex. 09:00–12:30) ne prend pas de pause.
  if (s < LUNCH_START && naive >= LUNCH_END) return toHHMM(naive + (LUNCH_END - LUNCH_START));
  return toHHMM(naive);
}

export type DayPlan = { day: string; start: string; end: string; minutes: number };

function isWeekend(iso: string) {
  const w = new Date(iso + 'T00:00:00Z').getUTCDay();
  return w === 0 || w === 6;
}

function nextDay(iso: string) {
  return new Date(new Date(iso + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
}

/**
 * Répartit `totalMinutes` de formation sur des journées ouvrées à partir de
 * `startDate` / `startTime`. Chaque journée fait au plus `dailyMinutes`.
 */
export function planDays(startDate: string, startTime: string, totalMinutes: number, dailyMinutes = FULL_DAY_MINUTES): DayPlan[] {
  if (!startDate || !startTime || totalMinutes <= 0) return [];
  const plan: DayPlan[] = [];
  let day = startDate;
  while (isWeekend(day)) day = nextDay(day);
  let remaining = totalMinutes;
  for (let guard = 0; remaining > 0 && guard < 120; guard++) {
    const minutes = Math.min(remaining, dailyMinutes);
    plan.push({ day, start: startTime, end: endTimeFor(startTime, minutes), minutes });
    remaining -= minutes;
    do day = nextDay(day);
    while (isWeekend(day));
  }
  return plan;
}

/** Durée en heures décimales ↔ heures + minutes (pour les formulaires). */
export function splitHours(hours: number): { h: number; m: number } {
  const total = Math.round(hours * 60);
  return { h: Math.floor(total / 60), m: total % 60 };
}
