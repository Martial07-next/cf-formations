import type { SupabaseClient } from '@supabase/supabase-js';
import { addNewTrainees } from '@/lib/digiforma-sync';
import { markHolidaysAccounted } from '@/lib/holiday-shifts';
import { People, isPlaceholder } from '@/lib/digiforma-people';

/* ------------------------------------------------------------------------
 * Salle et formateur indiqués sur Digiforma → salle et formateur du planning
 * (par le nom de la salle ; par l'e-mail ou le nom du formateur).
 * ---------------------------------------------------------------------- */

export type PlaceRefs = {
  rooms: { id: string; name: string }[];
  trainers: { id: string; full_name: string; email: string | null }[];
  /** Salles « À affecter » : une session qui y est n'a pas encore de salle. */
  holdIds: string[];
};

const plain = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const roomKey = (v: string) => plain(v).replace(/\b(salle|room|la|le|de|du)\b/g, ' ').replace(/\s+/g, ' ').trim();
const personWords = (v: string) => plain(v).split(' ').filter(Boolean).sort().join(' ');

/** Salles réelles (ni « À affecter », ni lieux INTRA) et formateurs actifs. */
export async function loadPlaceRefs(supabase: SupabaseClient): Promise<PlaceRefs> {
  const [{ data: rooms }, { data: trainers }] = await Promise.all([
    supabase.from('rooms').select('id, name, is_holding, status'),
    supabase.from('trainers').select('id, full_name, email, status'),
  ]);
  return {
    rooms: ((rooms as any[]) || []).filter((r) => !r.is_holding && r.status !== 'exterieur').map((r) => ({ id: r.id, name: r.name })),
    trainers: ((trainers as any[]) || []).filter((t) => (t.status || 'actif') !== 'inactif').map((t) => ({ id: t.id, full_name: t.full_name, email: t.email || null })),
    holdIds: ((rooms as any[]) || []).filter((r) => r.is_holding).map((r) => r.id),
  };
}

/** Salle du planning portant le nom de la salle Digiforma (exact, sinon un seul nom qui le contient). */
export function matchRoom(refs: PlaceRefs, name: string | null | undefined): string | null {
  const k = name ? roomKey(name) : '';
  if (!k) return null;
  const exact = refs.rooms.filter((r) => roomKey(r.name) === k);
  if (exact.length === 1) return exact[0].id;
  const near = refs.rooms.filter((r) => {
    const rk = roomKey(r.name);
    return rk && (` ${k} `.includes(` ${rk} `) || ` ${rk} `.includes(` ${k} `));
  });
  return near.length === 1 ? near[0].id : null;
}

/** Formateur du planning : premier intervenant Digiforma reconnu (e-mail, sinon nom et prénom). */
export function matchTrainer(refs: PlaceRefs, people: { name: string; email: string | null }[] | null | undefined): string | null {
  for (const p of people || []) {
    const em = (p.email || '').trim().toLowerCase();
    if (em) {
      const byMail = refs.trainers.filter((t) => (t.email || '').trim().toLowerCase() === em);
      if (byMail.length === 1) return byMail[0].id;
    }
    const w = p.name ? personWords(p.name) : '';
    if (!w) continue;
    const byName = refs.trainers.filter((t) => personWords(t.full_name) === w);
    if (byName.length === 1) return byName[0].id;
  }
  return null;
}

/**
 * Reprend sur une session du planning la salle et le formateur Digiforma
 * (seulement ceux qu'on reconnaît). Une salle déjà réservée ou un formateur
 * absent ces jours-là : rien n'est changé pour celui-ci (raison renvoyée).
 */
export async function applyDigiformaPlace(
  supabase: SupabaseClient,
  sessionId: string,
  refs: PlaceRefs,
  room: string | null,
  trainers: { name: string; email: string | null }[] | null,
  /** Seulement ce qui n'est pas encore choisi (session « À affecter », sans formateur). */
  onlyIfEmpty = false
): Promise<{ room: boolean; trainer: boolean; issues: string[] }> {
  const out = { room: false, trainer: false, issues: [] as string[] };
  const roomId = matchRoom(refs, room);
  const trainerId = matchTrainer(refs, trainers);
  if (!roomId && !trainerId) return out;
  const { data: cur } = await supabase.from('sessions').select('room_id, trainer_id, title').eq('id', sessionId).maybeSingle();
  if (!cur) return out;
  const roomEmpty = !(cur as any).room_id || refs.holdIds.includes((cur as any).room_id);
  if (roomId && (cur as any).room_id !== roomId && (!onlyIfEmpty || roomEmpty)) {
    const { error } = await supabase.from('sessions').update({ room_id: roomId }).eq('id', sessionId);
    if (error) out.issues.push(`« ${(cur as any).title} » : salle ${room} non reprise (${error.message.replace(/^Conflit : /, '')})`);
    else out.room = true;
  }
  if (trainerId && (cur as any).trainer_id !== trainerId && (!onlyIfEmpty || !(cur as any).trainer_id)) {
    const { error } = await supabase.from('sessions').update({ trainer_id: trainerId }).eq('id', sessionId);
    if (error) out.issues.push(`« ${(cur as any).title} » : formateur non repris (${error.message})`);
    else out.trainer = true;
  }
  return out;
}

/**
 * Crée sur le planning la session d'un module Digiforma (salle « À affecter »),
 * rattachée à sa formation du catalogue et à son parcours, avec ses vrais
 * stagiaires (ni fictifs, ni corbeille, jamais en double).
 */
export async function placeModuleRow(
  supabase: SupabaseClient,
  m: any,
  templateId: string | null,
  programId: string | null,
  refs?: PlaceRefs
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  if (m.placed_session_id) return { ok: true, sessionId: m.placed_session_id };
  const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holding) return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };
  let tpl: { id: string; title: string } | null = null;
  if (templateId) {
    const { data } = await supabase.from('templates').select('id, title').eq('id', templateId).maybeSingle();
    tpl = (data as any) || null;
  }
  const dfTitle = m.whole_session || !m.name ? m.df_session_name : m.name;
  const { data: created, error } = await supabase
    .from('sessions')
    .insert({
      title: tpl?.title || dfTitle || 'Session Digiforma',
      ...(tpl ? { template_id: tpl.id } : {}),
      ...(programId ? { poec_id: programId } : {}),
      room_id: holding.id,
      start_at: m.start_at,
      end_at: m.end_at,
      status: 'planifiee',
      digiforma_ref: m.key,
      notes: `Module Digiforma « ${m.name || m.df_session_name} » (session ${m.df_session_name}) : salle et formateur à choisir.`,
    })
    .select('id, start_at, end_at')
    .single();
  if (error || !created) return { ok: false, error: 'Création impossible, réessaie.' };
  // Salle et formateur indiqués sur Digiforma (migration 66) : repris quand on les reconnaît.
  if (m.df_room || (Array.isArray(m.df_trainers) && m.df_trainers.length)) {
    const done = await applyDigiformaPlace(supabase, created.id, refs || (await loadPlaceRefs(supabase)), m.df_room || null, m.df_trainers || null);
    if (done.room || done.trainer)
      await supabase
        .from('sessions')
        .update({
          notes: `Module Digiforma « ${m.name || m.df_session_name} » (session ${m.df_session_name}) : ${done.room && done.trainer ? 'salle et formateur repris de Digiforma' : done.room ? 'salle reprise de Digiforma, formateur à choisir' : 'formateur repris de Digiforma, salle à choisir'}.`,
        })
        .eq('id', created.id);
  }
  await markHolidaysAccounted(supabase, created.id).catch(() => null);
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  const trashed = new People();
  for (const t of (trashedRows as any[]) || []) trashed.add(t);
  const real = ((m.trainees as any[]) || []).filter((t) => !isPlaceholder(t) && !trashed.has(t));
  await addNewTrainees(supabase, created as any, real);
  await supabase.from('digiforma_modules').update({ placed_session_id: created.id }).eq('key', m.key);
  return { ok: true, sessionId: created.id };
}
