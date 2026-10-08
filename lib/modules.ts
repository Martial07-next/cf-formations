import { planDays, FULL_DAY_MINUTES, type DayPlan } from '@/lib/schedule';

export type ModuleDef = { name: string; duration_hours: number };
export type SessionModule = {
  id: string;
  session_id: string;
  position: number;
  name: string;
  start_day: string;
  end_day: string;
  duration_hours: number | null;
};

/**
 * Place les modules d'une formation (ex. MA1 7 h, MA2 7 h, MA3 7 h) sur les
 * jours de la session, dans l'ordre, avec les mêmes règles que le calcul des
 * horaires (journées de 7 h, pause 12h–13h, week-ends sautés).
 * Ex. 3 × 7 h à partir du lundi → MA1 lundi, MA2 mardi, MA3 mercredi.
 */
export function placeModules(startDate: string, startTime: string, modules: ModuleDef[], dailyMinutes = FULL_DAY_MINUTES) {
  const total = modules.reduce((n, m) => n + Math.round(Number(m.duration_hours) * 60), 0);
  const plan: DayPlan[] = planDays(startDate, startTime, total, dailyMinutes);
  if (!plan.length) return [];

  // Minute de début (cumulée) de chaque jour du plan.
  const dayStarts: number[] = [];
  plan.reduce((acc, d) => {
    dayStarts.push(acc);
    return acc + d.minutes;
  }, 0);
  const dayAt = (minute: number) => {
    let i = 0;
    while (i + 1 < plan.length && dayStarts[i + 1] <= minute) i++;
    return plan[i].day;
  };

  let cursor = 0;
  return modules.map((m, position) => {
    const minutes = Math.round(Number(m.duration_hours) * 60);
    const start_day = dayAt(cursor);
    const end_day = dayAt(cursor + Math.max(minutes, 1) - 1);
    cursor += minutes;
    return { position, name: m.name, start_day, end_day, duration_hours: Number(m.duration_hours) };
  });
}

/** Libellé court : « MA1, MA2 » ou « Session complète ». */
export function modulesLabel(all: SessionModule[], chosenIds: string[]): string {
  if (!all.length || !chosenIds.length || chosenIds.length === all.length) return 'Session complète';
  return all
    .filter((m) => chosenIds.includes(m.id))
    .map((m) => m.name)
    .join(', ');
}

/** Jours où un stagiaire est présent (tous les jours si session complète). */
export function attendsDay(all: SessionModule[], chosenIds: string[], day: string): boolean {
  if (!all.length || !chosenIds.length) return true;
  return all.some((m) => chosenIds.includes(m.id) && m.start_day <= day && m.end_day >= day);
}

export function frDay(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
