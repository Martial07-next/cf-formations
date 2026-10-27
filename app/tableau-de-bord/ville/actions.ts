'use server';

import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { defaultLook, sanitizeLook, type AvatarLook } from '@/lib/city/types';

/**
 * Enregistre le personnage CF Réseaux City du formateur connecté (migration 45).
 * Un formateur ne modifie que le sien (contrôlé ici et par le RLS).
 */
export async function saveAvatar(look: AvatarLook): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.trainer_id) return { ok: false, error: 'Seul un compte formateur peut créer son personnage.' };
  const clean = sanitizeLook(look, defaultLook(profile.trainer_id));
  const supabase = await createClient();
  const { error } = await supabase.from('city_avatars').upsert(
    {
      trainer_id: profile.trainer_id,
      skin: clean.skin,
      hair: clean.hair,
      hair_color: clean.hairColor,
      top_color: clean.top,
      bottom_color: clean.bottom,
      accessory: clean.accessory,
      vacation: clean.vacation,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trainer_id' }
  );
  if (error) {
    if (/city_avatars/.test(error.message)) return { ok: false, error: 'La migration 45 (personnages CF Réseaux City) n’a pas encore été exécutée.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
