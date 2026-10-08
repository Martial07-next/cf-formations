import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from '@/lib/supabase-env';

/**
 * Client Supabase avec la clé service_role : contourne le RLS.
 * À N'UTILISER QUE côté serveur, pour des tâches sans session utilisateur
 * (ex. le cron de synchronisation Digiforma). Ne jamais exposer cette clé au
 * navigateur : jamais de préfixe NEXT_PUBLIC_ sur SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur (Supabase > Settings > API > service_role, jamais NEXT_PUBLIC_)."
    );
  }
  return createSupabaseClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
