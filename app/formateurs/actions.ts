'use server';

import { createClient } from '@/lib/supabase/server';
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
