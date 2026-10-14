import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { canEditStartTimes } from '@/lib/roles';

/** Bureau, référent ou formateur de la session (y compris remplaçant) : peut recueillir signatures et prêts. */
export async function staffOf(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (canEditStartTimes(profile.role)) return profile;
  if (!profile.trainer_id) return null;
  const supabase = await createClient();
  const [{ data: s }, { data: days }] = await Promise.all([
    supabase.from('sessions').select('trainer_id').eq('id', sessionId).maybeSingle(),
    supabase.from('session_day_trainers').select('trainer_id').eq('session_id', sessionId),
  ]);
  const ok = s?.trainer_id === profile.trainer_id || ((days as any[]) || []).some((d) => d.trainer_id === profile.trainer_id);
  return ok ? profile : null;
}
