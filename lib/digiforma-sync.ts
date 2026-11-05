import { markHolidaysAccounted } from '@/lib/holiday-shifts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { digiformaFetchSessionTrainees, digiformaListSessionDates, isPlannedStatus } from '@/lib/digiforma';
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
 * avec leurs stagiaires. Une session déjà importée n'est jamais écrasée : seuls
 * les nouveaux stagiaires inscrits ensuite sur Digiforma y sont ajoutés.
 *
 * Fonction serveur ordinaire (pas une Server Action) : elle n'est appelable
 * que par l'action admin `syncDigiformaNow` ou par la route cron protégée.
 */
export async function runDigiformaSync(supabase: SupabaseClient, budgetMs = 40_000): Promise<SyncResult> {
  // Temps limité (la plateforme coupe à 60 s) : ce qui reste est repris à la synchronisation suivante.
  const deadline = Date.now() + budgetMs;
  const { data: holdingRoom } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holdingRoom) {
    return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };
  }

  let sessions;
  let listed;
  try {
    // Requête légère (sans les stagiaires) : les stagiaires ne sont chargés que pour les sessions à importer.
    listed = await digiformaListSessionDates();
    sessions = listed.sessions;
  } catch (e: any) {
    await logSync(supabase, 'error', e.message);
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  const { data: existingRefs } = await supabase
    .from('sessions')
    .select('id, digiforma_ref, start_at, end_at')
    .not('digiforma_ref', 'is', null);
  const known = new Set((existingRefs || []).map((r: any) => r.digiforma_ref));
  const knownRows = (existingRefs as any[]) || [];

  const now = Date.now();
  let created = 0;
  let traineesLinked = 0;
  let skipped = 0;
  let past = 0;
  let heldBack = 0;
  let remaining = 0;
  let notPlanned = 0;
  const seenStatus = new Map<string, number>();

  for (const s of sessions) {
    if (known.has(s.id)) {
      skipped++;
      continue;
    }
    // Seulement les sessions planifiées sur Digiforma.
    if (listed.hasStatus) {
      const st = s.status || '(vide)';
      seenStatus.set(st, (seenStatus.get(st) || 0) + 1);
      if (!isPlannedStatus(s.status)) {
        notPlanned++;
        continue;
      }
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
    if (Date.now() > deadline) {
      remaining++;
      continue; // plus le temps : reprise à la prochaine synchronisation
    }
    let sTrainees: Awaited<ReturnType<typeof digiformaFetchSessionTrainees>>;
    try {
      sTrainees = await digiformaFetchSessionTrainees(s.id);
    } catch {
      sTrainees = [];
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
    // Dates venues de Digiforma : les fériés de la période y sont déjà pris en compte.
    await markHolidaysAccounted(supabase, newSession.id).catch(() => null);

    for (const t of sTrainees) {
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

  // Sessions déjà importées et pas encore terminées : nouveaux stagiaires inscrits sur Digiforma
  // ajoutés au planning (aucun stagiaire n'est retiré, aucun statut n'est modifié).
  let addedLater = 0;
  let notRefreshed = 0;
  for (const row of knownRows.filter((r) => new Date(r.end_at).getTime() >= now)) {
    if (Date.now() > deadline) {
      notRefreshed++;
      continue;
    }
    let remote: Awaited<ReturnType<typeof digiformaFetchSessionTrainees>>;
    try {
      remote = await digiformaFetchSessionTrainees(row.digiforma_ref);
    } catch {
      continue;
    }
    if (!remote.length) continue;
    const { data: links } = await supabase
      .from('session_trainees')
      .select('trainee_id, trainees(email, full_name, first_name, last_name)')
      .eq('session_id', row.id);
    const emails = new Set<string>();
    const names = new Set<string>();
    for (const l of (links as any[]) || []) {
      const t = Array.isArray(l.trainees) ? l.trainees[0] : l.trainees;
      if (t?.email) emails.add(String(t.email).trim().toLowerCase());
      for (const n of [t?.full_name, `${t?.first_name || ''} ${t?.last_name || ''}`]) if (n && n.trim()) names.add(nameKey(n));
    }
    for (const t of remote) {
      if (t.email && emails.has(t.email.trim().toLowerCase())) continue;
      if (names.has(nameKey(`${t.firstName || ''} ${t.lastName || ''}`))) continue;
      const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
      if (!trainee) continue;
      const conflict = await findTraineeConflict(supabase, trainee.id, row.start_at, row.end_at, row.id);
      const { data: ins, error: linkError } = await supabase
        .from('session_trainees')
        .upsert({ session_id: row.id, trainee_id: trainee.id, status: conflict ? 'en_attente' : 'validee' }, { onConflict: 'session_id,trainee_id', ignoreDuplicates: true })
        .select('trainee_id');
      if (!linkError && (ins as any[] | null)?.length) addedLater++;
    }
  }

  const log =
    `${created} session(s) à venir ajoutée(s) au planning, ${traineesLinked} inscription(s) stagiaire ` +
    `(dont ${heldBack} en attente pour conflit de créneau), ${past} session(s) passée(s) ignorée(s), ` +
    `${skipped} déjà connue(s) ou incomplète(s).` +
    (remaining ? ` ${remaining} session(s) restante(s) : relance la synchronisation pour les importer.` : '') +
    ` ${addedLater} stagiaire(s) ajouté(s) depuis Digiforma aux sessions déjà importées.` +
    (notRefreshed ? ` ${notRefreshed} session(s) importée(s) pas encore relue(s) : relance la synchronisation.` : '') +
    (listed.hasStatus
      ? ` ${notPlanned} session(s) non planifiée(s) ignorée(s). Statuts Digiforma : ${[...seenStatus].map(([k, n]) => `${k} (${n})`).join(', ') || 'aucun'}.`
      : ' Statut Digiforma introuvable : sessions avec des dates importées.');
  await logSync(supabase, 'ok', log);
  return { ok: true, created, traineesLinked, skipped, past, log };
}

async function logSync(supabase: SupabaseClient, status: 'ok' | 'error', log: string) {
  await supabase
    .from('app_settings')
    .update({ digiforma_last_sync: new Date().toISOString(), digiforma_last_sync_status: status, digiforma_last_sync_log: log })
    .eq('id', true);
}

/** Nom comparable : sans accents, minuscules, mots triés (« Léa MARTIN » = « MARTIN Lea »). */
function nameKey(v: string) {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[\s-]+/).filter(Boolean).sort().join(' ');
}
