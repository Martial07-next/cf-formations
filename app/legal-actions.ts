'use server';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Mentions légales publiques de CF Réseaux (SIRET, N° de déclaration
 * d'activité) pour les documents générés, y compris depuis les pages sans
 * compte (signature par lien). Aucune autre donnée n'est renvoyée.
 */
export async function legalMentions(): Promise<{ siret: string | null; nda: string | null }> {
  try {
    const { data } = await createAdminClient().from('app_settings').select('siret, nda').limit(1).maybeSingle();
    return { siret: (data as any)?.siret || null, nda: (data as any)?.nda || null };
  } catch {
    return { siret: null, nda: null };
  }
}
