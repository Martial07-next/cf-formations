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
export async function placeDigiformaModule(key: string, templateId: string | null = null, programId: string | null = null): Promise<Result<{ sessionId: string }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: m, error } = await supabase.from('digiforma_modules').select('*').eq('key', key).maybeSingle();
  if (error) return { ok: false, error: 'Exécute d’abord la migration 57 (supabase/migration_phase57.sql) dans Supabase.' };
  if (!m) return { ok: false, error: 'Module introuvable : relance la synchronisation Digiforma.' };
  const prog = programId || (m as any).program_id || null;
  const r = await placeModuleRow(supabase, m, templateId, prog);
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
  const { addNewTrainees } = await import('@/lib/digiforma-sync');
  const { People, isPlaceholder } = await import('@/lib/digiforma-people');
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  const trashed = new People();
  for (const t of (trashedRows as any[]) || []) trashed.add(t);

  const people = new Map<string, any>();
  try {
    for (const [dfId, keys] of byDf) {
      const detail = await digiformaSessionDetail(dfId);
      let list = detail.trainees;
      if (keys.length) {
        // Seulement les stagiaires prévus sur les créneaux des modules de cette session.
        const sm = await digiformaSessionModules(dfId);
        const slotIds = sm.modules.filter((m) => keys.includes(`${dfId}:${m.key}`)).flatMap((m) => m.slotIds || []);
        const known = slotIds.filter((id) => id in detail.bySlot);
        if (known.length) {
          const present = new Set(known.flatMap((id) => detail.bySlot[id]));
          list = list.filter((t) => present.has(t.id));
        }
        await supabase.from('digiforma_modules').update({ trainees: list }).in('key', keys);
      }
      for (const t of list) if (!isPlaceholder(t) && !trashed.has(t)) people.set(t.email || t.id, t);
    }
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e?.message || 'lecture impossible'}` };
  }
  const found = [...people.values()];
  // Mise à jour venue de Digiforma : comme la synchronisation automatique (liste figée non concernée).
  const added = await addNewTrainees(createAdminClient(), sess as any, found);
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
