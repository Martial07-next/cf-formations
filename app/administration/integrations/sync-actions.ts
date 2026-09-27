'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { findTraineeConflict } from '@/app/sessions/[id]/actions';

export type SyncResult =
  | { ok: true; created: number; traineesLinked: number; skipped: number; log: string }
  | { ok: false; error: string };

/**
 * Récupère les sessions Digiforma non encore connues (par digiforma_ref) et les
 * crée dans le planning, salle "À affecter" par défaut, avec leurs stagiaires
 * (statut "validée"). N'écrase jamais une session déjà importée.
 *
 * `client` : le client Supabase à utiliser. Par défaut celui de la requête en
 * cours (session admin connecté, via le bouton "Synchroniser maintenant").
 * Le cron quotidien passe explicitement un client service_role (voir
 * lib/supabase/admin.ts) car il n'a pas de session utilisateur.
 */
export async function runDigiformaSync(client?: Awaited<ReturnType<typeof createClient>>): Promise<SyncResult> {
  const supabase = client || (await createClient());

  const { data: holdingRoom } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holdingRoom) {
    return { ok: false, error: "Salle d'attente introuvable — exécute migration_phase6.sql." };
  }

  const { digiformaListTrainingSessions } = await import('@/lib/digiforma');
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

  let created = 0;
  let traineesLinked = 0;
  let skipped = 0;
  let heldBack = 0;

  for (const s of sessions) {
    if (known.has(s.id)) {
      skipped++;
      continue;
    }
    if (!s.startAt || !s.endAt) {
      skipped++;
      continue; // dates incomplètes côté Digiforma, on ne peut pas la placer dans le planning
    }

    const { data: newSession, error } = await supabase
      .from('sessions')
      .insert({
        title: s.name,
        room_id: holdingRoom.id,
        start_at: s.startAt,
        end_at: s.endAt,
        status: 'planifiee',
        digiforma_ref: s.id,
        notes: 'Importée automatiquement de Digiforma — salle à réaffecter.',
      })
      .select('id')
      .single();

    if (error || !newSession) continue;
    created++;

    for (const t of s.trainees) {
      let traineeId: string | null = null;
      if (t.email) {
        const { data } = await supabase.from('trainees').select('id').ilike('email', t.email).maybeSingle();
        traineeId = data?.id || null;
      }
      if (!traineeId) {
        const { data } = await supabase.from('trainees').select('id').ilike('full_name', t.fullName).maybeSingle();
        traineeId = data?.id || null;
      }
      if (!traineeId) {
        const { data } = await supabase.from('trainees').insert({ full_name: t.fullName, email: t.email }).select('id').single();
        traineeId = data?.id || null;
      }
      if (!traineeId) continue;

      let traineeStatus: 'validee' | 'en_attente' = 'validee';
      const conflict = await findTraineeConflict(supabase, traineeId, s.startAt, s.endAt, newSession.id);
      if (conflict) {
        traineeStatus = 'en_attente';
        heldBack++;
      }

      const { error: linkError } = await supabase
        .from('session_trainees')
        .upsert({ session_id: newSession.id, trainee_id: traineeId, status: traineeStatus }, { onConflict: 'session_id,trainee_id' });
      if (!linkError) traineesLinked++;
    }
  }

  const log = `${created} session(s) importée(s), ${traineesLinked} inscription(s) stagiaire (dont ${heldBack} mise(s) en attente pour conflit de créneau), ${skipped} déjà connue(s)/ignorée(s).`;
  await logSync(supabase, 'ok', log);

  revalidatePath('/');
  revalidatePath('/sessions');
  revalidatePath('/administration/integrations');
  return { ok: true, created, traineesLinked, skipped, log };
}

async function logSync(supabase: Awaited<ReturnType<typeof createClient>>, status: 'ok' | 'error', log: string) {
  await supabase
    .from('app_settings')
    .update({ digiforma_last_sync: new Date().toISOString(), digiforma_last_sync_status: status, digiforma_last_sync_log: log })
    .eq('id', true);
}
