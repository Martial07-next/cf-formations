'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCongesAndLog, type CongesSyncResult } from '@/lib/conges-sync';

/** Administration › Intégrations : synchroniser les congés tout de suite. */
export async function syncCongesNow(): Promise<CongesSyncResult | { ok: false; error: string }> {
  if (!(await requireAdmin())) return FORBIDDEN as any;
  const result = await syncCongesAndLog(createAdminClient());
  revalidatePath('/');
  revalidatePath('/equipe');
  revalidatePath('/administration/integrations');
  return result;
}

/** Retire les congés saisis à la main (avant le branchement de la plateforme de congés). */
export async function deleteManualAbsences(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!(await requireAdmin())) return FORBIDDEN as any;
  const { error, count } = await createAdminClient().from('trainer_absences').delete({ count: 'exact' }).neq('source', 'conges');
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  revalidatePath('/equipe');
  revalidatePath('/administration/integrations');
  return { ok: true, count: count ?? 0 };
}
