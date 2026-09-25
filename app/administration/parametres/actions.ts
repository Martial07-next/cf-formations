'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();

  const company_name = String(formData.get('company_name') || '').trim();
  const company_address = String(formData.get('company_address') || '').trim() || null;
  const default_session_duration_hours = Number(formData.get('default_session_duration_hours') || 7);
  const notify_on_conflict = formData.get('notify_on_conflict') === 'on';

  if (!company_name) return { ok: false, error: "Le nom de l'entreprise est requis." };

  const { error } = await supabase
    .from('app_settings')
    .update({
      company_name,
      company_address,
      default_session_duration_hours,
      notify_on_conflict,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/administration/parametres');
  return { ok: true };
}
