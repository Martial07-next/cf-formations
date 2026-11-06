'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { runDigiformaSync, type SyncResult } from '@/lib/digiforma-sync';

/** Bouton « Synchroniser maintenant » (Administration → Intégrations) : admin uniquement. */
export async function syncDigiformaNow(): Promise<SyncResult> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  // Pendant ce passage, la synchronisation automatique du planning ne se lance pas en parallèle.
  await supabase.from('app_settings').update({ digiforma_last_sync: new Date().toISOString() }).eq('id', true);
  const result = await runDigiformaSync(supabase);
  revalidatePath('/');
  revalidatePath('/sessions');
  revalidatePath('/administration/integrations');
  return result;
}
