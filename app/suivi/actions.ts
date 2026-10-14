'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 24 (supabase/migration_phase24.sql) dans Supabase.';

function refresh(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/suivi');
  revalidatePath('/');
}

/** Gestionnaire de la session (par défaut : la personne qui l'a créée). */
export async function setSessionManager(sessionId: string, profileId: string | null): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ manager_id: profileId || null }).eq('id', sessionId);
  if (error) return { ok: false, error: MIGRATION };
  refresh(sessionId);
  return { ok: true };
}

/** Qui relance ce stagiaire en attente. */
export async function setFollowupOwner(sessionId: string, traineeId: string, profileId: string | null): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from('session_trainees')
    .update({ followup_by: profileId || null })
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: MIGRATION };
  refresh(sessionId);
  return { ok: true };
}

/** « Relancé » : compte la relance, avec la date, la personne et une note facultative. */
export async function recordFollowup(sessionId: string, traineeId: string, note: string): Promise<Result> {
  const profile = await requireManager();
  if (!profile) return FORBIDDEN;
  const supabase = await createClient();
  const { data: row, error: readError } = await supabase
    .from('session_trainees')
    .select('followup_count, followup_by')
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId)
    .maybeSingle();
  if (readError || !row) return { ok: false, error: readError ? MIGRATION : 'Inscription introuvable.' };
  const { error } = await supabase
    .from('session_trainees')
    .update({
      followup_count: (row.followup_count || 0) + 1,
      last_followup_at: new Date().toISOString(),
      last_followup_by: profile.id,
      followup_note: note.trim().slice(0, 500) || null,
      // Personne n'était chargé de la relance : celui qui relance s'en occupe.
      ...(row.followup_by ? {} : { followup_by: profile.id }),
    })
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: error.message };
  refresh(sessionId);
  return { ok: true };
}
