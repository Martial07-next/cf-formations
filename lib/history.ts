import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionHours, type DayOverride } from '@/lib/week';

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
