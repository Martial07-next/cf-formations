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

  const { digiformaSessionDetail, digiformaSessionModules } = await import('@/lib/digiforma');
  const { refreshPlacedSession } = await import('@/lib/digiforma-sync');
  const { isPlaceholder } = await import('@/lib/digiforma-people');
  const { data: placedRows } = await supabase.from('digiforma_modules').select('name, df_session_id').eq('placed_session_id', sessionId);
  const admin = createAdminClient();
  const people = new Map<string, any>();
  let added = 0;
  try {
    for (const dfId of byDf.keys()) {
      // Tout relu sur Digiforma : stagiaires (prospects compris), modules et qui suit quoi, places réservées par entreprise.
      const [detail, sm] = await Promise.all([digiformaSessionDetail(dfId), digiformaSessionModules(dfId)]);
      const names = ((placedRows as any[]) || []).filter((r) => r.df_session_id === dfId).map((r) => r.name);
      await refreshPlacedSession(admin, sess as any, sm, detail, names, (n) => (added += n));
      for (const t of detail.trainees) if (!isPlaceholder(t)) people.set(t.id, t);
    }
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e?.message || 'lecture impossible'}` };
  }
  const found = [...people.values()];
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

/** Bouton « Diagnostic Digiforma » (fiche session) : ce que Digiforma renvoie pour la session, en texte. */
export async function digiformaDiagnostic(sessionId: string): Promise<Result<{ text: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!process.env.DIGIFORMA_API_TOKEN) return { ok: false, error: 'Digiforma n’est pas connecté (clé à configurer dans Vercel).' };
  const supabase = await createClient();
  const [{ data: sess }, { data: mods }] = await Promise.all([
    supabase.from('sessions').select('id, title, start_at, end_at, digiforma_ref').eq('id', sessionId).maybeSingle(),
    supabase.from('digiforma_modules').select('df_session_id').eq('placed_session_id', sessionId),
  ]);
  if (!sess) return { ok: false, error: 'Session introuvable.' };
  const dfIds = new Set(((mods as any[]) || []).map((m) => String(m.df_session_id)));
  const ref = String((sess as any).digiforma_ref || '');
  if (ref) dfIds.add(ref.split(':')[0]);
  const lines: string[] = [`Plateforme : ${(sess as any).title} · ${String((sess as any).start_at).slice(0, 16)} → ${String((sess as any).end_at).slice(0, 16)} · réf ${ref || '(aucune)'}`];
  const [{ data: sm }, { data: res }, { data: st }, { data: lastSync }] = await Promise.all([
    supabase.from('session_modules').select('name, start_day, end_day, duration_hours').eq('session_id', sessionId).order('position'),
    supabase.from('session_reservations').select('company, seats, status, note').eq('session_id', sessionId),
    supabase.from('session_trainees').select('status, trainees(full_name, company)').eq('session_id', sessionId),
    supabase.from('app_settings').select('digiforma_last_sync, digiforma_last_sync_status, digiforma_last_sync_log').eq('id', true).maybeSingle(),
  ]);
  lines.push(`Modules plateforme : ${((sm as any[]) || []).map((m) => `${m.name} ${m.start_day}→${m.end_day} ${m.duration_hours ?? '?'}h`).join(' ; ') || '(aucun)'}`);
  {
    const { data: stm } = await supabase.from('session_trainee_modules').select('module_id, trainees(full_name), session_modules(name)').eq('session_id', sessionId);
    lines.push(`Modules suivis (lignes) : ${((stm as any[]) || []).map((l) => `${(Array.isArray(l.trainees) ? l.trainees[0] : l.trainees)?.full_name} → ${(Array.isArray(l.session_modules) ? l.session_modules[0] : l.session_modules)?.name}`).join(' ; ') || '(aucune : chacun suit tous les modules)'}`);
  }
  lines.push(`Réservations : ${((res as any[]) || []).map((r) => `${r.company} ${r.seats} ${r.status || ''}${r.note ? ' (synchro)' : ''}`).join(' ; ') || '(aucune)'}`);
  lines.push(`Stagiaires plateforme : ${((st as any[]) || []).map((l) => { const t = Array.isArray(l.trainees) ? l.trainees[0] : l.trainees; return `${t?.full_name} [${l.status}${t?.company ? ` · ${t.company}` : ''}]`; }).join(' ; ')}`);
  lines.push(`Dernière synchro : ${(lastSync as any)?.digiforma_last_sync || '?'} ${(lastSync as any)?.digiforma_last_sync_status || ''} · ${(lastSync as any)?.digiforma_last_sync_log || ''}`);
  if (!dfIds.size) {
    lines.push('Aucune session Digiforma reliée à cette session.');
    return { ok: true, text: lines.join('\n') };
  }
  const { digiformaDebugSession } = await import('@/lib/digiforma');
  for (const id of dfIds) {
    const { data: rows } = await supabase.from('digiforma_modules').select('key, name, start_at, end_at, placed_session_id, trainees, df_days').eq('df_session_id', id);
    lines.push(`\nModules Digiforma enregistrés (${id}) : ${((rows as any[]) || []).map((r) => `${r.name} ${String(r.start_at).slice(0, 10)}→${String(r.end_at).slice(0, 10)} ${((r.trainees as any[]) || []).length} stag. ${r.placed_session_id === sessionId ? '[cette session]' : r.placed_session_id ? '[autre session]' : '[à placer]'}`).join(' ; ') || '(aucun)'}`);
    try {
      lines.push(await digiformaDebugSession(id));
    } catch (e: any) {
      lines.push(`Diagnostic ${id} : ERREUR ${e?.message || e}`);
    }
  }
  return { ok: true, text: lines.join('\n') };
}
