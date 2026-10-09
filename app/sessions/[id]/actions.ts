'use server';

import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { canManage, canEditStartTimes } from '@/lib/roles';
import { effectiveDayTime } from '@/lib/week';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { parseSessionForm, findSessionConflict } from '@/lib/session-form';
import { findTraineeConflict, findOrCreateTrainee } from '@/lib/trainee-conflict';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateSessionDetails(sessionId: string, formData: FormData): Promise<ActionResult> {
  // Seuls le bureau administratif et l'administrateur modifient une session.
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const conflict = await findSessionConflict(supabase, parsed.value, sessionId);
  if (conflict) return { ok: false, error: conflict };

  // template_id n'est pas modifiable depuis la fiche : on ne l'écrase pas.
  const { template_id: _ignored, ...fields } = parsed.value;
  const { error } = await supabase.from('sessions').update(fields).eq('id', sessionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  revalidatePath('/sessions');
  return { ok: true };
}

export async function addTraineeToSession(
  sessionId: string,
  traineeId: string,
  status: 'validee' | 'en_attente'
): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!traineeId) return { ok: false, error: 'Choisis un stagiaire.' };
  const supabase = await createClient();

  if (status === 'validee') {
    const { data: session } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
    if (session) {
      const conflict = await findTraineeConflict(supabase, traineeId, session.start_at, session.end_at, sessionId);
      if (conflict) {
        return { ok: false, error: `Conflit : ce stagiaire est déjà validé sur "${conflict.title}" sur ce créneau.` };
      }
    }
  }

  const { error } = await supabase
    .from('session_trainees')
    .insert({ session_id: sessionId, trainee_id: traineeId, status });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ce stagiaire est déjà inscrit à cette session.' };
    return { ok: false, error: error.message };
  }
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export async function removeTraineeFromSession(sessionId: string, traineeId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from('session_trainees')
    .delete()
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export async function setTraineeStatus(
  sessionId: string,
  traineeId: string,
  status: 'validee' | 'en_attente'
): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();

  if (status === 'validee') {
    const { data: session } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
    if (session) {
      const conflict = await findTraineeConflict(supabase, traineeId, session.start_at, session.end_at, sessionId);
      if (conflict) {
        return { ok: false, error: `Conflit : ce stagiaire est déjà validé sur "${conflict.title}" sur ce créneau.` };
      }
    }
  }

  const { error } = await supabase
    .from('session_trainees')
    .update({ status })
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}


/**
 * Horaires par jour : 'all' pour le bureau / l'admin (début et fin) ;
 * 'start' pour un référent cadre ou le formateur de la session (heure de
 * début seulement) ; null sinon.
 */
async function timeRights(sessionId: string): Promise<'all' | 'start' | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (canManage(profile.role)) return 'all';
  if (canEditStartTimes(profile.role)) return 'start';
  if (!profile.trainer_id) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('sessions').select('trainer_id').eq('id', sessionId).maybeSingle();
  return data?.trainer_id === profile.trainer_id ? 'start' : null;
}

export async function setSessionDayTime(
  sessionId: string,
  day: string,
  startTime: string,
  endTime: string
): Promise<ActionResult> {
  const rights = await timeRights(sessionId);
  if (!rights) return FORBIDDEN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'Jour invalide.' };

  const supabase = await createClient();
  if (rights === 'start') {
    // Heure de fin inchangée : on reprend l'horaire actuel de ce jour.
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).maybeSingle(),
      supabase.from('session_days').select('day, start_time, end_time').eq('session_id', sessionId).eq('day', day),
    ]);
    if (!s) return { ok: false, error: 'Session introuvable.' };
    endTime = effectiveDayTime(day, s.start_at, s.end_at, (o as any) || []).end;
  }
  if (!startTime || !endTime) return { ok: false, error: 'Heure de début et de fin requises.' };
  if (endTime <= startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };

  const { error } = await supabase
    .from('session_days')
    .upsert(
      { session_id: sessionId, day, start_time: startTime, end_time: endTime },
      { onConflict: 'session_id,day' }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return { ok: true };
}

export async function resetSessionDayTime(sessionId: string, day: string): Promise<ActionResult> {
  if (!(await timeRights(sessionId))) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('session_days').delete().eq('session_id', sessionId).eq('day', day);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
  return { ok: true };
}

export type CsvImportResult =
  | { ok: true; added: number; updated: number; already?: number; skipped: number; duplicates?: number; errors: string[] }
  | { ok: false; error: string };

/**
 * Importe un fichier de stagiaires (Excel .xlsx ou CSV) et les inscrit à cette session.
 * Colonnes : NOM, PRENOM, ENTREPRISE, EMAIL (+ STATUT facultatif : « validé » /
 * « en attente », défaut en attente). Doublons du fichier retirés ; un
 * stagiaire déjà connu est réutilisé (et complété), jamais recréé.
 */
export async function importTraineesCsv(sessionId: string, formData: FormData): Promise<CsvImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choisis un fichier Excel (.xlsx) ou CSV.' };

  let parsed;
  try {
    const { parseTraineeFile } = await import('@/lib/trainee-file');
    parsed = await parseTraineeFile(file);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Fichier illisible.' };
  }
  if (!parsed.rows.length) return { ok: false, error: parsed.errors[0] || 'Aucun stagiaire trouvé dans le fichier.' };

  const supabase = await createClient();
  const { data: sessionRow } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
  let added = 0;
  let updated = 0;
  let already = 0;
  const errors = [...parsed.errors];

  for (const row of parsed.rows) {
    const label = [row.name.first_name, row.name.last_name].filter(Boolean).join(' ');
    const trainee = await findOrCreateTrainee(supabase, row.name, row.email, row.company);
    if (!trainee) {
      errors.push(`Ligne ${row.line} (${label}) : création impossible.`);
      continue;
    }
    if (!trainee.created) updated++;

    // Déjà inscrit : réimporter ne change rien (sauf si le fichier indique « validé »).
    const { data: link } = await supabase
      .from('session_trainees')
      .select('status')
      .eq('session_id', sessionId)
      .eq('trainee_id', trainee.id)
      .maybeSingle();
    if (link && (link.status === 'validee' || row.status !== 'validee')) {
      already++;
      continue;
    }

    let status: 'validee' | 'en_attente' = row.status || 'en_attente';
    if (status === 'validee' && sessionRow) {
      const conflict = await findTraineeConflict(supabase, trainee.id, sessionRow.start_at, sessionRow.end_at, sessionId);
      if (conflict) {
        status = 'en_attente';
        errors.push(`Ligne ${row.line} (${label}) : déjà validé sur « ${conflict.title} » sur ce créneau, mis en attente.`);
      }
    }

    const { error: linkError } = await supabase
      .from('session_trainees')
      .upsert({ session_id: sessionId, trainee_id: trainee.id, status }, { onConflict: 'session_id,trainee_id' });
    if (linkError) {
      errors.push(`Ligne ${row.line} (${label}) : ${linkError.message}`);
      continue;
    }
    added++;
  }

  revalidatePath(`/sessions/${sessionId}`);
  const skipped = parsed.errors.filter((e) => e.includes('ignorée')).length;
  return { ok: true, added, updated, already, skipped, duplicates: parsed.duplicates, errors };
}

export async function saveDigiformaRef(sessionId: string, digiformaRef: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from('sessions')
    .update({ digiforma_ref: digiformaRef.trim() || null })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

export type DigiformaImportResult =
  | { ok: true; imported: number; heldBack: number }
  | { ok: false; error: string };

/**
 * Récupère les stagiaires d'une session Digiforma (via son id/référence) et les
 * inscrit directement dans cette session : pas de ressaisie manuelle.
 * Un stagiaire Digiforma est considéré confirmé, donc inscrit en statut "validée".
 */
export async function importFromDigiforma(sessionId: string, digiformaRef: string): Promise<DigiformaImportResult> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!digiformaRef.trim()) return { ok: false, error: 'Renseigne la référence/l\'id de session Digiforma.' };

  const { digiformaFetchSessionTrainees } = await import('@/lib/digiforma');
  let trainees;
  try {
    trainees = await digiformaFetchSessionTrainees(digiformaRef.trim());
  } catch (e: any) {
    return { ok: false, error: `Digiforma : ${e.message}` };
  }

  if (trainees.length === 0) {
    return { ok: false, error: 'Aucun stagiaire trouvé pour cette référence chez Digiforma.' };
  }

  const supabase = await createClient();
  const { data: sessionRow } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).single();
  let imported = 0;
  let heldBack = 0;

  for (const t of trainees) {
    const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
    if (!trainee) continue;
    const traineeId = trainee.id;

    let status: 'validee' | 'en_attente' = 'validee';
    if (sessionRow && traineeId) {
      const conflict = await findTraineeConflict(supabase, traineeId, sessionRow.start_at, sessionRow.end_at, sessionId);
      if (conflict) {
        status = 'en_attente';
        heldBack++;
      }
    }

    const { error: linkError } = await supabase
      .from('session_trainees')
      .upsert({ session_id: sessionId, trainee_id: traineeId, status }, { onConflict: 'session_id,trainee_id' });
    if (!linkError) imported++;
  }

  await supabase.from('sessions').update({ digiforma_ref: digiformaRef.trim() }).eq('id', sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, imported, heldBack };
}

// ------------------------------------------------------------
// Modules d'une session (ex. MA1, MA2, MA3) et modules suivis par stagiaire
// ------------------------------------------------------------

function refreshSession(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/');
}

/** Choisit les modules suivis par un stagiaire. Tous (ou aucun) = session complète. */
export async function setTraineeModules(sessionId: string, traineeId: string, moduleIds: string[]): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: all } = await supabase.from('session_modules').select('id').eq('session_id', sessionId);
  const allIds = (all || []).map((m: any) => m.id as string);
  const chosen = [...new Set(moduleIds)].filter((id) => allIds.includes(id));
  if (allIds.length && chosen.length === 0) return { ok: false, error: 'Un stagiaire doit suivre au moins un module.' };

  const { error: delError } = await supabase
    .from('session_trainee_modules')
    .delete()
    .eq('session_id', sessionId)
    .eq('trainee_id', traineeId);
  if (delError) return { ok: false, error: delError.message };

  // Tous les modules = session complète : aucune ligne à enregistrer.
  if (chosen.length && chosen.length < allIds.length) {
    const { error } = await supabase
      .from('session_trainee_modules')
      .insert(chosen.map((module_id) => ({ session_id: sessionId, trainee_id: traineeId, module_id })));
    if (error) return { ok: false, error: error.message };
  }
  refreshSession(sessionId);
  return { ok: true };
}

function readModule(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const h = Number.parseInt(get('duration_h') || '0', 10) || 0;
  const m = Number.parseInt(get('duration_min') || '0', 10) || 0;
  return {
    name: get('name').slice(0, 80),
    start_day: get('start_day'),
    end_day: get('end_day') || get('start_day'),
    duration_hours: h || m ? h + m / 60 : null,
  };
}

function validModule(m: ReturnType<typeof readModule>) {
  if (!m.name) return 'Indique le nom du module.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.start_day) || !/^\d{4}-\d{2}-\d{2}$/.test(m.end_day)) return 'Jours invalides.';
  if (m.end_day < m.start_day) return 'Le jour de fin doit être après le jour de début.';
  return null;
}

export async function addSessionModule(sessionId: string, formData: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const m = readModule(formData);
  const invalid = validModule(m);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { count } = await supabase.from('session_modules').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
  const { error } = await supabase.from('session_modules').insert({ ...m, session_id: sessionId, position: count ?? 0 });
  if (error) return { ok: false, error: error.message };
  refreshSession(sessionId);
  return { ok: true };
}

export async function updateSessionModule(sessionId: string, moduleId: string, formData: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const m = readModule(formData);
  const invalid = validModule(m);
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { error } = await supabase.from('session_modules').update(m).eq('id', moduleId).eq('session_id', sessionId);
  if (error) return { ok: false, error: error.message };
  refreshSession(sessionId);
  return { ok: true };
}

export async function deleteSessionModule(sessionId: string, moduleId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('session_modules').delete().eq('id', moduleId).eq('session_id', sessionId);
  if (error) return { ok: false, error: error.message };
  refreshSession(sessionId);
  return { ok: true };
}

/** Découpe rapide : un module par jour ouvré (« Jour 1 », « Jour 2 »…). */
export async function splitSessionByDay(sessionId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: session } = await supabase.from('sessions').select('start_at, end_at').eq('id', sessionId).maybeSingle();
  if (!session) return { ok: false, error: 'Session introuvable.' };
  const { count } = await supabase.from('session_modules').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
  if (count) return { ok: false, error: 'Cette session a déjà des modules.' };
  const { weekdaysBetween } = await import('@/lib/week');
  const days = weekdaysBetween(session.start_at, session.end_at);
  if (days.length < 2) return { ok: false, error: 'La session ne dure qu’une journée.' };
  const { error } = await supabase
    .from('session_modules')
    .insert(days.map((day, position) => ({ session_id: sessionId, position, name: `Jour ${position + 1}`, start_day: day, end_day: day })));
  if (error) return { ok: false, error: error.message };
  refreshSession(sessionId);
  return { ok: true };
}
