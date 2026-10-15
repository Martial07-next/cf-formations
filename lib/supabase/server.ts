import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase-env';

/** Client Supabase du compte connecté (un seul par requête grâce au cache). */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : ignorable, le middleware
            // rafraîchit déjà la session sur chaque requête.
          }
        },
      },
    }
  );
});

/**
 * Profil (rôle inclus) de l'utilisateur connecté, ou null. Mis en cache pour
 * la requête : la page, la barre latérale et les vérifications de droits
 * partagent le même résultat.
 */
export const getCurrentProfile = cache(async function getCurrentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Profil, fiche formateur liée et accès Facturation (migration 30) en parallèle.
  const [{ data: profile }, { data: trainer }, { data: billing }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single(),
    supabase.from('trainers').select('id').eq('profile_id', user.id).maybeSingle(),
    supabase.from('profiles').select('can_invoice').eq('id', user.id).maybeSingle(),
  ]);
  if (!profile) return null;
  return {
    ...profile,
    email: user.email,
    trainer_id: (trainer?.id as string | undefined) ?? null,
    can_invoice: Boolean((billing as any)?.can_invoice),
  };
});

export type { Role } from '@/lib/roles';
export { ROLE_LABELS, canManage } from '@/lib/roles';
