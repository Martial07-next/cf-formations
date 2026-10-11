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

  if (!company_name) return { ok: false, error: "Le nom de l'entreprise est requis." };

  const base = {
    company_name,
    company_address,
    default_session_duration_hours,
    notify_on_conflict,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from('app_settings').update({ ...base, ...legal }).eq('id', true);
  if (error && /siret|nda|signature_city/.test(error.message)) {
    return { ok: false, error: 'Exécute d’abord la migration 18 (supabase/migration_phase18.sql) pour enregistrer le SIRET et la déclaration d’activité.' };
  }

  if (error) return { ok: false, error: error.message };
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
