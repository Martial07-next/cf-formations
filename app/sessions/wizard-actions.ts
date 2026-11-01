'use server';

import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { dayHours } from '@/lib/week';

/**
 * Assistant de création de session (planning) : état de la session créée à
 * l'étape 1, et recherche de stagiaires pour l'étape « Stagiaires ».
 * Les modifications passent par les actions existantes de la fiche session.
 */

export type WizardState = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  max_trainees: number | null;
  room: string | null;
  trainer: string | null;
  digiforma_docs_url: string | null;
  hours: number;
  days: string[];
  /** Modules prévus par la formation du catalogue (sinon l'étape propose d'en ajouter). */
  templateModules: number;
  modules: { id: string; name: string; start_day: string; end_day: string; duration_hours: number | null }[];
  trainees: { id: string; full_name: string; company: string | null; status: 'validee' | 'en_attente' }[];
  reservations: { company: string; seats: number; status: string }[];
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function wizardState(sessionId: string): Promise<{ ok: true; state: WizardState } | { ok: false; error: string }> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from('sessions')
    .select('id, title, start_at, end_at, status, max_trainees, template_id, rooms(name, is_holding), trainers(full_name)')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !s) return { ok: false, error: 'Session introuvable.' };
  const [{ data: mods }, { data: links }, resa, df, days, tplMods] = await Promise.all([
    supabase.from('session_modules').select('id, name, start_day, end_day, duration_hours, position').eq('session_id', sessionId).order('start_day').order('position'),
    supabase.from('session_trainees').select('trainee_id, status, trainees(full_name, company)').eq('session_id', sessionId),
    supabase.from('session_reservations').select('company, seats, status').eq('session_id', sessionId),
    supabase.from('sessions').select('digiforma_docs_url').eq('id', sessionId).maybeSingle(),
    supabase.from('session_days').select('day, start_time, end_time').eq('session_id', sessionId),
    s.template_id
      ? supabase.from('template_modules').select('id', { count: 'exact', head: true }).eq('template_id', s.template_id)
      : Promise.resolve({ count: 0 }),
  ]);
  const perDay = dayHours(s.start_at, s.end_at, (days.data as any[]) || []);
  const room = one<any>((s as any).rooms);
  return {
    ok: true,
    state: {
      id: s.id,
      title: s.title,
      start_at: s.start_at,
      end_at: s.end_at,
      status: s.status,
      max_trainees: s.max_trainees,
      room: room && !room.is_holding ? room.name : null,
      trainer: one<any>((s as any).trainers)?.full_name || null,
      digiforma_docs_url: df.error ? null : ((df.data as any)?.digiforma_docs_url ?? null),
      hours: Math.round((perDay.reduce((n, d) => n + d.minutes, 0) / 60) * 10) / 10,
      days: perDay.map((d) => d.day),
      templateModules: (tplMods as any).count || 0,
      modules: ((mods as any[]) || []).map((m) => ({ ...m, start_day: String(m.start_day).slice(0, 10), end_day: String(m.end_day).slice(0, 10) })),
      trainees: ((links as any[]) || [])
        .map((l) => {
          const t = one<any>(l.trainees);
          return { id: l.trainee_id, full_name: t?.full_name || '', company: t?.company || null, status: l.status };
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr')),
      reservations: resa.error ? [] : ((resa.data as any[]) || []).map((r) => ({ company: r.company, seats: r.seats, status: r.status || 'validee' })),
    },
  };
}

/** Stagiaires de la base correspondant à la recherche (nom, prénom ou entreprise). */
export async function searchTrainees(query: string, exclude: string[] = []): Promise<{ id: string; full_name: string; company: string | null }[]> {
  if (!(await requireManager())) return [];
  const words = query
    .normalize('NFC')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3)
    .map((w) => w.replace(/[\\%_,()]/g, ''));
  if (!words.length) return [];
  const supabase = await createClient();
  let q = supabase.from('trainees').select('id, full_name, company');
  for (const w of words) q = q.or(`full_name.ilike.%${w}%,company.ilike.%${w}%`);
  const { data } = await q.order('full_name').limit(30);
  return ((data as any[]) || []).filter((t) => !exclude.includes(t.id)).slice(0, 8);
}
