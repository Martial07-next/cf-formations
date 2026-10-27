'use server';

import { searchTrainees as rankTrainees } from '@/lib/trainee-search';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { buildFullName, duplicateMessage, isDuplicateError } from '@/lib/trainee-name';
import { validSignature } from '@/lib/emargement';
import { COMPANY_FIELDS, newToken } from '@/lib/poec';
import { sessionStarted } from '@/lib/session-lock';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIGRATION = "Le module POEC n'est pas encore installé : exécute supabase/migration_phase23.sql dans Supabase.";

function txt(fd: FormData, k: string, max = 2000) {
  const v = String(fd.get(k) ?? '').trim().slice(0, max);
  return v || null;
}

function dbError(error: { code?: string; message: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205' || /poec_/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
    return { ok: false as const, error: MIGRATION };
  }
  return { ok: false as const, error: error.message };
}

function refresh(programId?: string) {
  revalidatePath('/poec');
  revalidatePath('/');
  if (programId) revalidatePath(`/poec/${programId}`);
}

function readProgram(fd: FormData) {
  const start = String(fd.get('start_date') || '');
  const end = String(fd.get('end_date') || '');
  const title = txt(fd, 'title', 200);
  if (!title) return { ok: false as const, error: 'Indique le nom du parcours.' };
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { ok: false as const, error: 'Dates invalides.' };
  if (end < start) return { ok: false as const, error: 'La date de fin doit être après la date de début.' };
  return {
    ok: true as const,
    value: {
      title,
      reference: txt(fd, 'reference', 100),
      start_date: start,
      end_date: end,
      objectives: txt(fd, 'objectives', 8000),
      recruiter: txt(fd, 'recruiter', 200),
      ft_agency: txt(fd, 'ft_agency', 200),
      ft_advisor: txt(fd, 'ft_advisor', 200),
      ft_email: txt(fd, 'ft_email', 200),
      pedagogical_tutor: txt(fd, 'pedagogical_tutor', 200),
      notes: txt(fd, 'notes', 4000),
      // Type de parcours (migration 43) : POEC (France Travail) ou personnalisé.
      ...(fd.has('kind') ? { kind: fd.get('kind') === 'personnalise' ? 'personnalise' : 'poec' } : {}),
    },
  };
}

/** Sans la migration 43, on enregistre le parcours sans son type. */
const missingKind = (e: { message?: string } | null) => Boolean(e && /kind|schema cache/i.test(e.message || ''));

export async function createProgram(fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = readProgram(fd);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  let { data, error } = await supabase.from('poec_programs').insert({ ...parsed.value, ft_token: newToken() }).select('id').single();
  if (missingKind(error) && 'kind' in parsed.value) {
    const { kind: _k, ...rest } = parsed.value as any;
    ({ data, error } = await supabase.from('poec_programs').insert({ ...rest, ft_token: newToken() }).select('id').single());
  }
  if (error || !data) return dbError(error!);
  refresh();
  redirect(`/poec/${data.id}`);
}

export async function updateProgram(id: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = readProgram(fd);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  let { error } = await supabase.from('poec_programs').update(parsed.value).eq('id', id);
  if (missingKind(error) && 'kind' in parsed.value) {
    const { kind: _k, ...rest } = parsed.value as any;
    ({ error } = await supabase.from('poec_programs').update(rest).eq('id', id));
  }
  if (error) return dbError(error);
  refresh(id);
  return { ok: true };
}

export async function deleteProgram(id: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  // Les formations du parcours sont supprimées avec lui (inscriptions, dossiers… suivent).
  const { error: sessionsError } = await supabase.from('sessions').delete().eq('poec_id', id);
  if (sessionsError) return { ok: false, error: `Sessions du parcours non supprimées : ${sessionsError.message}` };
  const { error } = await supabase.from('poec_programs').delete().eq('id', id);
  if (error) return dbError(error);
  refresh();
  revalidatePath('/sessions');
  redirect('/poec');
}

/** Nouveau lien France Travail (l'ancien ne fonctionne plus). */
export async function renewFtLink(id: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('poec_programs').update({ ft_token: newToken() }).eq('id', id);
  if (error) return dbError(error);
  refresh(id);
  return { ok: true };
}

// ------------------------------------------------------------
// Groupe de stagiaires : toujours les mêmes sur tout le parcours
// ------------------------------------------------------------

/** Inscrit (validé) les stagiaires du groupe sur toutes les sessions du parcours. */
async function enrollGroup(supabase: Awaited<ReturnType<typeof createClient>>, programId: string, traineeIds?: string[], sessionIds?: string[]) {
  const ids =
    traineeIds ??
    (((await supabase.from('poec_trainees').select('trainee_id').eq('program_id', programId)).data as any[]) || []).map((r) => r.trainee_id);
  let sids: string[] =
    sessionIds ?? (((await supabase.from('sessions').select('id').eq('poec_id', programId)).data as any[]) || []).map((r) => r.id);
  if (!ids.length || !sids.length) return;
  // Formations déjà commencées : liste figée, on n'y touche pas.
  const { data: starts } = await supabase.from('sessions').select('id, start_at').in('id', sids);
  const open = new Set(((starts as any[]) || []).filter((x) => !sessionStarted(x.start_at)).map((x) => x.id));
  sids = sids.filter((sid) => open.has(sid));
  if (!sids.length) return;
  const rows = sids.flatMap((sid) => ids.map((tid) => ({ session_id: sid, trainee_id: tid, status: 'validee' })));
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('session_trainees').upsert(rows.slice(i, i + 500), { onConflict: 'session_id,trainee_id' });
  }
  for (const sid of sids) revalidatePath(`/sessions/${sid}`);
}

/** Crée les conventions manquantes (une par stagiaire et par période de stage). */
async function ensureConventions(supabase: Awaited<ReturnType<typeof createClient>>, programId: string) {
  const [{ data: program }, { data: periods }, { data: members }, { data: existing }] = await Promise.all([
    supabase.from('poec_programs').select('pedagogical_tutor').eq('id', programId).maybeSingle(),
    supabase.from('poec_periods').select('id').eq('program_id', programId),
    supabase.from('poec_trainees').select('trainee_id, address').eq('program_id', programId),
    supabase.from('poec_conventions').select('period_id, trainee_id').eq('program_id', programId),
  ]);
  const have = new Set(((existing as any[]) || []).map((e) => `${e.period_id}|${e.trainee_id}`));
  const rows = ((periods as any[]) || []).flatMap((p) =>
    ((members as any[]) || [])
      .filter((m) => !have.has(`${p.id}|${m.trainee_id}`))
      .map((m) => ({
        program_id: programId,
        period_id: p.id,
        trainee_id: m.trainee_id,
        trainee_address: m.address || null,
        pedagogical_tutor: (program as any)?.pedagogical_tutor || null,
        company_token: newToken(),
        trainee_token: newToken(),
      }))
  );
  if (rows.length) await supabase.from('poec_conventions').insert(rows);
}

export async function addProgramTrainees(programId: string, traineeIds: string[]): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const ids = [...new Set(traineeIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return { ok: false, error: 'Choisis au moins un stagiaire.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('poec_trainees')
    .upsert(ids.map((trainee_id) => ({ program_id: programId, trainee_id })), { onConflict: 'program_id,trainee_id', ignoreDuplicates: true });
  if (error) return dbError(error);
  await enrollGroup(supabase, programId, ids);
  await ensureConventions(supabase, programId);
  refresh(programId);
  return { ok: true };
}

/** Nouveau stagiaire créé directement dans le groupe. */
export async function createProgramTrainee(programId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const name = { first_name: txt(fd, 'first_name', 100), last_name: txt(fd, 'last_name', 100) || '' };
  if (!name.last_name) return { ok: false, error: 'Indique au moins le nom du stagiaire.' };
  const full_name = buildFullName(name);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trainees')
    .insert({ ...name, full_name, email: txt(fd, 'email', 200), company: txt(fd, 'company', 200) })
    .select('id')
    .single();
  if (isDuplicateError(error)) return { ok: false, error: `${duplicateMessage(full_name)} Ajoute-le depuis la liste.` };
  if (error) return { ok: false, error: error.message };
  revalidatePath('/stagiaires');
  return addProgramTrainees(programId, [data.id]);
}

export async function updateProgramTrainee(programId: string, traineeId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const address = txt(fd, 'address', 400);
  const { error } = await supabase
    .from('poec_trainees')
    .update({ address, ft_id: txt(fd, 'ft_id', 60) })
    .eq('program_id', programId)
    .eq('trainee_id', traineeId);
  if (error) return dbError(error);
  // Adresse reprise sur les conventions pas encore signées par le stagiaire.
  await supabase
    .from('poec_conventions')
    .update({ trainee_address: address })
    .eq('program_id', programId)
    .eq('trainee_id', traineeId)
    .is('trainee_signed_at', null);
  refresh(programId);
  return { ok: true };
}

/** Retire un stagiaire du groupe (abandon) : il quitte aussi les sessions à venir du parcours. */
export async function removeProgramTrainee(programId: string, traineeId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('poec_trainees').delete().eq('program_id', programId).eq('trainee_id', traineeId);
  if (error) return dbError(error);
  const { data: future } = await supabase
    .from('sessions')
    .select('id')
    .eq('poec_id', programId)
    .gte('start_at', new Date().toISOString().slice(0, 10));
  const ids = ((future as any[]) || []).map((s) => s.id);
  if (ids.length) await supabase.from('session_trainees').delete().eq('trainee_id', traineeId).in('session_id', ids);
  // Conventions non signées supprimées ; celles déjà signées sont conservées.
  await supabase
    .from('poec_conventions')
    .delete()
    .eq('program_id', programId)
    .eq('trainee_id', traineeId)
    .is('cf_signed_at', null)
    .is('company_signed_at', null)
    .is('trainee_signed_at', null);
  refresh(programId);
  return { ok: true };
}

// ------------------------------------------------------------
// Formations du parcours (sessions du planning)
// ------------------------------------------------------------

export async function attachSessions(programId: string, sessionIds: string[]): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const ids = sessionIds.filter(Boolean);
  if (!ids.length) return { ok: false, error: 'Choisis au moins une session.' };
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ poec_id: programId }).in('id', ids);
  if (error) return dbError(error);
  await enrollGroup(supabase, programId, undefined, ids);
  refresh(programId);
  return { ok: true };
}

export async function detachSession(programId: string, sessionId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('sessions').update({ poec_id: null }).eq('id', sessionId).eq('poec_id', programId);
  if (error) return dbError(error);
  refresh(programId);
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

/** Réinscrit tout le groupe sur toutes les sessions du parcours. */
export async function syncProgramSessions(programId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  await enrollGroup(supabase, programId);
  refresh(programId);
  return { ok: true };
}

// ------------------------------------------------------------
// Périodes de stage
// ------------------------------------------------------------

function readPeriod(fd: FormData) {
  const start = String(fd.get('start_date') || '');
  const end = String(fd.get('end_date') || '');
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) return { ok: false as const, error: 'Dates de stage invalides.' };
  if (end < start) return { ok: false as const, error: 'La fin du stage doit être après le début.' };
  return { ok: true as const, value: { label: txt(fd, 'label', 120) || 'Stage en entreprise', start_date: start, end_date: end } };
}

export async function addPeriod(programId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = readPeriod(fd);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase.from('poec_periods').insert({ ...parsed.value, program_id: programId });
  if (error) return dbError(error);
  await ensureConventions(supabase, programId);
  refresh(programId);
  return { ok: true };
}

export async function updatePeriod(programId: string, periodId: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const parsed = readPeriod(fd);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: signed } = await supabase
    .from('poec_conventions')
    .select('id')
    .eq('period_id', periodId)
    .or('cf_signed_at.not.is.null,company_signed_at.not.is.null,trainee_signed_at.not.is.null')
    .limit(1);
  const { data: before } = await supabase.from('poec_periods').select('start_date, end_date').eq('id', periodId).maybeSingle();
  const datesChanged = before && (before.start_date !== parsed.value.start_date || before.end_date !== parsed.value.end_date);
  if (datesChanged && signed?.length) {
    return { ok: false, error: 'Des conventions de cette période sont déjà signées : annule d’abord leurs signatures pour changer les dates.' };
  }
  const { error } = await supabase.from('poec_periods').update(parsed.value).eq('id', periodId).eq('program_id', programId);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

export async function deletePeriod(programId: string, periodId: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('poec_periods').delete().eq('id', periodId).eq('program_id', programId);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

// ------------------------------------------------------------
// Conventions (côté CF Réseaux)
// ------------------------------------------------------------

/** Le bureau peut pré-remplir ou corriger les informations, tant que la partie concernée n'a pas signé. */
export async function saveConvention(programId: string, id: string, fd: FormData): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from('poec_conventions')
    .select('cf_signed_at, company_signed_at, trainee_signed_at')
    .eq('id', id)
    .maybeSingle();
  if (!c) return { ok: false, error: 'Convention introuvable.' };
  const patch: Record<string, string | null> = {};
  if (!c.company_signed_at) for (const f of COMPANY_FIELDS) patch[f.key] = txt(fd, f.key, f.key === 'missions' ? 3000 : 400);
  if (!c.trainee_signed_at) patch.trainee_address = txt(fd, 'trainee_address', 400);
  if (!c.cf_signed_at) patch.pedagogical_tutor = txt(fd, 'pedagogical_tutor', 200);
  if (!Object.keys(patch).length) return { ok: false, error: 'Convention déjà signée : rien à modifier.' };
  const { error } = await supabase.from('poec_conventions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

/** Signature CF Réseaux, sur une ou plusieurs conventions d'un coup. */
export async function signAsCf(programId: string, ids: string[], signer: string, signature: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  if (!validSignature(signature)) return { ok: false, error: 'Signature manquante.' };
  if (!ids.length) return { ok: false, error: 'Aucune convention à signer.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('poec_conventions')
    .update({ cf_signature: signature, cf_signer: signer.trim().slice(0, 120) || null, cf_signed_at: new Date().toISOString() })
    .eq('program_id', programId)
    .in('id', ids)
    .is('cf_signed_at', null);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

/** Annule les signatures (ex. erreur à corriger) : la convention redevient modifiable. */
export async function resetConventionSignatures(programId: string, id: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from('poec_conventions')
    .update({
      cf_signature: null, cf_signer: null, cf_signed_at: null,
      company_signature: null, company_signer: null, company_signer_role: null, company_city: null, company_signed_at: null,
      trainee_signature: null, trainee_city: null, trainee_signed_at: null,
      ft_signature: null, ft_signer: null, ft_signed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('program_id', programId);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

/** Nouveaux liens entreprise / stagiaire (les anciens ne fonctionnent plus). */
export async function renewConventionLinks(programId: string, id: string): Promise<ActionResult> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase
    .from('poec_conventions')
    .update({ company_token: newToken(), trainee_token: newToken() })
    .eq('id', id)
    .eq('program_id', programId);
  if (error) return dbError(error);
  refresh(programId);
  return { ok: true };
}

/** Recherche de stagiaires existants (ajout au groupe). */
export async function searchTrainees(q: string): Promise<{ id: string; full_name: string; company: string | null }[]> {
  if (!(await requireManager())) return [];
  const term = q.trim().replace(/[%,()]/g, ' ').slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  // Classement par pertinence, sans accents, nom / prénom dans n'importe quel ordre.
  const all: any[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data } = await supabase.from('trainees').select('id, full_name, first_name, last_name, company').order('id').range(from, from + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return rankTrainees(all, term, 20).map((t) => ({ id: t.id, full_name: t.full_name, company: t.company }));
}
