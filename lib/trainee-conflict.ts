import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFullName, isDuplicateError, type TraineeName } from '@/lib/trainee-name';

/**
 * Cherche si `traineeId` est déjà VALIDÉ sur une autre session dont le
 * créneau chevauche [startAt, endAt]. Un stagiaire ne peut pas suivre deux
 * formations en même temps.
 * (Fonction serveur ordinaire, volontairement hors d'un fichier 'use server'
 * pour ne pas être exposée comme Server Action.)
 */
export async function findTraineeConflict(
  supabase: SupabaseClient,
  traineeId: string,
  startAt: string,
  endAt: string,
  excludeSessionId?: string
): Promise<{ sessionId: string; title: string } | null> {
  const { data } = await supabase
    .from('session_trainees')
    .select('status, sessions(id, title, start_at, end_at)')
    .eq('trainee_id', traineeId)
    .eq('status', 'validee');

  for (const row of data || []) {
    const s: any = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!s || s.id === excludeSessionId) continue;
    if (new Date(s.start_at) < new Date(endAt) && new Date(s.end_at) > new Date(startAt)) {
      return { sessionId: s.id, title: s.title };
    }
  }
  return null;
}

/** Échappe les jokers de ILIKE (% et _) pour une comparaison exacte insensible à la casse. */
function exact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Retrouve un stagiaire par e-mail puis par nom exact, sinon le crée. */
export async function findOrCreateTrainee(
  supabase: SupabaseClient,
  name: TraineeName,
  email: string | null,
  company: string | null = null
): Promise<{ id: string; created: boolean } | null> {
  const fullName = buildFullName(name);
  if (!fullName) return null;
  if (email) {
    const { data } = await supabase.from('trainees').select('id').ilike('email', exact(email)).limit(1).maybeSingle();
    if (data) return { id: data.id, created: false };
  }
  const { data: byName } = await supabase.from('trainees').select('id').ilike('full_name', exact(fullName)).limit(1).maybeSingle();
  if (byName) return { id: byName.id, created: false };

  const { data, error } = await supabase
    .from('trainees')
    .insert({ full_name: fullName, first_name: name.first_name, last_name: name.last_name, email, company })
    .select('id')
    .single();
  if (isDuplicateError(error)) {
    // Créé entre-temps (ou nom identique à des espaces/majuscules près) : on réutilise la fiche.
    const { data: again } = await supabase.from('trainees').select('id').ilike('full_name', exact(fullName)).limit(1).maybeSingle();
    return again ? { id: again.id, created: false } : null;
  }
  if (error || !data) return null;
  return { id: data.id, created: true };
}
