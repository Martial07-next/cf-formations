'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runDigiformaSync } from '@/lib/digiforma-sync';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { placeModuleRow } from '@/lib/digiforma-place';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Placer un module Digiforma sur le planning : la session est créée (dates du
 * module, vrais stagiaires à jour), rattachée à sa formation et à son parcours,
 * puis sa fiche s'ouvre pour choisir la salle et le formateur.
 */
export async function placeDigiformaModule(
  key: string,
  templateId: string | null = null,
  programId: string | null = null,
  choice?: { roomId: string | null; trainerId: string | null }
): Promise<Result<{ sessionId: string; warning?: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: m, error } = await supabase.from('digiforma_modules').select('*').eq('key', key).maybeSingle();
  if (error) return { ok: false, error: 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.' };
  if (!m) return { ok: false, error: 'Module introuvable : relance la synchronisation Digiforma.' };
  const prog = programId || (m as any).program_id || null;
  // Salle / formateur choisis : vérifiés AVANT de créer (salle prise, formateur déjà sur une autre session, absent…).
  if (choice && (choice.roomId || choice.trainerId)) {
    const { groupOf } = await import('@/lib/digiforma-place');
    const { findSessionConflict } = await import('@/lib/session-form');
    const { rows } = await groupOf(supabase, m, prog);
    const startAt = rows.map((x) => x.start_at).sort()[0];
    const endAt = rows.map((x) => x.end_at).sort().reverse()[0];
    const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
    const clash = await findSessionConflict(supabase, { room_id: choice.roomId || (holding as any)?.id, trainer_id: choice.trainerId || null, start_at: startAt, end_at: endAt });
    if (clash) return { ok: false, error: clash };
  }
  const r = await placeModuleRow(supabase, m, templateId, prog, undefined, choice);
  // Parcours choisi : retenu pour tous les modules de cette session Digiforma (semaines suivantes, stages).
  if (r.ok && prog) await supabase.from('digiforma_modules').update({ program_id: prog }).eq('df_session_id', (m as any).df_session_id);
  if (r.ok) revalidatePath('/');
  return r;
}

/** Retirer un module de la liste « à placer » (introuvable, inutile) ou le remettre. */
export async function dismissDigiformaModule(key: string, on: boolean): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('digiforma_modules').update({ covered_by: on ? 'dismissed' : null }).eq('key', key);
  if (error) return { ok: false, error: 'Exécute d’abord la migration 58 (supabase/migration_phase58.sql) dans Supabase.' };
  revalidatePath('/');
  return { ok: true };
}

/** Supprimer une session créée depuis Digiforma qu'on ne retrouve pas (salle jamais choisie). */
export async function deleteDigiformaSession(sessionId: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  await supabase.from('digiforma_modules').update({ placed_session_id: null, covered_by: 'dismissed' }).eq('placed_session_id', sessionId);
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/** Écart minimum entre deux synchronisations automatiques (ouverture / actualisation du planning). */
const AUTO_SYNC_MINUTES = 2;

/**
 * Synchronisation Digiforma lancée par l'ouverture ou l'actualisation du
 * planning, en arrière-plan. Une seule à la fois pour toute l'équipe (verrou
 * en base sur la date de la dernière synchronisation) et au plus une toutes
 * les 2 minutes : plusieurs onglets ouverts ne la lancent pas en double.
 * Durée limitée : ce qui n'a pas pu être lu est repris au passage suivant.
 */
export async function autoSyncDigiforma(): Promise<{ ran: boolean; changed: number }> {
  const none = { ran: false, changed: 0 };
  if (!process.env.DIGIFORMA_API_TOKEN) return none;
  const profile = await getCurrentProfile();
  if (!profile) return none;
  try {
    const admin = createAdminClient();
    const threshold = new Date(Date.now() - AUTO_SYNC_MINUTES * 60000).toISOString();
    const { data, error } = await admin
      .from('app_settings')
      .update({ digiforma_last_sync: new Date().toISOString() })
      .eq('id', true)
      .or(`digiforma_last_sync.is.null,digiforma_last_sync.lt.${threshold}`)
      .select('id');
    if (error || !data?.length) return none;
    const r = await runDigiformaSync(admin, 25_000);
    if (r.ok && r.changed) {
      revalidatePath('/');
      revalidatePath('/sessions');
    }
    return { ran: true, changed: r.ok ? r.changed : 0 };
  } catch {
    // Jamais bloquant : l'erreur est visible dans Administration › Intégrations.
    return none;
  }
}

/**
 * Bouton « Mettre à jour depuis Digiforma » de la fiche session : relit tout
 * de suite les stagiaires Digiforma de cette session (clients particuliers
 * compris) et ajoute ceux qui manquent, sans attendre la synchronisation.
 */
export async function refreshSessionFromDigiforma(
  sessionId: string
): Promise<Result<{ added: number; found: number; particuliers: number; waiting: number }>> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!process.env.DIGIFORMA_API_TOKEN) return { ok: false, error: 'Digiforma n’est pas connecté (clé à configurer dans Vercel).' };
  const supabase = await createClient();
  const [{ data: sess }, { data: mods }] = await Promise.all([
    supabase.from('sessions').select('id, start_at, end_at, digiforma_ref').eq('id', sessionId).maybeSingle(),
    supabase.from('digiforma_modules').select('key, df_session_id').eq('placed_session_id', sessionId),
  ]);
  if (!sess) return { ok: false, error: 'Session introuvable.' };
  // Sessions Digiforma liées : par les modules placés, sinon par l'identifiant saisi.
  const byDf = new Map<string, string[]>();
  for (const m of (mods as any[]) || []) byDf.set(m.df_session_id, [...(byDf.get(m.df_session_id) || []), m.key]);
  const ref = String((sess as any).digiforma_ref || '');
  if (!byDf.size && ref && !ref.includes(':')) byDf.set(ref, []);
  if (!byDf.size) return { ok: false, error: 'Cette session n’est reliée à aucune session Digiforma.' };

  const { digiformaSessionDetail, digiformaSessionModules, followsModule, withAttendance } = await import('@/lib/digiforma');
  const { addNewTrainees, presentOn, dfBlocksInRange, companiesFor, syncReservations } = await import('@/lib/digiforma-sync');
  const { writeSessionModules } = await import('@/lib/digiforma-place');
  const { People, isPlaceholder } = await import('@/lib/digiforma-people');
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  const trashed = new People();
  for (const t of (trashedRows as any[]) || []) trashed.add(t);

  const people = new Map<string, any>();
  const companies: any[] = [];
  const refBlocks: any[] = [];
  try {
    for (const [dfId, keys] of byDf) {
      const detail = await digiformaSessionDetail(dfId);
      let list = detail.trainees;
      let modNames: (string | null)[] | null = null;
      if (keys.length) {
        // Module par module : stagiaires prévus sur ses créneaux (émargement) et cochés sur ce module dans Digiforma.
        const sm = await digiformaSessionModules(dfId);
        const mine = sm.modules.filter((m) => keys.includes(`${dfId}:${m.key}`));
        const union = new Map<string, any>();
        for (const m of mine) {
          const present = presentOn(detail, m.slotIds);
          const own = detail.trainees.filter((t) => present(t.id) && followsModule(detail.subsOf, t.id, m.name));
          await supabase
            .from('digiforma_modules')
            .update({ trainees: own, ...(m.dayTimes?.length ? { df_days: withAttendance(m.dayTimes, detail.bySlot) } : {}) })
            .eq('key', `${dfId}:${m.key}`);
          for (const t of own) union.set(t.id, t);
        }
        if (mine.length) list = [...union.values()];
        modNames = mine.map((m) => m.name);
      } else {
        // Session reliée par son identifiant : modules Digiforma de ses dates.
        refBlocks.push(...dfBlocksInRange(await digiformaSessionModules(dfId), detail, (sess as any).start_at, (sess as any).end_at));
      }
      companies.push(...companiesFor(detail.companies, modNames));
      for (const t of list) if (!isPlaceholder(t) && !trashed.has(t)) people.set(t.email || t.id, t);
    }
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e?.message || 'lecture impossible'}` };
  }
  const found = [...people.values()];
  // Mise à jour venue de Digiforma : comme la synchronisation automatique (liste figée non concernée).
  const added = await addNewTrainees(createAdminClient(), sess as any, found);
  // Modules de la session et jours de présence de chacun, d'après Digiforma (émargement compris).
  const { data: onSess } = await supabase.from('digiforma_modules').select('*').eq('placed_session_id', sessionId);
  await writeSessionModules(supabase, sessionId, [
    ...((onSess as any[]) || []).map((x) => ({ name: x.name || '', start_at: x.start_at, end_at: x.end_at, trainees: x.trainees || [], days: x.df_days || undefined })),
    ...refBlocks,
  ]);
  // Places réservées par entreprise (apprenants prévus pas encore nommés).
  await syncReservations(supabase, sessionId, companies);
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return {
    ok: true,
    added,
    found: found.length,
    particuliers: found.filter((t) => t.particulier).length,
    waiting: found.filter((t) => t.status === 'en_attente').length,
  };
}

/**
 * Bouton « Modules de Digiforma » (fiche session) : remplace les modules de la
 * session par les vrais modules Digiforma (noms, jours, horaires), chaque
 * stagiaire inscrit à ceux qu'il suit sur Digiforma.
 */
export async function digiformaModulesForSession(sessionId: string): Promise<Result<{ count: number }>> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!process.env.DIGIFORMA_API_TOKEN) return { ok: false, error: 'Digiforma n’est pas connecté (clé à configurer dans Vercel).' };
  const supabase = await createClient();
  const [{ data: sess }, { data: mods }] = await Promise.all([
    supabase.from('sessions').select('id, start_at, end_at, digiforma_ref').eq('id', sessionId).maybeSingle(),
    supabase.from('digiforma_modules').select('df_session_id').eq('placed_session_id', sessionId),
  ]);
  if (!sess) return { ok: false, error: 'Session introuvable.' };
  const dfIds = new Set(((mods as any[]) || []).map((m) => String(m.df_session_id)));
  const ref = String((sess as any).digiforma_ref || '');
  if (ref) dfIds.add(ref.split(':')[0]);
  if (!dfIds.size) return { ok: false, error: 'Cette session n’est reliée à aucune session Digiforma.' };
  const { digiformaSessionDetail, digiformaSessionModules, toWallClock, followsModule, withAttendance } = await import('@/lib/digiforma');
  const { writeSessionModules } = await import('@/lib/digiforma-place');
  const { presentOn } = await import('@/lib/digiforma-sync');
  const a = String((sess as any).start_at).slice(0, 10);
  const b = String((sess as any).end_at).slice(0, 10);
  const blocks: { name: string; start_at: string; end_at: string; trainees: any[]; days?: any[] | null }[] = [];
  try {
    for (const id of dfIds) {
      const [sm, detail] = await Promise.all([digiformaSessionModules(id), digiformaSessionDetail(id)]);
      for (const m of sm.modules) {
        if (!m.name || m.start.slice(0, 10) > b || (m.end || m.start).slice(0, 10) < a) continue;
        const present = presentOn(detail, m.slotIds);
        blocks.push({
          name: m.name,
          start_at: toWallClock(m.start, m.startTime, '08:00'),
          end_at: toWallClock(m.end || m.start, m.endTime, '16:00'),
          trainees: detail.trainees.filter((t) => present(t.id) && followsModule(detail.subsOf, t.id, m.name)),
          days: (m.dayTimes && withAttendance(m.dayTimes, detail.bySlot)) || m.days || null,
        });
      }
    }
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e?.message || 'lecture impossible'}` };
  }
  if (new Set(blocks.map((x) => x.name)).size < 2)
    return { ok: false, error: 'Digiforma n’a pas plusieurs modules nommés sur les dates de cette session (vérifie les noms des modules dans « Dates et prix »).' };
  const count = await writeSessionModules(supabase, sessionId, blocks, true);
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return { ok: true, count };
}
