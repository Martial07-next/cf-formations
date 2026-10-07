import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionHours, dayHours, type DayOverride } from '@/lib/week';

/** Horaires spécifiques par jour pour un ensemble de sessions. */
export async function loadDayOverrides(supabase: SupabaseClient, sessionIds: string[]) {
  const map: Record<string, DayOverride[]> = {};
  if (!sessionIds.length) return map;
  const { data } = await supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', sessionIds);
  for (const row of data || []) (map[row.session_id] ||= []).push(row);
  return map;
}

export function hoursOf(s: { id: string; start_at: string; end_at: string }, overrides: Record<string, DayOverride[]>) {
  return sessionHours(s.start_at, s.end_at, overrides[s.id] || []);
}

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export const MONTH_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

/**
 * Heures de formation par mois pour une année donnée. Une session à cheval
 * sur deux mois est répartie jour par jour. Les heures des jours déjà passés
 * sont « réalisées », les autres « planifiées ».
 */
export function hoursByMonth(
  sessions: { id: string; start_at: string; end_at: string; status?: string }[],
  overrides: Record<string, DayOverride[]>,
  year: number,
  todayIso = new Date().toISOString().slice(0, 10)
) {
  const done = Array(12).fill(0) as number[];
  const planned = Array(12).fill(0) as number[];
  const sessionsPerMonth = Array.from({ length: 12 }, () => new Set<string>());
  for (const s of sessions) {
    if (s.status === 'brouillon') continue;
    for (const d of dayHours(s.start_at, s.end_at, overrides[s.id] || [])) {
      if (Number(d.day.slice(0, 4)) !== year) continue;
      const m = Number(d.day.slice(5, 7)) - 1;
      if (d.day < todayIso) done[m] += d.minutes / 60;
      else planned[m] += d.minutes / 60;
      sessionsPerMonth[m].add(s.id);
    }
  }
  return { done, planned, sessions: sessionsPerMonth.map((x) => x.size) };
}
