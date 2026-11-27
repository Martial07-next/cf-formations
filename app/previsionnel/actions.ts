'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { forecastIso, forecastSessions, type HistSession } from '@/lib/forecast';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const MIGRATION = 'Exécute d’abord la migration 80 (supabase/migration_phase80.sql) dans Supabase.';
const missing = (m: string) => (/forecast_sessions|schema cache|does not exist/i.test(m) ? MIGRATION : m);
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function refresh() {
  revalidatePath('/');
}

/**
 * L'IA propose les prochaines formations (12 semaines par défaut) à partir des
 * 18 derniers mois. Ses anciennes propositions encore « prévues » sont remplacées ;
 * les prévisions ajoutées à la main, positionnées ou ignorées restent.
 */
export async function generateForecast(weeks = 12): Promise<Result<{ count: number }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = forecastIso.mondayIso(forecastIso.addD(today, 1));
  const to = forecastIso.addD(from, Math.max(4, Math.min(26, weeks)) * 7 - 3);
  const since = forecastIso.addD(today, -548);
  const [hist, plan, rooms, trainers, existing] = await Promise.all([
    supabase.from('sessions').select('title, template_id, room_id, trainer_id, start_at, end_at, status, rooms(is_holding, status)').gte('start_at', since).lt('start_at', today).neq('status', 'brouillon').limit(5000),
    supabase.from('sessions').select('title, template_id, room_id, trainer_id, start_at, end_at, status').gte('end_at', `${today}T00:00:00`).limit(3000),
    supabase.from('rooms').select('id, name, is_holding, status'),
    supabase.from('trainers').select('id, full_name'),
    supabase.from('forecast_sessions').select('id, ai_key, source, status, room_id, start_date, end_date'),
  ]);
  if (existing.error) return { ok: false, error: missing(existing.error.message) };
  const realRoom = (r: any) => r && !r.is_holding && r.status !== 'exterieur';
  const history = ((hist.data as any[]) || [])
    .map((s) => {
      const r = Array.isArray(s.rooms) ? s.rooms[0] : s.rooms;
      // Session « À affecter » ou en entreprise : la formation compte, pas la salle.
      return { ...s, room_id: realRoom(r) ? s.room_id : null } as HistSession;
    });
  const old = (existing.data as any[]) || [];
  const keep = old.filter((f) => !(f.source === 'ia' && f.status === 'prevu'));
  const proposals = forecastSessions({
    history,
    planned: (plan.data as any[]) || [],
    taken: keep.filter((f) => f.status !== 'ignore'),
    skip: new Set(keep.map((f) => f.ai_key).filter(Boolean)),
    rooms: ((rooms.data as any[]) || []).filter(realRoom),
    roomNames: Object.fromEntries(((rooms.data as any[]) || []).map((r) => [r.id, r.name])),
    trainerNames: Object.fromEntries(((trainers.data as any[]) || []).map((t) => [t.id, String(t.full_name).split(/\s+/).find((w: string) => w && w !== w.toUpperCase()) || t.full_name])),
    from,
    to,
    today,
  });
  const stale = old.filter((f) => f.source === 'ia' && f.status === 'prevu').map((f) => f.id);
  for (let i = 0; i < stale.length; i += 200) await supabase.from('forecast_sessions').delete().in('id', stale.slice(i, i + 200));
  if (proposals.length) {
    const { error } = await supabase.from('forecast_sessions').insert(proposals.map((p) => ({ ...p, status: 'prevu' })));
    if (error) return { ok: false, error: missing(error.message) };
  }
  refresh();
  return { ok: true, count: proposals.length };
}

export type ForecastInput = {
  template_id: string | null;
  title: string;
  room_id: string | null;
  trainer_id: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
};

function clean(v: ForecastInput): ForecastInput | string {
  const title = String(v.title || '').trim().slice(0, 200);
  if (!title) return 'Indique la formation.';
  if (!isDate(v.start_date) || !isDate(v.end_date)) return 'Indique les dates.';
  if (v.end_date < v.start_date) return 'La fin est avant le début.';
  return {
    template_id: v.template_id || null,
    title,
    room_id: v.room_id || null,
    trainer_id: v.trainer_id || null,
    start_date: v.start_date,
    end_date: v.end_date,
    start_time: isTime(v.start_time) ? v.start_time : '08:00',
    end_time: isTime(v.end_time) ? v.end_time : '16:00',
  };
}

/** Prévision ajoutée à la main. */
export async function addForecast(v: ForecastInput): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const row = clean(v);
  if (typeof row === 'string') return { ok: false, error: row };
  const supabase = await createClient();
  const { error } = await supabase.from('forecast_sessions').insert({ ...row, source: 'manuel', status: 'prevu' });
  if (error) return { ok: false, error: missing(error.message) };
  refresh();
  return { ok: true };
}

/** Prévision modifiée (dates, salle, formateur…). Une prévision de l'IA modifiée reste en place à la prochaine génération. */
export async function updateForecast(id: string, v: ForecastInput): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const row = clean(v);
  if (typeof row === 'string') return { ok: false, error: row };
  const supabase = await createClient();
  const { error } = await supabase.from('forecast_sessions').update({ ...row, source: 'manuel', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: missing(error.message) };
  refresh();
  return { ok: true };
}

/** Ignorer (l'IA ne la reproposera pas) ou supprimer (prévision manuelle). */
export async function dropForecast(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: f } = await supabase.from('forecast_sessions').select('ai_key').eq('id', id).maybeSingle();
  const { error } = f?.ai_key
    ? await supabase.from('forecast_sessions').update({ status: 'ignore', updated_at: new Date().toISOString() }).eq('id', id)
    : await supabase.from('forecast_sessions').delete().eq('id', id);
  if (error) return { ok: false, error: missing(error.message) };
  refresh();
  return { ok: true };
}

/** Prévision positionnée sur le vrai planning (session créée par l'assistant). */
export async function markForecastPlaced(id: string, sessionId: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('forecast_sessions').update({ status: 'place', placed_session_id: sessionId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: missing(error.message) };
  refresh();
  return { ok: true };
}
