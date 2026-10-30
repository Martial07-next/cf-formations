import { setWorkedHolidays } from '@/lib/holidays';

/**
 * Fériés travaillés (migration 48) chargés côté serveur avant les calculs de
 * jours de formation. Mis en cache 5 minutes (données identiques pour tous).
 */
let loadedAt = 0;
let list: string[] = [];

export async function ensureWorkedHolidays(supabase: any): Promise<string[]> {
  if (Date.now() - loadedAt < 5 * 60 * 1000) return list;
  const { data, error } = await supabase.from('worked_holidays').select('day');
  if (!error) {
    list = ((data as any[]) || []).map((r) => String(r.day).slice(0, 10));
    setWorkedHolidays(list);
  }
  loadedAt = Date.now();
  return list;
}

/** À appeler après une synchronisation : rechargement au prochain calcul. */
export function invalidateWorkedHolidays(days?: string[]) {
  loadedAt = days ? Date.now() : 0;
  if (days) {
    list = days;
    setWorkedHolidays(days);
  }
}
