/**
 * Formateur remplaçant certains jours d'une session (ex. jours 3 et 4 d'une
 * formation de 5 jours). Sans remplacement, c'est le formateur principal.
 */
export type DayTrainer = { session_id: string; day: string; trainer_id: string; note?: string | null };

/** session_id → (jour → remplaçant). */
export type DayTrainerMap = Record<string, Record<string, { trainer_id: string; note?: string | null }>>;

export function toDayTrainerMap(rows: DayTrainer[] | null | undefined): DayTrainerMap {
  const map: DayTrainerMap = {};
  for (const r of rows || []) (map[r.session_id] ||= {})[String(r.day).slice(0, 10)] = { trainer_id: r.trainer_id, note: r.note ?? null };
  return map;
}

/** Formateur effectif d'une session un jour donné. */
export function trainerOn(map: DayTrainerMap, s: { id: string; trainer_id: string | null }, day: string): string | null {
  return map[s.id]?.[day]?.trainer_id ?? s.trainer_id;
}

/** Tous les formateurs d'une session (principal + remplaçants). */
export function trainersOf(map: DayTrainerMap, s: { id: string; trainer_id: string | null }): string[] {
  return [...new Set([s.trainer_id, ...Object.values(map[s.id] || {}).map((x) => x.trainer_id)].filter(Boolean) as string[])];
}

/** Charge les remplacements pour une liste de sessions (vide si la migration 19 manque). */
export async function loadDayTrainers(supabase: any, sessionIds: string[]): Promise<DayTrainerMap> {
  if (!sessionIds.length) return {};
  const rows: DayTrainer[] = [];
  for (let i = 0; i < sessionIds.length; i += 200) {
    const { data, error } = await supabase
      .from('session_day_trainers')
      .select('session_id, day, trainer_id, note')
      .in('session_id', sessionIds.slice(i, i + 200));
    if (error) return {};
    rows.push(...(data || []));
  }
  return toDayTrainerMap(rows);
}
