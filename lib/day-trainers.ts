/**
 * Formateur remplaçant certains jours d'une session (ex. jours 3 et 4 d'une
 * formation de 5 jours). Sans remplacement, c'est le formateur principal.
 */
/** trainer_id null + external_name : certificateur externe (le formateur est libre ce jour-là, migration 78). */
export type DayTrainer = { session_id: string; day: string; trainer_id: string | null; note?: string | null; external_name?: string | null };

/** session_id → (jour → remplaçant). */
export type DayTrainerMap = Record<string, Record<string, { trainer_id: string | null; note?: string | null; external_name?: string | null }>>;

export function toDayTrainerMap(rows: DayTrainer[] | null | undefined): DayTrainerMap {
  const map: DayTrainerMap = {};
  for (const r of rows || []) (map[r.session_id] ||= {})[String(r.day).slice(0, 10)] = { trainer_id: r.trainer_id ?? null, note: r.note ?? null, external_name: r.external_name ?? null };
  return map;
}

/** Formateur effectif d'une session un jour donné (null : certificateur externe, ou personne). */
export function trainerOn(map: DayTrainerMap, s: { id: string; trainer_id: string | null }, day: string): string | null {
  const e = map[s.id]?.[day];
  return e ? e.trainer_id : s.trainer_id;
}

/** Certificateur externe d'une session un jour donné, sinon null. */
export function externalOn(map: DayTrainerMap, s: { id: string }, day: string): string | null {
  const e = map[s.id]?.[day];
  return e && !e.trainer_id ? e.external_name || 'Certificateur externe' : null;
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
      .select('*')
      .in('session_id', sessionIds.slice(i, i + 200));
    if (error) return {};
    rows.push(...(data || []));
  }
  return toDayTrainerMap(rows);
}
