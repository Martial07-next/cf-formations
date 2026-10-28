import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { canEditStartTimes } from '@/lib/roles';

/**
 * Droit de remplir le dossier d'une session : bureau, administrateur, référent
 * cadre, formateur de la session ou remplaçant un des jours.
 */
export async function fillRights(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const { data: s } = await supabase.from('sessions').select('id, trainer_id, sign_token, trainers(full_name)').eq('id', sessionId).maybeSingle();
  if (!s) return null;
  // Remplaçants certains jours (migration 19) : mêmes droits sur le dossier.
  const { data: dayRows } = await supabase.from('session_day_trainers').select('day, trainer_id, trainers(full_name)').eq('session_id', sessionId);
  const days = ((dayRows as any[]) || []).map((d) => ({
    day: String(d.day).slice(0, 10),
    trainer_id: d.trainer_id as string,
    name: (Array.isArray(d.trainers) ? d.trainers[0] : d.trainers)?.full_name as string | undefined,
  }));
  const allowed =
    canEditStartTimes(profile.role) ||
    (!!profile.trainer_id && (profile.trainer_id === s.trainer_id || days.some((d) => d.trainer_id === profile.trainer_id)));
  return allowed ? { profile, session: s as any, supabase, days } : null;
}
