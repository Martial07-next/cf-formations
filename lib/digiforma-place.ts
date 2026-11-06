import type { SupabaseClient } from '@supabase/supabase-js';
import { addNewTrainees } from '@/lib/digiforma-sync';
import { markHolidaysAccounted } from '@/lib/holiday-shifts';
import { People, isPlaceholder, personKey } from '@/lib/digiforma-people';
import { findOrCreateTrainee } from '@/lib/trainee-conflict';
import { trainingMinutes } from '@/lib/schedule';
import { weekdaysBetween } from '@/lib/week';

/* ------------------------------------------------------------------------
 * Plusieurs modules d'une même session Digiforma la même semaine (ex. IRVE
 * P1 lundi, P2 mardi, P3 mercredi) : UNE session sur le planning, avec ses
 * modules posés sur leurs jours, les horaires de Digiforma jour par jour, et
 * chaque stagiaire inscrit seulement aux modules qu'il suit sur Digiforma.
 * Les parcours (GEIQ, POEC, alternance…) restent un module par semaine.
 * ---------------------------------------------------------------------- */

export const PARCOURS_RE = /geiq|poec|parcours|alternance|contrat pro|professionnalisation|apprentissage/i;

const mondayIso = (v: string) => {
  const d = new Date(v.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
/** Clé du regroupement : session Digiforma + semaine. */
export const groupKeyOf = (m: { df_session_id: string; start_at: string }) => `${m.df_session_id}|${mondayIso(m.start_at)}`;

/** Le module peut se regrouper avec d'autres (pas un parcours, pas une session entière). */
export function groupable(m: any, programId: string | null = null): boolean {
  return !programId && !m.program_id && !m.whole_session && !PARCOURS_RE.test(String(m.df_session_name || ''));
}

/** Module à proposer : de vrais stagiaires, ni retiré ni couvert. */
function hasReal(m: any, trashed: People) {
  return ((m.trainees as any[]) || []).some((t) => !isPlaceholder(t) && !trashed.has(t));
}

const hm = (v: string) => v.slice(11, 16);

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
  // Autres modules de la même session Digiforma cette semaine : une seule session, avec ses modules.
  if (groupable(m, programId)) {
    const { data: sib } = await supabase.from('digiforma_modules').select('*').eq('df_session_id', m.df_session_id).is('placed_session_id', null);
    const { data: trashedRows0 } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
    const trashed0 = new People();
    for (const t of (trashedRows0 as any[]) || []) trashed0.add(t);
    const group = ((sib as any[]) || []).filter(
      (x) => groupKeyOf(x) === groupKeyOf(m) && groupable(x) && (x.key === m.key || (!x.covered_by && hasReal(x, trashed0)))
    );
    if (group.length > 1) return placeGroup(supabase, group, templateId, refs, trashed0);
  }
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
  await applyDigiformaDays(supabase, created.id).catch(() => 0);
  return { ok: true, sessionId: created.id };
}

/** Crée la session d'un groupe de modules Digiforma (même session, même semaine). */
async function placeGroup(
  supabase: SupabaseClient,
  rows: any[],
  templateId: string | null,
  refs: PlaceRefs | undefined,
  trashed: People
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const mods = [...rows].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const { data: holding } = await supabase.from('rooms').select('id').eq('is_holding', true).maybeSingle();
  if (!holding) return { ok: false, error: "Salle d'attente introuvable : exécute migration_phase6.sql." };
  let tpl: { id: string; title: string } | null = null;
  if (templateId) {
    const { data } = await supabase.from('templates').select('id, title').eq('id', templateId).maybeSingle();
    tpl = (data as any) || null;
  }
  const first = mods[0];
  const startAt = mods.map((x) => x.start_at).sort()[0];
  const endAt = mods.map((x) => x.end_at).sort().reverse()[0];
  const names = mods.map((x, i) => x.name || `Module ${i + 1}`);
  const { data: created, error } = await supabase
    .from('sessions')
    .insert({
      title: tpl?.title || first.df_session_name || 'Session Digiforma',
      ...(tpl ? { template_id: tpl.id } : {}),
      room_id: holding.id,
      start_at: startAt,
      end_at: endAt,
      status: 'planifiee',
      digiforma_ref: first.key,
      notes: `Session Digiforma « ${first.df_session_name} » : modules ${names.join(', ')} (horaires repris de Digiforma) · salle et formateur à choisir.`,
    })
    .select('id, start_at, end_at')
    .single();
  if (error || !created) return { ok: false, error: 'Création impossible, réessaie.' };

  // Horaires de Digiforma, jour par jour (deux modules le même jour : du début du premier à la fin du second).
  const days = new Map<string, { start: string; end: string }>();
  for (const x of mods) {
    for (const d of weekdaysBetween(x.start_at, x.end_at)) {
      const cur = days.get(d);
      const st = hm(x.start_at);
      const en = hm(x.end_at);
      days.set(d, cur ? { start: st < cur.start ? st : cur.start, end: en > cur.end ? en : cur.end } : { start: st, end: en });
    }
  }
  if (days.size)
    await supabase.from('session_days').upsert(
      [...days].map(([day, t]) => ({ session_id: created.id, day, start_time: t.start, end_time: t.end })),
      { onConflict: 'session_id,day' }
    );

  // Modules de la session, posés sur leurs jours.
  const { data: smRows } = await supabase
    .from('session_modules')
    .insert(
      mods.map((x, i) => {
        const ds = weekdaysBetween(x.start_at, x.end_at);
        const minutes = (ds.length ? ds.length : 1) * trainingMinutes(hm(x.start_at), hm(x.end_at));
        return {
          session_id: created.id,
          position: i,
          name: names[i],
          start_day: x.start_at.slice(0, 10),
          end_day: x.end_at.slice(0, 10),
          duration_hours: minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : null,
        };
      })
    )
    .select('id, position');
  const moduleIds = new Map(((smRows as any[]) || []).map((r) => [r.position as number, r.id as string]));

  // Stagiaires : les vrais, une seule fois ; chacun inscrit aux modules qu'il suit sur Digiforma.
  const people = new Map<string, { t: any; in: number[] }>();
  mods.forEach((x, i) => {
    for (const t of (x.trainees as any[]) || []) {
      if (isPlaceholder(t) || trashed.has(t)) continue;
      const k = (t.email && String(t.email).trim().toLowerCase()) || personKey(t);
      const e = people.get(k);
      if (e) e.in.push(i);
      else people.set(k, { t, in: [i] });
    }
  });
  await addNewTrainees(supabase, created as any, [...people.values()].map((p) => p.t));
  const partial: { session_id: string; trainee_id: string; module_id: string }[] = [];
  for (const p of people.values()) {
    if (p.in.length === mods.length) continue; // tous les modules : toute la session
    const trainee = await findOrCreateTrainee(supabase, { first_name: p.t.firstName, last_name: p.t.lastName }, p.t.email);
    if (!trainee) continue;
    for (const i of p.in) {
      const mid = moduleIds.get(i);
      if (mid) partial.push({ session_id: created.id, trainee_id: trainee.id, module_id: mid });
    }
  }
  if (partial.length) await supabase.from('session_trainee_modules').upsert(partial, { onConflict: 'trainee_id,module_id', ignoreDuplicates: true });

  await supabase.from('digiforma_modules').update({ placed_session_id: created.id }).in('key', mods.map((x) => x.key));
  await applyDigiformaDays(supabase, created.id).catch(() => 0);
  await markHolidaysAccounted(supabase, created.id).catch(() => null);

  // Salle et formateur Digiforma : les plus fréquents des modules.
  const roomCount = new Map<string, number>();
  for (const x of mods) if (x.df_room) roomCount.set(x.df_room, (roomCount.get(x.df_room) || 0) + 1);
  const room = [...roomCount].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const trainers = mods.flatMap((x) => (Array.isArray(x.df_trainers) ? x.df_trainers : []));
  if (room || trainers.length) await applyDigiformaPlace(supabase, created.id, refs || (await loadPlaceRefs(supabase)), room, trainers);
  return { ok: true, sessionId: created.id };
}

/**
 * Nouveau module Digiforma d'une session déjà placée cette semaine en une
 * seule session (ex. P3 ajouté après coup) : ajouté à cette session (module,
 * jours, horaires, stagiaires) au lieu d'une session à part.
 */
export async function attachToGroup(supabase: SupabaseClient, m: any): Promise<string | null> {
  if (m.placed_session_id || !groupable(m)) return null;
  const { data: sib } = await supabase.from('digiforma_modules').select('key, start_at, placed_session_id').eq('df_session_id', m.df_session_id).not('placed_session_id', 'is', null);
  const target = ((sib as any[]) || []).find((x) => groupKeyOf({ df_session_id: m.df_session_id, start_at: x.start_at }) === groupKeyOf(m));
  if (!target) return null;
  const sid = target.placed_session_id as string;
  const { data: sess } = await supabase.from('sessions').select('id, start_at, end_at').eq('id', sid).maybeSingle();
  if (!sess) return null;
  const { count } = await supabase.from('session_modules').select('id', { count: 'exact', head: true }).eq('session_id', sid);
  if (!count) return null; // session posée sans modules (créée à la main) : on n'y touche pas
  const startAt = m.start_at < (sess as any).start_at ? m.start_at : (sess as any).start_at;
  const endAt = m.end_at > (sess as any).end_at ? m.end_at : (sess as any).end_at;
  if (startAt !== (sess as any).start_at || endAt !== (sess as any).end_at) {
    const { error } = await supabase.from('sessions').update({ start_at: startAt, end_at: endAt }).eq('id', sid);
    if (error) return null; // salle prise ces jours-là : le module reste à placer
  }
  const ds = weekdaysBetween(m.start_at, m.end_at);
  if (ds.length) await supabase.from('session_days').upsert(ds.map((day) => ({ session_id: sid, day, start_time: hm(m.start_at), end_time: hm(m.end_at) })), { onConflict: 'session_id,day' });
  const minutes = (ds.length || 1) * trainingMinutes(hm(m.start_at), hm(m.end_at));
  // Avant l'ajout : modules existants, stagiaires de la session, et ceux limités à certains modules.
  const [{ data: oldMods }, { data: before }, { data: partials }] = await Promise.all([
    supabase.from('session_modules').select('id').eq('session_id', sid),
    supabase.from('session_trainees').select('trainee_id').eq('session_id', sid),
    supabase.from('session_trainee_modules').select('trainee_id').eq('session_id', sid),
  ]);
  const oldIds = ((oldMods as any[]) || []).map((r) => r.id as string);
  const wasIn = new Set(((before as any[]) || []).map((r) => r.trainee_id as string));
  const limited = new Set(((partials as any[]) || []).map((r) => r.trainee_id as string));
  const { data: mod } = await supabase
    .from('session_modules')
    .insert({ session_id: sid, position: count, name: m.name || `Module ${count + 1}`, start_day: m.start_at.slice(0, 10), end_day: m.end_at.slice(0, 10), duration_hours: minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : null })
    .select('id')
    .single();
  const real = ((m.trainees as any[]) || []).filter((t) => !isPlaceholder(t));
  await addNewTrainees(supabase, sess as any, real);
  if (mod) {
    const newId = (mod as any).id as string;
    const inNew = new Set<string>();
    for (const t of real) {
      const tr = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
      if (tr) inNew.add(tr.id);
    }
    const rows: { session_id: string; trainee_id: string; module_id: string }[] = [];
    for (const id of new Set([...wasIn, ...inNew])) {
      if (!wasIn.has(id)) rows.push({ session_id: sid, trainee_id: id, module_id: newId }); // nouveau : ce module seulement
      else if (limited.has(id)) {
        if (inNew.has(id)) rows.push({ session_id: sid, trainee_id: id, module_id: newId });
      } else if (!inNew.has(id)) {
        // Suivait toute la session, mais pas ce nouveau module : limité aux modules d'avant.
        for (const mid of oldIds) rows.push({ session_id: sid, trainee_id: id, module_id: mid });
      }
    }
    if (rows.length) await supabase.from('session_trainee_modules').upsert(rows, { onConflict: 'trainee_id,module_id', ignoreDuplicates: true });
  }
  await supabase.from('digiforma_modules').update({ placed_session_id: sid }).eq('key', m.key);
  await applyDigiformaDays(supabase, sid).catch(() => 0);
  // Dates de Digiforma : jamais décalées automatiquement pour un férié.
  await markHolidaysAccounted(supabase, sid).catch(() => null);
  return sid;
}

/**
 * Jours réels des créneaux Digiforma → session créée depuis Digiforma : un
 * jour ouvré de la session sans aucun créneau (férié travaillé chez nous mais
 * pas de cours, jour sauté…) devient un jour sans formation (horaire 00:00–00:00 :
 * ni heures, ni émargement, ni salle occupée). Un jour qui retrouve un créneau
 * redevient normal. Les sessions créées à la main ne sont jamais touchées.
 * Renvoie le nombre de jours passés « sans formation ».
 */
export async function applyDigiformaDays(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const [{ data: sess }, { data: mods, error }] = await Promise.all([
    supabase.from('sessions').select('id, start_at, end_at, digiforma_ref').eq('id', sessionId).maybeSingle(),
    supabase.from('digiforma_modules').select('df_days').eq('placed_session_id', sessionId),
  ]);
  if (error || !sess || !String((sess as any).digiforma_ref || '').includes(':')) return 0;
  const lists = ((mods as any[]) || []).map((m) => m.df_days).filter((d) => Array.isArray(d) && d.length);
  if (!lists.length) return 0; // jours inconnus : rien à changer
  const real = new Set<string>(lists.flat().map((d: string) => String(d).slice(0, 10)));
  const { data: overRows } = await supabase.from('session_days').select('day, start_time, end_time').eq('session_id', sessionId);
  const over = new Map(((overRows as any[]) || []).map((o) => [String(o.day).slice(0, 10), o]));
  let set = 0;
  for (const d of weekdaysBetween((sess as any).start_at, (sess as any).end_at)) {
    const o = over.get(d);
    const off = o && String(o.start_time).slice(0, 5) === String(o.end_time).slice(0, 5);
    if (!real.has(d) && !off) {
      const { error: e } = await supabase.from('session_days').upsert({ session_id: sessionId, day: d, start_time: '00:00', end_time: '00:00' }, { onConflict: 'session_id,day' });
      if (!e) set++;
    } else if (real.has(d) && off) {
      await supabase.from('session_days').delete().eq('session_id', sessionId).eq('day', d);
    }
  }
  return set;
}
