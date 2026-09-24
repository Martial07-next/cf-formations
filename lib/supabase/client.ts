import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase-env';

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseKey());
}
