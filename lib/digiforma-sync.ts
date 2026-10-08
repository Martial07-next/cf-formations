import type { SupabaseClient } from '@supabase/supabase-js';
import { digiformaListTrainingSessions } from '@/lib/digiforma';
import { findOrCreateTrainee, findTraineeConflict } from '@/lib/trainee-conflict';

export type SyncResult =
  | { ok: true; created: number; traineesLinked: number; skipped: number; past: number; log: string }
  | { ok: false; error: string };

/**
 * Relais Digiforma → planning.
 *
 * Récupère les sessions Digiforma et crée dans le planning celles qui :
 *   · ne sont pas encore connues (par digiforma_ref) ;
 *   · ne sont PAS encore passées (date de fin >= maintenant).
 * Elles arrivent dans la salle « À affecter » avec le statut « En attente »,
 * avec leurs stagiaires. Une session déjà importée n'est jamais écrasée.
 *
 * Fonction serveur ordinaire (pas une Server Action) : elle n'est appelable
 * que par l'action admin `syncDigiformaNow` ou par la route cron protégée.
 */
export async function runDigiformaSync(supabase: SupabaseClient): Promise<SyncResult> {
  const { data: holdingRoom } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holdingRoom) {
    return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };
  }

  let sessions;
  try {
    sessions = await digiformaListTrainingSessions();
  } catch (e: any) {
    await logSync(supabase, 'error', e.message);
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  const { data: existingRefs } = await supabase
    .from('sessions')
    .select('digiforma_ref')
    .not('digiforma_ref', 'is', null);
  const known = new Set((existingRefs || []).map((r: any) => r.digiforma_ref));

  const now = Date.now();
  let created = 0;
  let traineesLinked = 0;
  let skipped = 0;
  let past = 0;
  let heldBack = 0;

  for (const s of sessions) {
    if (known.has(s.id)) {
      skipped++;
      continue;
    }
    const start = s.startAt ? new Date(s.startAt) : null;
    const end = s.endAt ? new Date(s.endAt) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      skipped++;
      continue; // dates absentes ou incohérentes : impossible de placer la session
    }
    if (end.getTime() < now) {
      past++;
      continue; // session déjà passée : on ne l'ajoute pas au planning
    }

    const { data: newSession, error } = await supabase
      .from('sessions')
      .insert({
        title: s.name,
        room_id: holdingRoom.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: 'planifiee',
        digiforma_ref: s.id,
        notes: 'Importée automatiquement de Digiforma, salle à affecter.',
      })
      .select('id')
      .single();

    if (error || !newSession) continue;
    created++;

    for (const t of s.trainees) {
      const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
      if (!trainee) continue;

      let traineeStatus: 'validee' | 'en_attente' = 'validee';
      const conflict = await findTraineeConflict(supabase, trainee.id, start.toISOString(), end.toISOString(), newSession.id);
      if (conflict) {
        traineeStatus = 'en_attente';
        heldBack++;
      }

      const { error: linkError } = await supabase
        .from('session_trainees')
        .upsert({ session_id: newSession.id, trainee_id: trainee.id, status: traineeStatus }, { onConflict: 'session_id,trainee_id' });
      if (!linkError) traineesLinked++;
    }
  }

  const log =
    `${created} session(s) à venir ajoutée(s) au planning, ${traineesLinked} inscription(s) stagiaire ` +
    `(dont ${heldBack} en attente pour conflit de créneau), ${past} session(s) passée(s) ignorée(s), ` +
    `${skipped} déjà connue(s) ou incomplète(s).`;
  await logSync(supabase, 'ok', log);
  return { ok: true, created, traineesLinked, skipped, past, log };
}

async function logSync(supabase: SupabaseClient, status: 'ok' | 'error', log: string) {
  await supabase
    .from('app_settings')
    .update({ digiforma_last_sync: new Date().toISOString(), digiforma_last_sync_status: status, digiforma_last_sync_log: log })
    .eq('id', true);
}
