import type { SupabaseClient } from '@supabase/supabase-js';
import { digiformaFetchSessionTrainees, digiformaListModules, digiformaSessionDetail, isPlannedStatus, toWallClock, type DigiformaTrainee } from '@/lib/digiforma';
import { findOrCreateTrainee, findTraineeConflict } from '@/lib/trainee-conflict';

export type SyncResult =
  | { ok: true; created: number; traineesLinked: number; skipped: number; past: number; log: string }
  | { ok: false; error: string };

/** Modules suivis : ceux qui commencent dans les 6 prochains mois. */
const HORIZON_DAYS = 183;

/**
 * Relais Digiforma → planning (migration 57).
 *
 * Une session Digiforma peut s'étaler sur un an : on ne la pose pas telle
 * quelle sur le planning. On enregistre ses MODULES (dates réelles et
 * stagiaires à jour) dans « digiforma_modules » ; le bureau place ensuite,
 * semaine par semaine, ceux qui ont lieu (section sous le planning).
 *   · seulement les sessions planifiées sur Digiforma ;
 *   · seulement les modules pas encore passés (6 mois à l'avance) ;
 *   · stagiaires relus à chaque passage : un stagiaire parti n'est plus
 *     proposé, un nouveau inscrit est ajouté aux modules déjà placés.
 * Fonction serveur ordinaire : appelée par l'action admin ou par le cron.
 */
export async function runDigiformaSync(supabase: SupabaseClient, budgetMs = 40_000): Promise<SyncResult> {
  const deadline = Date.now() + budgetMs;
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000).toISOString().slice(0, 10);

  let listed;
  try {
    listed = await digiformaListModules();
  } catch (e: any) {
    await logSync(supabase, 'error', e.message);
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  const probe = await supabase.from('digiforma_modules').select('key').limit(1);
  if (probe.error) {
    const msg = 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.';
    await logSync(supabase, 'error', msg);
    return { ok: false, error: msg };
  }

  // Sessions planifiées, avec des modules à venir (ou la session entière si l'API n'a pas de modules).
  const seenStatus = new Map<string, number>();
  let notPlanned = 0;
  let past = 0;
  const todo: { id: string; name: string; modules: { key: string; name: string | null; start_at: string; end_at: string; whole: boolean }[] }[] = [];
  for (const s of listed.sessions) {
    if (listed.hasStatus) {
      const st = s.status || '(vide)';
      seenStatus.set(st, (seenStatus.get(st) || 0) + 1);
      if (!isPlannedStatus(s.status)) {
        notPlanned++;
        continue;
      }
    }
    const raw = s.modules.length
      ? s.modules.map((m) => ({ key: `${s.id}:${m.key}`, name: m.name, start_at: toWallClock(m.start, m.startTime, '08:00'), end_at: toWallClock(m.end || m.start, m.endTime, '16:00'), whole: false }))
      : s.startAt && s.endAt
        ? [{ key: `${s.id}:session`, name: null, start_at: toWallClock(s.startAt, null, '08:00'), end_at: toWallClock(s.endAt, null, '16:00'), whole: true }]
        : [];
    const upcoming = raw.filter((m) => m.end_at.slice(0, 10) >= today && m.start_at.slice(0, 10) <= horizon && m.end_at >= m.start_at);
    past += raw.length - upcoming.length;
    if (upcoming.length) todo.push({ id: s.id, name: s.name, modules: upcoming });
  }
  // Les plus proches d'abord (si le temps manque, la suite est reprise au prochain passage).
  todo.sort((a, b) => a.modules[0].start_at.localeCompare(b.modules[0].start_at));

  let modulesSaved = 0;
  let remaining = 0;
  for (const s of todo) {
    if (Date.now() > deadline) {
      remaining++;
      continue;
    }
    let detail: { trainees: DigiformaTrainee[]; byModule: Record<string, DigiformaTrainee[]> };
    try {
      detail = await digiformaSessionDetail(s.id);
    } catch {
      continue;
    }
    const rows = s.modules.map((m) => {
      const own = detail.byModule[m.key.slice(s.id.length + 1)];
      return {
        key: m.key,
        df_session_id: s.id,
        df_session_name: s.name,
        name: m.name,
        start_at: m.start_at,
        end_at: m.end_at,
        trainees: own && own.length ? own : detail.trainees,
        whole_session: m.whole,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from('digiforma_modules').upsert(rows, { onConflict: 'key' });
    if (error) continue;
    modulesSaved += rows.length;
    // Modules disparus de Digiforma (pas encore placés) : retirés.
    const keep = rows.map((r) => r.key);
    await supabase
      .from('digiforma_modules')
      .delete()
      .eq('df_session_id', s.id)
      .is('placed_session_id', null)
      .gte('end_at', `${today}T00:00:00`)
      .not('key', 'in', `(${keep.map((k) => `"${k.replace(/"/g, '')}"`).join(',')})`);
  }
  // Modules passés jamais placés : plus utiles.
  await supabase.from('digiforma_modules').delete().is('placed_session_id', null).lt('end_at', `${today}T00:00:00`);

  // Modules déjà placés et pas terminés : nouveaux stagiaires ajoutés à la session du planning.
  let addedLater = 0;
  const { data: placed } = await supabase
    .from('digiforma_modules')
    .select('trainees, placed_session_id, sessions:placed_session_id(id, start_at, end_at)')
    .not('placed_session_id', 'is', null)
    .gte('end_at', `${today}T00:00:00`);
  for (const p of (placed as any[]) || []) {
    if (Date.now() > deadline) break;
    const sess = Array.isArray(p.sessions) ? p.sessions[0] : p.sessions;
    if (!sess) continue;
    addedLater += await addNewTrainees(supabase, sess, (p.trainees as DigiformaTrainee[]) || []);
  }
  // Sessions reliées à une session Digiforma par leur référence (saisie sur la fiche).
  const { data: refRows } = await supabase.from('sessions').select('id, digiforma_ref, start_at, end_at').not('digiforma_ref', 'is', null).gte('end_at', `${today}T00:00:00`);
  for (const row of (refRows as any[]) || []) {
    if (Date.now() > deadline) break;
    if (String(row.digiforma_ref).includes(':')) continue; // module placé : traité ci-dessus
    try {
      addedLater += await addNewTrainees(supabase, row, await digiformaFetchSessionTrainees(row.digiforma_ref));
    } catch {
      // session introuvable sur Digiforma : ignorée
    }
  }

  const log =
    `${modulesSaved} module(s) à venir relu(s) sur ${todo.length} session(s) planifiée(s). ` +
    `${addedLater} stagiaire(s) ajouté(s) depuis Digiforma aux sessions déjà placées. ` +
    `${past} module(s) passé(s) ou lointain(s) ignoré(s).` +
    (remaining ? ` ${remaining} session(s) restante(s) : relance la synchronisation.` : '') +
    (listed.hasStatus
      ? ` ${notPlanned} session(s) non planifiée(s) ignorée(s). Statuts Digiforma : ${[...seenStatus].map(([k, n]) => `${k} (${n})`).join(', ') || 'aucun'}.`
      : ' Statut Digiforma introuvable : toutes les sessions avec des dates sont prises.') +
    (listed.hasModules ? '' : ' Aucun champ « modules » trouvé dans l’API : sessions entières utilisées.');
  await logSync(supabase, 'ok', log);
  return { ok: true, created: modulesSaved, traineesLinked: addedLater, skipped: notPlanned, past, log };
}

/** Ajoute à une session du planning les stagiaires Digiforma qui n'y sont pas encore (jamais de retrait). */
export async function addNewTrainees(supabase: SupabaseClient, row: { id: string; start_at: string; end_at: string }, remote: DigiformaTrainee[]): Promise<number> {
  if (!remote.length) return 0;
  const { data: links } = await supabase.from('session_trainees').select('trainee_id, trainees(email, full_name, first_name, last_name)').eq('session_id', row.id);
  const emails = new Set<string>();
  const names = new Set<string>();
  for (const l of (links as any[]) || []) {
    const t = Array.isArray(l.trainees) ? l.trainees[0] : l.trainees;
    if (t?.email) emails.add(String(t.email).trim().toLowerCase());
    for (const n of [t?.full_name, `${t?.first_name || ''} ${t?.last_name || ''}`]) if (n && n.trim()) names.add(nameKey(n));
  }
  let added = 0;
  for (const t of remote) {
    if (t.email && emails.has(t.email.trim().toLowerCase())) continue;
    if (names.has(nameKey(`${t.firstName || ''} ${t.lastName || ''}`))) continue;
    const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
    if (!trainee) continue;
    const conflict = await findTraineeConflict(supabase, trainee.id, row.start_at, row.end_at, row.id);
    const { data: ins, error } = await supabase
      .from('session_trainees')
      .upsert({ session_id: row.id, trainee_id: trainee.id, status: conflict ? 'en_attente' : 'validee' }, { onConflict: 'session_id,trainee_id', ignoreDuplicates: true })
      .select('trainee_id');
    if (!error && (ins as any[] | null)?.length) added++;
  }
  return added;
}

async function logSync(supabase: SupabaseClient, status: 'ok' | 'error', log: string) {
  await supabase
    .from('app_settings')
    .update({ digiforma_last_sync: new Date().toISOString(), digiforma_last_sync_status: status, digiforma_last_sync_log: log })
    .eq('id', true);
}

/** Nom comparable : sans accents, minuscules, mots triés (« Léa MARTIN » = « MARTIN Lea »). */
function nameKey(v: string) {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s-]+/).filter(Boolean).sort().join(' ');
}
