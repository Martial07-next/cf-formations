'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';

function readTemplate(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const maxRaw = get('max_trainees');
  return {
    title: get('title'),
    category: get('category') || null, // « dossier » de la formation
    // Saisie en heures + minutes (ex. 7 h 30), stockée en heures décimales.
    duration_hours: Math.max(0, Number.parseInt(get('duration_h') || '0', 10) || 0) + (Number.parseInt(get('duration_min') || '0', 10) || 0) / 60,
    max_trainees: maxRaw ? Number(maxRaw) : null,
    description: get('description') || null,
  };
}

/** Modules (JSON du formulaire) et formateurs habilités. */
function readExtras(formData: FormData) {
  let modules: { name: string; duration_hours: number }[] = [];
  try {
    const raw = JSON.parse(String(formData.get('modules_json') || '[]'));
    if (Array.isArray(raw)) {
      modules = raw
        .map((m: any) => ({ name: String(m?.name || '').trim().slice(0, 80), duration_hours: Number(m?.duration_hours) }))
        .filter((m) => m.name && m.duration_hours > 0)
        .slice(0, 30);
    }
  } catch {
    /* champ absent ou invalide : pas de modules */
  }
  const trainerIds = [...new Set(formData.getAll('trainer_ids').map(String).filter(Boolean))];
  return { modules, trainerIds };
}

async function saveExtras(supabase: Awaited<ReturnType<typeof createClient>>, templateId: string, formData: FormData) {
  const { modules, trainerIds } = readExtras(formData);
  const del1 = await supabase.from('template_modules').delete().eq('template_id', templateId);
  if (del1.error) return del1.error.message;
  if (modules.length) {
    const { error } = await supabase
      .from('template_modules')
      .insert(modules.map((m, position) => ({ ...m, position, template_id: templateId })));
    if (error) return error.message;
  }
  const del2 = await supabase.from('template_trainers').delete().eq('template_id', templateId);
  if (del2.error) return del2.error.message;
  if (trainerIds.length) {
    const { error } = await supabase.from('template_trainers').insert(trainerIds.map((trainer_id) => ({ template_id: templateId, trainer_id })));
    if (error) return error.message;
  }
  return null;
}

function refresh() {
  revalidatePath('/modeles');
  revalidatePath('/');
}

export async function createTemplate(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et durée (supérieure à 0) requis.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('templates').insert(t).select('id').single();
  if (error) return { ok: false, error: error.message };
  const extraError = await saveExtras(supabase, data.id, formData);
  refresh();
  if (extraError) return { ok: false, error: `Formation créée, mais modules/formateurs non enregistrés : ${extraError}` };
  return { ok: true };
}

export async function updateTemplate(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et durée (supérieure à 0) requis.' };
  const supabase = await createClient();
  const { error } = await supabase.from('templates').update(t).eq('id', id);
  if (error) return { ok: false, error: error.message };
  const extraError = await saveExtras(supabase, id, formData);
  refresh();
  if (extraError) return { ok: false, error: `Formation enregistrée, mais modules/formateurs non enregistrés : ${extraError}` };
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
