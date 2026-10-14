'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';

export async function updateSettings(formData: FormData) {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();

  const company_name = String(formData.get('company_name') || '').trim();
  const company_address = String(formData.get('company_address') || '').trim() || null;
  const default_session_duration_hours = Number(formData.get('default_session_duration_hours') || 7);
  const notify_on_conflict = formData.get('notify_on_conflict') === 'on';
  // Mentions légales (feuille d'émargement), migration 18.
  const legal = {
    siret: String(formData.get('siret') || '').replace(/\s+/g, ' ').trim() || null,
    nda: String(formData.get('nda') || '').trim() || null,
    signature_city: String(formData.get('signature_city') || '').trim() || 'Cuincy',
  };
  // Attestation / appréciation des compétences (migration 22).
  const cachet = String(formData.get('cachet_image') || '');
  if (cachet && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(cachet) || cachet.length > 900_000)) {
    return { ok: false, error: 'Image du cachet invalide ou trop lourde.' };
  }
  const docs = {
    signataire: String(formData.get('signataire') || '').trim() || 'GRÉBERT MATTHIEU',
    agrement: String(formData.get('agrement') || '').trim() || 'CTST-2026-27/1/P',
    cachet_image: cachet || null,
  };

  if (!company_name) return { ok: false, error: "Le nom de l'entreprise est requis." };

  const base = {
    company_name,
    company_address,
    default_session_duration_hours,
    notify_on_conflict,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from('app_settings').update({ ...base, ...legal, ...(formData.has('signataire') ? docs : {}) }).eq('id', true);
  if (error && /signataire|agrement|cachet_image/.test(error.message)) {
    return { ok: false, error: 'Exécute d’abord la migration 22 (supabase/migration_phase22.sql) pour enregistrer le cachet et la signature.' };
  }
  if (error && /siret|nda|signature_city/.test(error.message)) {
    return { ok: false, error: 'Exécute d’abord la migration 18 (supabase/migration_phase18.sql) pour enregistrer le SIRET et la déclaration d’activité.' };
  }

  if (error) return { ok: false, error: error.message };

  // Représentant de CF Réseaux sur les conventions de stage POEC (migration 23).
  if (formData.has('director_name')) {
    const { error: dirError } = await supabase
      .from('app_settings')
      .update({
        director_name: String(formData.get('director_name') || '').trim() || 'Madame Aurélie Lancelle',
        director_title: String(formData.get('director_title') || '').trim() || 'Directrice de CF Réseaux',
      })
      .eq('id', true);
    if (dirError) {
      return { ok: false, error: 'Le reste est enregistré. Exécute la migration 23 (supabase/migration_phase23.sql) pour enregistrer le représentant des conventions POEC.' };
    }
  }
  revalidatePath('/administration/parametres');
  return { ok: true };
}

export type DigiformaTestResult =
  | { ok: true; typeCount: number }
  | { ok: false; error: string };

/** Test réel de connexion à l'API Digiforma (requête d'introspection, sans effet). */
export async function testDigiformaConnection(): Promise<DigiformaTestResult> {
  if (!(await requireAdmin())) return FORBIDDEN;
  try {
    const { digiformaIntrospect } = await import('@/lib/digiforma');
    const types = await digiformaIntrospect();
    return { ok: true, typeCount: types.length };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
