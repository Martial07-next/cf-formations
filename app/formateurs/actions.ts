'use server';

import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { isHexColor, nextTrainerColor } from '@/lib/colors';

function readTrainer(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  return {
    full_name: get('full_name'),
    email: get('email') || null,
    phone: get('phone') || null,
    specialty: get('specialty') || null,
    availability: get('availability') || null,
    color: get('color'),
    referent_id: get('referent_id') || null,
    profile_id: get('profile_id') || null,
  };
}

function refresh(id?: string) {
  revalidatePath('/formateurs');
  revalidatePath('/equipe');
  revalidatePath('/');
  if (id) revalidatePath(`/formateurs/${id}`);
}

function friendly(message: string) {
  return message.includes('trainers_profile_id_key')
    ? 'Ce compte utilisateur est déjà lié à un autre formateur.'
    : message;
}

export async function createTrainer(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const t = readTrainer(formData);
  const status = String(formData.get('status') || 'actif');
  if (!t.full_name) return { ok: false, error: 'Le nom est requis.' };

  // Chaque formateur reçoit une couleur distincte pour le planning.
  if (!isHexColor(t.color)) {
    const { data: used } = await supabase.from('trainers').select('color');
    t.color = nextTrainerColor((used || []).map((r: any) => r.color));
  }

  const { error } = await supabase.from('trainers').insert({ ...t, status });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteTrainer(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('trainers').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function updateTrainer(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const t = readTrainer(formData);
  if (!t.full_name) return { ok: false, error: 'Le nom est requis.' };
  const { color, ...rest } = t;
  const { error } = await supabase
    .from('trainers')
    .update(isHexColor(color) ? { ...rest, color } : rest)
    .eq('id', id);
  if (error) return { ok: false, error: friendly(error.message) };
  refresh(id);
  return { ok: true };
}

export async function updateTrainerStatus(id: string, status: string) {
  if (!(await requireManager())) return FORBIDDEN;
  if (status !== 'actif' && status !== 'inactif') return { ok: false, error: 'Statut inconnu.' };
  const supabase = await createClient();
  const { error } = await supabase.from('trainers').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh(id);
  return { ok: true };
}

export type AbsenceResult = { ok: true; warning?: string } | { ok: false; error: string };

/** Ajoute un congé / une absence ; signale les sessions déjà planifiées sur ces dates. */
/** Bureau / admin, ou référent cadre pour un formateur de son équipe. */
async function canManageAbsences(trainerId: string): Promise<boolean> {
  if (await requireManager()) return true;
  const profile = await getCurrentProfile();
  if (profile?.role !== 'referent') return false;
  const supabase = await createClient();
  const { data } = await supabase.from('trainers').select('referent_id').eq('id', trainerId).maybeSingle();
  return data?.referent_id === profile.id;
}

export async function addAbsence(trainerId: string, formData: FormData): Promise<AbsenceResult> {
  if (!(await canManageAbsences(trainerId))) return FORBIDDEN;
  const start = String(formData.get('start_date') || '');
  const end = String(formData.get('end_date') || '') || start;
  const kind = String(formData.get('kind') || 'conge');
  const note = String(formData.get('note') || '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false, error: 'Dates invalides.' };
  if (end < start) return { ok: false, error: 'La date de fin doit être après la date de début.' };
  if (!['conge', 'absence', 'maladie', 'autre'].includes(kind)) return { ok: false, error: 'Type inconnu.' };

  const supabase = await createClient();
  const { error } = await supabase.from('trainer_absences').insert({ trainer_id: trainerId, start_date: start, end_date: end, kind, note });
  if (error) return { ok: false, error: error.message };

  // Sessions déjà affectées à ce formateur pendant l'absence : à réaffecter.
  const { data: clash } = await supabase
    .from('sessions')
    .select('title, start_at')
    .eq('trainer_id', trainerId)
    .lte('start_at', `${end}T23:59:59`)
    .gte('end_at', `${start}T00:00:00`)
    .order('start_at');
  refresh(trainerId);
  if (clash && clash.length) {
    return {
      ok: true,
      warning: `Attention : ${clash.length} session(s) déjà planifiée(s) avec ce formateur sur ces dates (${clash
        .map((c: any) => `${c.title} le ${c.start_at.slice(0, 10).split('-').reverse().join('/')}`)
        .join(', ')}). Pense à changer de formateur.`,
    };
  }
  return { ok: true };
}

export async function deleteAbsence(id: string, trainerId: string): Promise<AbsenceResult> {
  if (!(await canManageAbsences(trainerId))) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('trainer_absences').delete().eq('id', id).eq('trainer_id', trainerId);
  if (error) return { ok: false, error: error.message };
  refresh(trainerId);
  return { ok: true };
}
