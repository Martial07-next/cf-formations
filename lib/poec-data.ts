import type { SupabaseClient } from '@supabase/supabase-js';
import { CONVENTION_SELECT, type Convention, type PoecPeriod, type PoecProgram } from '@/lib/poec';
import { loadDayOverrides, hoursOf, one } from '@/lib/history';

export type ProgramMember = {
  trainee_id: string;
  full_name: string;
  company: string | null;
  email: string | null;
  address: string | null;
  ft_id: string | null;
};

export type ProgramSession = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  room: string | null;
  trainer: string | null;
  trainerColor: string | null;
  hours: number;
  enrolled: number;
};

export type ProgramData = {
  program: PoecProgram;
  members: ProgramMember[];
  sessions: ProgramSession[];
  periods: PoecPeriod[];
  conventions: Convention[];
};

/** Tout le contenu d'un parcours POEC (page du bureau et page France Travail). */
export async function loadProgramData(supabase: SupabaseClient, programId: string): Promise<ProgramData | null> {
  const { data: program } = await supabase.from('poec_programs').select('*').eq('id', programId).maybeSingle();
  if (!program) return null;
  const [{ data: members }, { data: sessions }, { data: periods }, { data: conventions }] = await Promise.all([
    supabase.from('poec_trainees').select('trainee_id, address, ft_id, trainees(full_name, company, email)').eq('program_id', programId),
    supabase
      .from('sessions')
      .select('id, title, status, start_at, end_at, rooms(name), trainers(full_name, color), session_trainees(status)')
      .eq('poec_id', programId)
      .order('start_at'),
    supabase.from('poec_periods').select('id, program_id, label, start_date, end_date').eq('program_id', programId).order('start_date'),
    supabase.from('poec_conventions').select(CONVENTION_SELECT).eq('program_id', programId),
  ]);
  const overrides = await loadDayOverrides(supabase, ((sessions as any[]) || []).map((s) => s.id));
  return {
    program: program as PoecProgram,
    members: ((members as any[]) || [])
      .map((m) => {
        const t = one<any>(m.trainees) || {};
        return { trainee_id: m.trainee_id, full_name: t.full_name || '—', company: t.company || null, email: t.email || null, address: m.address, ft_id: m.ft_id };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr')),
    sessions: ((sessions as any[]) || []).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      start_at: s.start_at,
      end_at: s.end_at,
      room: one<any>(s.rooms)?.name || null,
      trainer: one<any>(s.trainers)?.full_name || null,
      trainerColor: one<any>(s.trainers)?.color || null,
      hours: hoursOf(s, overrides),
      enrolled: (s.session_trainees || []).filter((t: any) => t.status === 'validee').length,
    })),
    periods: (periods as PoecPeriod[]) || [],
    conventions: (conventions as unknown as Convention[]) || [],
  };
}
