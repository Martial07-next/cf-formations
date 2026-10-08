'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { runDigiformaSync, type SyncResult } from '@/lib/digiforma-sync';

/** Bouton « Synchroniser maintenant » (Administration → Intégrations) : admin uniquement. */
export async function syncDigiformaNow(): Promise<SyncResult> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const result = await runDigiformaSync(supabase);
  revalidatePath('/');
  revalidatePath('/sessions');
  revalidatePath('/administration/integrations');
  return result;
}
