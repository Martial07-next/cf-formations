import type { SupabaseClient } from '@supabase/supabase-js';
import { digiformaDateModules, digiformaListSessionsLight, followsModule, withAttendance, type DayTime, digiformaSessionModules, digiformaSessionDetail, isPlannedStatus, particuliersReadable, seenParticuliers, seenRegStatus, toWallClock, type DigiformaCompany, type DigiformaTrainee } from '@/lib/digiforma';
import { findOrCreateTrainee, findTraineeConflict } from '@/lib/trainee-conflict';
import { matchCatalog, matchModule } from '@/lib/catalog-match';
import { randomBytes } from 'crypto';
import { applyDigiformaDays, applyDigiformaPlace, attachToGroup, loadPlaceRefs, placeModuleRow, writeSessionModules } from '@/lib/digiforma-place';
import { withoutSessionOnly } from '@/lib/template-edit';
import { People, isPlaceholder } from '@/lib/digiforma-people';
import { parisNowKey } from '@/lib/paris-time';

export type SyncResult =
  | { ok: true; created: number; traineesLinked: number; skipped: number; past: number; log: string; remaining: number; changed: number }
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
  seenRegStatus.clear();
  seenParticuliers.clear();
  // Corbeille de la page Stagiaires (migration 60) : ces personnes ne sont jamais ajoutées.
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  ignoredTrainees = new People();
  for (const t of (trashedRows as any[]) || []) ignoredTrainees.add(t);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86400000).toISOString().slice(0, 10);

  let listed;
  try {
    // Liste légère (nom, dates, statut) : les créneaux sont lus ensuite session par session.
    listed = await digiformaListSessionsLight();
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

  // Sessions planifiées / en cours et pas terminées : leurs créneaux sont lus une par une.
  const seenStatus = new Map<string, number>();
  let notPlanned = 0;
  let past = 0;
  let stages = 0;
  const asModule = 0;
  type Person = { name: string; email: string | null };
  type Mod = { key: string; name: string | null; start_at: string; end_at: string; whole: boolean; slotIds: string[]; offsite?: boolean; remote?: boolean; room?: string | null; trainers?: Person[]; days?: string[]; dayTimes?: DayTime[] };
  const todo: { id: string; name: string; startAt: string | null; endAt: string | null }[] = [];
  for (const s of listed.sessions) {
    if (listed.hasStatus) {
      const st = s.status || '(vide)';
      seenStatus.set(st, (seenStatus.get(st) || 0) + 1);
      if (!isPlannedStatus(s.status)) {
        notPlanned++;
        continue;
      }
    }
    if (s.endAt && s.endAt.slice(0, 10) < today) {
      past++;
      continue;
    }
    if (s.startAt && s.startAt.slice(0, 10) > horizon) continue;
    todo.push({ id: s.id, name: s.name, startAt: s.startAt, endAt: s.endAt });
  }
  /** Créneaux d'une session → modules à venir (salle) et semaines de stage. */
  const splitModules = (c: { id: string; startAt: string | null; endAt: string | null }, mods: { modules: { key: string; name: string | null; start: string; end: string; startTime: string | null; endTime: string | null; slotIds?: string[]; offsite?: boolean; remote?: boolean; room?: string | null; trainers?: Person[]; days?: string[]; dayTimes?: DayTime[] }[] }) => {
    const raw: Mod[] = mods.modules.length
      ? mods.modules.map((m) => ({ key: `${c.id}:${m.key}`, name: m.name, start_at: toWallClock(m.start, m.startTime, '08:00'), end_at: toWallClock(m.end || m.start, m.endTime, '16:00'), whole: false, slotIds: m.slotIds || [], offsite: Boolean(m.offsite), remote: Boolean(m.remote), room: m.room ?? null, trainers: m.trainers || [], days: m.days, dayTimes: m.dayTimes }))
      : c.startAt && c.endAt && new Date(c.endAt.slice(0, 10)).getTime() - new Date(c.startAt.slice(0, 10)).getTime() <= 6 * 86400000
        ? [{ key: `${c.id}:session`, name: null, start_at: toWallClock(c.startAt, null, '08:00'), end_at: toWallClock(c.endAt, null, '16:00'), whole: true, slotIds: [], offsite: false, remote: false }]
        : [];
    const inRange = (m: { start_at: string; end_at: string }) => m.end_at.slice(0, 10) >= today && m.start_at.slice(0, 10) <= horizon && m.end_at >= m.start_at;
    // Stage / période en entreprise : un évènement du parcours (période de stage), pas un module en salle.
    // (nom « stage… », ou sous-session Digiforma « pas de stagiaire en salle » / modalité entreprise).
    const isStage = (m: { name: string | null; offsite?: boolean }) => isCompanyPeriod(m.name || '') || Boolean(m.offsite);
    const stageBlocks = raw.filter((m) => isStage(m) && inRange(m));
    // Vacances, fermeture, absence, distanciel… : rien à placer en salle.
    const notStage = raw.filter((m) => !isStage(m) && !isOffPeriod(m.name || '') && !m.remote);
    const upcoming = notStage.filter(inRange);
    stages += stageBlocks.length;
    past += raw.length - upcoming.length - stageBlocks.length;
    return { modules: upcoming, stages: stageBlocks };
  };
  // Les plus proches d'abord (si le temps manque, la suite est reprise au prochain passage).
  const firstOf = (x: { startAt: string | null }) => x.startAt || '';
  // Relues à tour de rôle : jamais relues d'abord, puis les plus anciennes (sinon les mêmes passent toujours devant).
  const lastSeen = new Map<string, string>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data: seen } = await supabase.from('digiforma_modules').select('df_session_id, synced_at').order('synced_at').range(from, from + 999);
    for (const r of (seen as any[]) || []) if (!lastSeen.has(r.df_session_id) || r.synced_at > lastSeen.get(r.df_session_id)!) lastSeen.set(r.df_session_id, r.synced_at);
    if (!seen || seen.length < 1000) break;
  }
  todo.sort((a, b) => (lastSeen.get(a.id) || '').localeCompare(lastSeen.get(b.id) || '') || firstOf(a).localeCompare(firstOf(b)));
  // Détails Digiforma lus quatre par quatre (en parallèle), dans l'ordre ci-dessus.
  const details = new Map<string, Promise<any>>();
  const prefetch = (i: number) => {
    for (let k = i; k < Math.min(todo.length, i + 4); k++)
      if (!details.has(todo[k].id))
        details.set(
          todo[k].id,
          Promise.all([digiformaSessionModules(todo[k].id), digiformaSessionDetail(todo[k].id)]).catch(() => null)
        );
  };
  const processed = new Set<string>();

  // Sessions déjà sur le planning (même formation, mêmes dates) : le module y est relié, pas reproposé.
  const { data: tplRows } = await supabase.from('templates').select('id, title');
  const catalog = (await withoutSessionOnly(supabase, (tplRows as any[]) || [])).map((t) => ({ id: t.id as string, title: t.title as string }));
  const { data: holdRows } = await supabase.from('rooms').select('id').eq('is_holding', true);
  const holdIds = new Set(((holdRows as any[]) || []).map((r) => r.id));
  const { data: planRows } = await supabase
    .from('sessions')
    .select('id, title, template_id, start_at, end_at, room_id')
    .gte('end_at', `${today}T00:00:00`)
    .lte('start_at', `${horizon}T23:59:59`);
  const planned = ((planRows as any[]) || []).filter((p) => !holdIds.has(p.room_id));
  const { data: linkedRows } = await supabase.from('digiforma_modules').select('placed_session_id').not('placed_session_id', 'is', null);
  const alreadyLinked = new Set(((linkedRows as any[]) || []).map((r) => r.placed_session_id));
  // Stagiaires des sessions du planning (pour reconnaître un module déjà posé, même sous un autre nom).
  const people = new Map<string, { emails: Set<string>; names: Set<string> }>();
  for (let i = 0; i < planned.length; i += 150) {
    const ids = planned.slice(i, i + 150).map((p) => p.id);
    const { data: st } = await supabase.from('session_trainees').select('session_id, status, trainees(email, full_name, first_name, last_name)').in('session_id', ids);
    for (const r of (st as any[]) || []) {
      const t = Array.isArray(r.trainees) ? r.trainees[0] : r.trainees;
      if (!t) continue;
      const e = people.get(r.session_id) || { emails: new Set<string>(), names: new Set<string>() };
      if (t.email) e.emails.add(String(t.email).trim().toLowerCase());
      for (const n of [t.full_name, `${t.first_name || ''} ${t.last_name || ''}`]) if (n && n.trim()) e.names.add(nameKey(n));
      people.set(r.session_id, e);
    }
  }
  const overlap = (sessionId: string, list: DigiformaTrainee[]) => {
    const e = people.get(sessionId);
    if (!e) return 0;
    return list.filter((t) => (t.email && e.emails.has(t.email.trim().toLowerCase())) || e.names.has(nameKey(`${t.firstName || ''} ${t.lastName || ''}`))).length;
  };
  let progRes: any = await supabase.from('poec_programs').select('id, title, start_date, end_date, notes, digiforma_ref').gte('end_date', today);
  const hasProgRef = !progRes.error;
  if (progRes.error) progRes = await supabase.from('poec_programs').select('id, title, start_date, end_date, notes').gte('end_date', today);
  const progRows = progRes.data;
  const programs = ((progRows as any[]) || []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    notes: (p.notes as string | null) ?? null,
    digiforma_ref: (p.digiforma_ref as string | null) ?? null,
    start_date: (p.start_date as string) || '',
    end_date: (p.end_date as string) || '',
  }));
  /** Les dates du parcours recouvrent celles de la session Digiforma (pas une autre promotion). */
  const overlaps = (p: { start_date: string; end_date: string }, a: string, b: string) => !p.start_date || !a || (p.start_date <= b && p.end_date >= a);
  // Décisions par parcours, détaillées dans le compte-rendu.
  const decisions: string[] = [];
  const progPeople = new Map<string, { emails: Set<string>; names: Set<string> }>();
  if (programs.length) {
    const { data: pt } = await supabase.from('poec_trainees').select('program_id, trainees(email, full_name, first_name, last_name)').in('program_id', programs.map((p) => p.id));
    for (const r of (pt as any[]) || []) {
      const t = Array.isArray(r.trainees) ? r.trainees[0] : r.trainees;
      if (!t) continue;
      const e = progPeople.get(r.program_id) || { emails: new Set<string>(), names: new Set<string>() };
      if (t.email) e.emails.add(String(t.email).trim().toLowerCase());
      for (const n of [t.full_name, `${t.first_name || ''} ${t.last_name || ''}`]) if (n && n.trim()) e.names.add(nameKey(n));
      progPeople.set(r.program_id, e);
    }
  }
  const { data: evRows } = await supabase.from('planning_events').select('id, poec_id, start_date, end_date').not('poec_id', 'is', null).gte('end_date', today);
  const progEvents = ((evRows as any[]) || []) as { id: string; poec_id: string; start_date: string; end_date: string }[];
  const { data: progSessRows } = await supabase.from('sessions').select('id, poec_id, start_at, end_at').not('poec_id', 'is', null).gte('end_at', `${today}T00:00:00`);
  const progSessions = ((progSessRows as any[]) || []) as { id: string; poec_id: string; start_at: string; end_at: string }[];
  /** Parcours du planning correspondant à une session Digiforma : même nom, ou la moitié de ses stagiaires. */
  const programFor = (dfName: string, all: DigiformaTrainee[], a: string, b: string): { id: string; why: string } | null => {
    const trainees = all.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t));
    const candidates = programs.filter((p) => overlaps(p, a, b));
    // 1. Mêmes stagiaires (au moins la moitié des vrais), sur des dates qui se recouvrent.
    if (trainees.length) {
      let best: { id: string; n: number } | null = null;
      for (const p of candidates) {
        const e = progPeople.get(p.id);
        if (!e) continue;
        const n = trainees.filter((t) => (t.email && e.emails.has(t.email.trim().toLowerCase())) || e.names.has(nameKey(`${t.firstName || ''} ${t.lastName || ''}`))).length;
        if (n >= Math.max(1, Math.ceil(trainees.length / 2)) && (!best || n > best.n)) best = { id: p.id, n };
      }
      if (best) return { id: best.id, why: `${best.n}/${trainees.length} stagiaires en commun` };
    }
    // 2. Même nom, très net (pas « GEIQ septembre » pour « GEIQ octobre »), sur des dates qui se recouvrent.
    const byTitle = matchCatalog(dfName, candidates, '');
    if (byTitle.templateId && byTitle.score >= 0.75) return { id: byTitle.templateId, why: 'même nom' };
    return null;
  };
  /** Le parcours a déjà une session ou un évènement ces jours-là : le module est couvert. */
  const coveredBy = (programId: string, start: string, end: string): string | null => {
    const a = start.slice(0, 10);
    const b = end.slice(0, 10);
    const ev = progEvents.find((e) => e.poec_id === programId && e.start_date <= b && e.end_date >= a);
    if (ev) return `event:${ev.id}`;
    const se = progSessions.find((x) => x.poec_id === programId && x.start_at.slice(0, 10) <= b && x.end_at.slice(0, 10) >= a);
    return se ? `session:${se.id}` : null;
  };
  let covered = 0;

  let linked = 0;
  const findOnPlanning = (name: string, parent: string, start: string, end: string, trainees: DigiformaTrainee[] = []): string | null => {
    const sameDays = planned.filter((p) => !alreadyLinked.has(p.id) && p.start_at.slice(0, 10) <= end.slice(0, 10) && p.end_at.slice(0, 10) >= start.slice(0, 10));
    if (!sameDays.length) return null;
    // 1. Mêmes stagiaires sur les mêmes jours (parcours GEIQ / POEC posés sous le nom du module) : la moitié au moins.
    trainees = trainees.filter((t) => !isPlaceholder(t));
    if (trainees.length) {
      const byPeople = sameDays
        .map((p) => ({ p, n: overlap(p.id, trainees) }))
        .filter((x) => x.n >= Math.max(1, Math.ceil(trainees.length / 2)))
        .sort((a, b) => b.n - a.n);
      if (byPeople.length === 1 || (byPeople.length > 1 && byPeople[0].n > byPeople[1].n)) return byPeople[0].p.id;
    }
    const m = matchModule(name, parent, catalog);
    const byTemplate = m.templateId && m.confidence !== 'none' ? sameDays.filter((p) => p.template_id === m.templateId) : [];
    if (byTemplate.length === 1) return byTemplate[0].id;
    const byTitle = sameDays
      .map((p) => ({ p, r: matchCatalog(name, [{ id: p.id, title: p.title }], parent) }))
      .filter((x) => x.r.score >= 0.6)
      .sort((a, b) => b.r.score - a.r.score);
    return byTitle.length === 1 || (byTitle.length > 1 && byTitle[0].r.score - byTitle[1].r.score >= 0.15) ? byTitle[0].p.id : null;
  };

  // Salle et formateur Digiforma (migration 66) : salles et formateurs de la plateforme.
  const placeRefs = await loadPlaceRefs(supabase);
  let placeCols = !(await supabase.from('digiforma_modules').select('df_room').limit(1)).error;
  // Jours réels des créneaux Digiforma (migration 67) : les autres jours ouvrés sont « sans formation ».
  let daysCol = !(await supabase.from('digiforma_modules').select('df_days').limit(1)).error;
  let offDaysSet = 0;
  let modulesNamed = 0;
  let roomsSet = 0;
  let trainersSet = 0;
  let newModules = 0;
  const placeIssues: string[] = [];

  let modulesSaved = 0;
  let remaining = 0;
  let programsCreated = 0;
  let programsLinked = 0;
  let autoPlaced = 0;
  let stagePeriods = 0;
  let geiqCleaned = 0;
  let addedLater = 0;
  let reservationsSet = 0;
  for (const [idx, c] of todo.entries()) {
    if (Date.now() > deadline) {
      remaining++;
      continue;
    }
    prefetch(idx);
    const got = await details.get(c.id);
    processed.add(c.id); // lue (même en échec) : ses modules ne sont pas purgés
    if (!got) continue;
    const [sessionMods, detail] = got as [Awaited<ReturnType<typeof digiformaSessionModules>>, Awaited<ReturnType<typeof digiformaSessionDetail>>];
    // « Dates et prix » : si les créneaux d'un parcours ne nomment pas leurs modules.
    if (!sessionMods.modules.some((m) => m.name) && /geiq|poec|parcours|alternance|contrat pro|professionnalisation|apprentissage/i.test(c.name)) {
      try {
        const fromDates = await digiformaDateModules(c.id);
        if (fromDates?.length) sessionMods.modules = fromDates;
      } catch {
        // champ absent ou refusé : on garde les créneaux
      }
    }
    const s = { ...c, ...splitModules(c, sessionMods) };
    if (!s.modules.length && !s.stages.length) {
      // Plus rien à venir : ses anciens modules (pas placés) sont retirés.
      await supabase.from('digiforma_modules').delete().eq('df_session_id', c.id).is('placed_session_id', null).or('covered_by.is.null,covered_by.neq.dismissed');
      continue;
    }
    const rows = s.modules.map((m) => {
      const own = detail.byModule[m.key.slice(s.id.length + 1).split('~')[0]];
      // Présence par créneau (Digiforma) : seulement les stagiaires prévus ces jours-là.
      const present = presentOn(detail, m.slotIds);
      // Stagiaires du module ; plus ceux cochés sur ce module dans Digiforma (prospects en attente…) qui n'y figurent pas.
      const ownIds = new Set((own || []).map((t) => t.id));
      const base = own && own.length ? [...own, ...detail.trainees.filter((t) => !ownIds.has(t.id) && detail.subsOf[t.id]?.length && followsModule(detail.subsOf, t.id, m.name))] : detail.trainees;
      return {
        key: m.key,
        df_session_id: s.id,
        df_session_name: s.name,
        name: m.name,
        start_at: m.start_at,
        end_at: m.end_at,
        // Présents sur les créneaux du module ET cochés sur ce module dans Digiforma (ex. initial / recyclage).
        trainees: base.filter((t) => present(t.id) && followsModule(detail.subsOf, t.id, m.name)),
        whole_session: m.whole,
        synced_at: new Date().toISOString(),
        ...(placeCols ? { df_room: m.room || null, df_trainers: m.trainers?.length ? m.trainers : null } : {}),
        // Jours réels avec leur horaire (demi-journées comprises), sinon les jours seuls.
        ...(daysCol && (m.dayTimes?.length || m.days?.length) ? { df_days: m.dayTimes?.length ? withAttendance(m.dayTimes, detail.bySlot) : m.days } : {}),
      };
    });
    // Valeurs Digiforma précédentes : une salle / un formateur changé sur Digiforma est repris.
    const { data: prevRows } = await supabase.from('digiforma_modules').select(placeCols ? 'key, df_room, df_trainers' : 'key').eq('df_session_id', s.id);
    const prev = new Map(((prevRows as any[]) || []).map((r) => [r.key as string, r]));
    newModules += rows.filter((r) => !prev.has(r.key)).length;
    let { error } = rows.length ? await supabase.from('digiforma_modules').upsert(rows, { onConflict: 'key' }) : { error: null };
    if (error && /df_room|df_trainers|df_days/.test(error.message)) {
      placeCols = placeCols && !/df_room|df_trainers/.test(error.message);
      daysCol = false;
      ({ error } = await supabase.from('digiforma_modules').upsert(rows.map(({ df_room: _r, df_trainers: _t, df_days: _d, ...r }: any) => (placeCols ? { ...r, df_room: _r, df_trainers: _t } : r)), { onConflict: 'key' }));
    }
    if (error) continue;
    modulesSaved += rows.length;

    // Parcours (GEIQ, POEC, alternance… ou session de plus de 4 semaines) : relié au parcours de la plateforme
    // qui a ses stagiaires (ou le même nom) ; sinon parcours personnalisé créé automatiquement, avec ses modules.
    let programId: string | null = null;
    let autoProgram = false;
    let geiqSkipped = false;
    const span = s.startAt && s.endAt ? (new Date(s.endAt.slice(0, 10)).getTime() - new Date(s.startAt.slice(0, 10)).getTime()) / 86400000 : 0;
    const namedParcours = /geiq|poec|parcours|alternance|contrat pro|professionnalisation|apprentissage/i.test(s.name);
    const { count: hasPrior } = await supabase.from('digiforma_modules').select('key', { count: 'exact', head: true }).eq('df_session_id', s.id).not('program_id', 'is', null);
    if (namedParcours || span > 28 || (hasPrior ?? 0) > 0) {
      const real = detail.trainees.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t));
      const byRef = programs.find((p) => p.digiforma_ref === s.id);
      // Parcours déjà retenu pour cette session (choisi à la main en plaçant un module).
      const { data: prior } = await supabase.from('digiforma_modules').select('program_id').eq('df_session_id', s.id).not('program_id', 'is', null).limit(1);
      const priorId = ((prior as any[]) || [])[0]?.program_id || null;
      const sA = (s.startAt || s.modules[0]?.start_at || s.stages[0]?.start_at || '').slice(0, 10);
      const sB = (s.endAt || s.modules[s.modules.length - 1]?.end_at || '').slice(0, 10);
      const priorOk = priorId && programs.some((p) => p.id === priorId && overlaps(p, sA, sB)) ? priorId : null;
      const found = byRef ? null : priorOk ? null : programFor(s.name, real, sA, sB);
      programId = byRef?.id || priorOk || found?.id || null;
      if (programId && !byRef) {
        const t = programs.find((p) => p.id === programId)?.title;
        decisions.push(`« ${s.name.trim()} » → relié au parcours « ${t} » (${priorOk ? 'choisi en plaçant un module' : found?.why})`);
      }
      // Création : seulement si le nom dit clairement que c'est un parcours (GEIQ, POEC…).
      if (!programId && !hasProgRef && namedParcours) decisions.push(`« ${s.name.trim()} » → pas de parcours : migration 61 à exécuter`);
      if (!programId && hasProgRef && namedParcours) {
        const starts = s.modules.map((m) => m.start_at.slice(0, 10)).sort();
        const ends = s.modules.map((m) => m.end_at.slice(0, 10)).sort();
        const { data: np, error: npError } = await supabase
          .from('poec_programs')
          .insert({
            title: s.name,
            start_date: (s.startAt || starts[0]).slice(0, 10),
            end_date: (s.endAt || ends[ends.length - 1]).slice(0, 10),
            kind: 'personnalise',
            ft_token: randomBytes(24).toString('base64url'),
            digiforma_ref: s.id,
            notes: `${AUTO_PROGRAM} (session Digiforma ${s.name}).`,
          })
          .select('id')
          .single();
        if (np) {
          programId = (np as any).id;
          programs.push({ id: programId!, title: s.name, notes: AUTO_PROGRAM, digiforma_ref: s.id, start_date: sA, end_date: sB });
          programsCreated++;
          decisions.push(`« ${s.name.trim()} » → parcours personnalisé créé`);
        } else decisions.push(`« ${s.name.trim()} » → création du parcours impossible : ${npError?.message || 'erreur inconnue'}`);
      }
      if (programId) {
        autoProgram = Boolean(programs.find((p) => p.id === programId)?.notes?.startsWith(AUTO_PROGRAM));
        if (hasProgRef && !byRef && autoProgram) await supabase.from('poec_programs').update({ digiforma_ref: s.id }).eq('id', programId);
        // Stagiaires du parcours : les vrais, sans doublon.
        for (const t of real) {
          const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email, t.company || null);
          if (trainee) await supabase.from('poec_trainees').upsert({ program_id: programId, trainee_id: trainee.id }, { onConflict: 'program_id,trainee_id', ignoreDuplicates: true });
        }
        await supabase.from('digiforma_modules').update({ program_id: programId }).eq('df_session_id', s.id);
        programsLinked++;
        // Parcours GEIQ déjà créé à la main sur le planning : ses modules Digiforma ne sont pas repris,
        // et les sessions créées automatiquement pour lui (jamais placées dans une salle) sont effacées.
        const prog = programs.find((p) => p.id === programId);
        if (prog && /\bgeiq\b/i.test(prog.title) && !String(prog.notes || '').startsWith(AUTO_PROGRAM)) {
          await supabase
            .from('digiforma_modules')
            .update({ covered_by: 'geiq-parcours' })
            .eq('df_session_id', s.id)
            .is('placed_session_id', null)
            .or('covered_by.is.null,covered_by.neq.dismissed');
          const { data: autoSessions } = await supabase.from('sessions').select('id').like('digiforma_ref', `${s.id}:%`).in('room_id', [...holdIds]);
          const ids = ((autoSessions as any[]) || []).map((x) => x.id);
          if (ids.length) {
            await supabase.from('digiforma_modules').update({ placed_session_id: null, covered_by: 'geiq-parcours' }).in('placed_session_id', ids);
            const { error: de } = await supabase.from('sessions').delete().in('id', ids);
            if (!de) geiqCleaned += ids.length;
          }
          geiqSkipped = true;
        }
      }
    }
    // Modules pas encore placés mais déjà sur le planning (créés à la main) : reliés.
    const { data: unplaced } = await supabase.from('digiforma_modules').select('key').eq('df_session_id', s.id).is('placed_session_id', null);
    const open = new Set(((unplaced as any[]) || []).map((u) => u.key));
    for (const r of rows) {
      if (geiqSkipped) break; // parcours GEIQ fait à la main : rien à relier ni à proposer
      if (!open.has(r.key)) continue;
      // Autre module de la même session Digiforma déjà posé cette semaine (une session à modules) : ajouté à celle-ci.
      if (!programId) {
        const g = await attachToGroup(supabase, { ...r, program_id: null });
        if (g) {
          alreadyLinked.add(g);
          linked++;
          continue;
        }
      }
      const hit = findOnPlanning(r.name || s.name, s.name, r.start_at, r.end_at, (r.trainees as DigiformaTrainee[]) || []);
      if (!hit) {
        // Parcours (GEIQ, POEC, personnalisé) déjà posé cette semaine sur le planning.
        const prog = programId || programFor(s.name, (r.trainees as DigiformaTrainee[]) || [], r.start_at.slice(0, 10), r.end_at.slice(0, 10))?.id || null;
        const cov = prog ? coveredBy(prog, r.start_at, r.end_at) : null;
        const { error: ce } = await supabase.from('digiforma_modules').update({ covered_by: cov }).eq('key', r.key).or('covered_by.is.null,covered_by.neq.dismissed');
        if (!ce && cov) covered++;
        continue;
      }
      const { error: le } = await supabase.from('digiforma_modules').update({ placed_session_id: hit }).eq('key', r.key);
      if (!le) {
        alreadyLinked.add(hit);
        linked++;
      }
    }
    // Salle et formateur Digiforma → sessions déjà placées de ces modules : repris s'ils ont changé
    // sur Digiforma, ou si la session n'a pas encore de salle / de formateur (sinon le choix fait sur le planning reste).
    // Jours sans créneau sur Digiforma (férié travaillé, jour sauté…) : jours sans formation des sessions créées depuis Digiforma.
    if (!geiqSkipped) {
      const { data: placedSess } = await supabase.from('digiforma_modules').select('placed_session_id').eq('df_session_id', s.id).not('placed_session_id', 'is', null);
      for (const sid of new Set(((placedSess as any[]) || []).map((x) => x.placed_session_id as string))) {
        if (Date.now() > deadline) break;
        if (daysCol) offDaysSet += await applyDigiformaDays(supabase, sid);
        // Tout relu sur Digiforma (pas sur les lignes enregistrées, qui peuvent dater) : modules, stagiaires, places.
        const { data: onSess } = await supabase.from('digiforma_modules').select('name').eq('placed_session_id', sid);
        const { data: sessRow } = await supabase.from('sessions').select('id, start_at, end_at').eq('id', sid).maybeSingle();
        if (!sessRow || String((sessRow as any).end_at).slice(0, 10) < today) continue; // session terminée : on n'y touche plus
        reservationsSet += await refreshPlacedSession(supabase, sessRow as any, sessionMods, detail, ((onSess as any[]) || []).map((x) => x.name), (n) => (addedLater += n), (n) => (modulesNamed += n));
      }
    }
    if (placeCols && !geiqSkipped) {
      const { data: placedNow } = await supabase.from('digiforma_modules').select('key, placed_session_id').eq('df_session_id', s.id).not('placed_session_id', 'is', null);
      for (const pr of (placedNow as any[]) || []) {
        const r: any = rows.find((x) => x.key === pr.key);
        if (!r || (!r.df_room && !r.df_trainers) || Date.now() > deadline) continue;
        const old = prev.get(pr.key);
        const changed = !old || (old.df_room || null) !== (r.df_room || null) || JSON.stringify(old.df_trainers || null) !== JSON.stringify(r.df_trainers || null);
        const done = await applyDigiformaPlace(supabase, pr.placed_session_id, placeRefs, r.df_room, r.df_trainers, !changed);
        if (done.room) roomsSet++;
        if (done.trainer) trainersSet++;
        placeIssues.push(...done.issues);
      }
    }
    // Stages / périodes en entreprise : périodes du parcours (affichées comme évènements sur le planning).
    if (programId && s.stages.length && !geiqSkipped) {
      const { data: per } = await supabase.from('poec_periods').select('start_date, end_date').eq('program_id', programId);
      const existing = ((per as any[]) || []) as { start_date: string; end_date: string }[];
      for (const blk of mergeBlocks(s.stages)) {
        if (existing.some((e) => e.start_date <= blk.end && e.end_date >= blk.start)) continue;
        const { error: pe } = await supabase.from('poec_periods').insert({ program_id: programId, label: 'Stage en entreprise', start_date: blk.start, end_date: blk.end });
        if (!pe) {
          existing.push({ start_date: blk.start, end_date: blk.end });
          stagePeriods++;
        }
      }
    }
    // Parcours créé depuis Digiforma : ses modules à venir sont créés tout seuls (salle et formateur à choisir).
    if (autoProgram && programId && !geiqSkipped) {
      const { data: still } = await supabase.from('digiforma_modules').select('*').eq('df_session_id', s.id).is('placed_session_id', null);
      for (const m of (still as any[]) || []) {
        if (m.covered_by || Date.now() > deadline) continue; // déjà couvert, ou retiré à la main
        // Aucun vrai stagiaire prévu (fictifs, corbeille, absents de ces créneaux) : pas de module.
        if (!((m.trainees as DigiformaTrainee[]) || []).some((t) => !isPlaceholder(t) && !ignoredTrainees.has(t))) continue;
        const mm = matchModule(m.name || s.name, s.name, catalog);
        const r = await placeModuleRow(supabase, m, mm.confidence === 'sure' ? mm.templateId : null, programId, placeRefs);
        if (r.ok) autoPlaced++;
      }
    }
    // Modules disparus de Digiforma (pas encore placés) : retirés.
    const keep = rows.map((r) => r.key);
    let purge = supabase.from('digiforma_modules').delete().eq('df_session_id', s.id).is('placed_session_id', null).gte('end_at', `${today}T00:00:00`);
    if (keep.length) purge = purge.not('key', 'in', `(${keep.map((k) => `"${k.replace(/"/g, '')}"`).join(',')})`);
    await purge;
  }
  // Sessions supprimées ou annulées sur Digiforma : retirées du planning, même déjà placées,
  // tant qu'elles n'ont pas commencé (une session commencée garde ses émargements et documents).
  const removed = await removeGoneSessions(supabase, listed.sessions, today);

  // Première version de la synchronisation : sessions Digiforma entières (parfois sur des mois) posées dans
  // « À affecter ». Jamais placées (toujours sans salle) : retirées, les modules les remplacent.
  const { data: legacy } = await supabase.from('sessions').select('id').in('room_id', [...holdIds]).like('notes', 'Importée automatiquement de Digiforma%');
  const legacyIds = ((legacy as any[]) || []).map((x) => x.id);
  if (legacyIds.length) await supabase.from('sessions').delete().in('id', legacyIds);

  if (!remaining) {
    const { data: openRows } = await supabase.from('digiforma_modules').select('key, df_session_id').is('placed_session_id', null);
    const gone = ((openRows as any[]) || []).filter((r) => !processed.has(r.df_session_id)).map((r) => r.key);
    for (let i = 0; i < gone.length; i += 200) await supabase.from('digiforma_modules').delete().in('key', gone.slice(i, i + 200)).or('covered_by.is.null,covered_by.neq.dismissed');
  }

  // Modules passés jamais placés : plus utiles.
  await supabase.from('digiforma_modules').delete().is('placed_session_id', null).lt('end_at', `${today}T00:00:00`);

  // Sessions déjà placées : relues sur Digiforma plus haut (refreshPlacedSession), session Digiforma par session Digiforma.
  // Sessions reliées à une session Digiforma par leur référence (saisie sur la fiche).
  const { data: refRows } = await supabase.from('sessions').select('id, digiforma_ref, start_at, end_at').not('digiforma_ref', 'is', null).gte('end_at', `${today}T00:00:00`);
  for (const row of (refRows as any[]) || []) {
    if (Date.now() > deadline) break;
    if (String(row.digiforma_ref).includes(':')) continue; // module placé : traité ci-dessus
    try {
      // Stagiaires de la session Digiforma (clients particuliers et prospects compris), avec leur statut d'inscription ;
      // puis ses modules (noms, jours, qui suit quoi) et les places réservées par entreprise, comme une session placée.
      const [detail, sm] = await Promise.all([digiformaSessionDetail(row.digiforma_ref), digiformaSessionModules(row.digiforma_ref)]);
      reservationsSet += await refreshPlacedSession(supabase, row, sm, detail, [], (n) => (addedLater += n), (n) => (modulesNamed += n));
    } catch {
      // session introuvable sur Digiforma : ignorée
    }
  }

  const log =
    `${modulesSaved} module(s) à venir relu(s) sur ${processed.size}/${todo.length} session(s) en cours lue(s)` +
    (asModule ? ` (${asModule} sous-session(s) de parcours GEIQ / POEC prises comme modules)` : '') +
    `. ${linked} module(s) déjà sur le planning, reliés, et ${covered} couvert(s) par un parcours déjà posé cette semaine (non reproposés). ` +
    (stages ? `${stages} semaine(s) de stage en entreprise, ${stagePeriods} période(s) de stage ajoutée(s) aux parcours. ` : '') +
    (removed.deleted.length ? `${removed.deleted.length} session(s) retirée(s) du planning car supprimée(s) ou annulée(s) sur Digiforma : ${removed.deleted.slice(0, 10).join(', ')}. ` : '') +
    (removed.kept.length ? `Supprimée(s) / annulée(s) sur Digiforma mais déjà commencée(s), gardée(s) sur le planning (à vérifier) : ${removed.kept.slice(0, 10).join(', ')}. ` : '') +
    (legacyIds.length ? `${legacyIds.length} ancienne(s) session(s) entière(s) « À affecter » retirée(s). ` : '') +
    `${programsLinked} parcours Digiforma relié(s) à un parcours de la plateforme, dont ${programsCreated} créé(s) automatiquement ; ${autoPlaced} module(s) de parcours créé(s) automatiquement (salle à choisir). ` +
    (hasProgRef ? '' : 'Migration 61 à exécuter pour créer les parcours automatiquement. ') +
    (geiqCleaned ? `${geiqCleaned} session(s) Digiforma effacée(s) : leur parcours GEIQ est déjà sur le planning. ` : '') +
    (decisions.length ? `Parcours : ${decisions.slice(0, 20).join(' ; ')}. ` : '') +
    `${addedLater} stagiaire(s) ajouté(s) depuis Digiforma aux sessions déjà placées. ` +
    (reservationsSet ? `${reservationsSet} réservation(s) de places par entreprise mise(s) à jour. ` : '') +
    (placeCols
      ? `Salles / formateurs repris de Digiforma : ${roomsSet} salle(s), ${trainersSet} formateur(s)${placeIssues.length ? ` (non repris : ${placeIssues.slice(0, 8).join(' ; ')})` : ''}. `
      : 'Migration 66 à exécuter pour reprendre les salles et formateurs de Digiforma. ') +
    (modulesNamed ? `${modulesNamed} module(s) Digiforma nommé(s) sur les sessions (au lieu de « Jour 1, Jour 2… »). ` : '') +
    (daysCol ? (offDaysSet ? `${offDaysSet} jour(s) sans créneau sur Digiforma retiré(s) des sessions (heures et émargement). ` : '') : 'Migration 67 à exécuter pour suivre les jours réels des créneaux Digiforma. ') +
    `${past} module(s) passé(s) ou lointain(s) ignoré(s).` +
    (remaining ? ` ${remaining} session(s) restante(s) : relance la synchronisation.` : '') +
    (listed.hasStatus
      ? ` ${notPlanned} session(s) non planifiée(s) ignorée(s). Statuts Digiforma : ${[...seenStatus].map(([k, n]) => `${k} (${n})`).join(', ') || 'aucun'}.`
      : ' Statut Digiforma introuvable : toutes les sessions avec des dates sont prises.') +
    (seenRegStatus.size ? ` Statuts d'inscription (clients) : ${[...seenRegStatus].map(([k, n]) => `${k} (${n})`).join(', ')}.` : '') +
    (particuliersReadable() ? ` Clients particuliers trouvés : ${seenParticuliers.size}.` : ' Clients particuliers : champ refusé par l’API Digiforma, non lus.');
  await logSync(supabase, 'ok', log);
  return {
    ok: true,
    created: modulesSaved,
    traineesLinked: addedLater,
    skipped: notPlanned,
    past,
    log,
    remaining,
    changed: removed.deleted.length + offDaysSet + newModules + linked + autoPlaced + addedLater + reservationsSet + modulesNamed + roomsSet + trainersSet + programsCreated + stagePeriods + geiqCleaned + legacyIds.length,
  };
}

/** Statut Digiforma d'une session annulée / perdue. */
function isCancelledStatus(v: string | null) {
  const t = (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /annul|cancel|abandon|lost|perdu|supprim|deleted/.test(t);
}

/**
 * Sessions du planning reliées à une session Digiforma qui n'existe plus (ou
 * annulée) : supprimées si elles n'ont pas commencé, sinon gardées et signalées.
 * Rien n'est fait si la liste Digiforma paraît incomplète (moins de 5 sessions).
 */
export async function removeGoneSessions(
  supabase: SupabaseClient,
  listed: { id: string; status: string | null }[],
  today: string
): Promise<{ deleted: string[]; kept: string[] }> {
  const out = { deleted: [] as string[], kept: [] as string[] };
  if (listed.length < 5) return out;
  const alive = new Map(listed.map((x) => [x.id, x.status]));
  const gone = (id: string) => Boolean(id) && (!alive.has(id) || isCancelledStatus(alive.get(id) ?? null));
  const [{ data: placedRows }, { data: refRows }] = await Promise.all([
    supabase.from('digiforma_modules').select('df_session_id, placed_session_id').not('placed_session_id', 'is', null),
    supabase.from('sessions').select('id, digiforma_ref').not('digiforma_ref', 'is', null).gte('end_at', `${today}T00:00:00`),
  ]);
  const candidates = new Set<string>();
  // Une session qui regroupe plusieurs sessions Digiforma reste si l'une d'elles existe encore.
  const stillLinked = new Set<string>();
  for (const r of (placedRows as any[]) || []) {
    if (gone(String(r.df_session_id))) candidates.add(r.placed_session_id);
    else stillLinked.add(r.placed_session_id);
  }
  // Référence saisie à la main : prise seulement si elle a la forme d'un identifiant Digiforma
  // (jamais un lien, un nom ou une faute de frappe, qui effaceraient une session à tort).
  const numericIds = listed.every((x) => /^\d+$/.test(x.id));
  const knownDf = new Set(((placedRows as any[]) || []).map((r) => String(r.df_session_id)));
  const looksLikeId = (v: string) => knownDf.has(v) || (numericIds ? /^\d{2,}$/.test(v) : false);
  for (const r of (refRows as any[]) || []) {
    const base = String(r.digiforma_ref).split(':')[0].trim();
    if (!looksLikeId(base)) continue;
    if (gone(base)) candidates.add(r.id);
    else stillLinked.add(r.id);
  }
  const ids = [...candidates].filter((id) => !stillLinked.has(id));
  if (!ids.length) return out;
  const nowKey = parisNowKey();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.from('sessions').select('id, title, start_at, end_at').in('id', ids.slice(i, i + 150));
    rows.push(...((data as any[]) || []));
  }
  const label = (r: any) => `« ${r.title} » du ${String(r.start_at).slice(0, 10).split('-').reverse().join('/')}`;
  const toDelete = rows.filter((r) => String(r.start_at).slice(0, 16) > nowKey);
  // Terminée depuis longtemps ou commencée : on n'efface pas l'historique.
  out.kept = rows.filter((r) => String(r.start_at).slice(0, 16) <= nowKey && String(r.end_at).slice(0, 10) >= today).map(label);
  for (let i = 0; i < toDelete.length; i += 150) {
    const part = toDelete.slice(i, i + 150);
    const partIds = part.map((r) => r.id);
    await supabase.from('digiforma_modules').delete().in('placed_session_id', partIds);
    const { error } = await supabase.from('sessions').delete().in('id', partIds);
    if (!error) out.deleted.push(...part.map(label));
  }
  return out;
}

/** Ajoute à une session du planning les stagiaires Digiforma qui n'y sont pas encore (jamais de retrait). */
let ignoredTrainees = new People();

/**
 * Session du planning reliée à une session Digiforma : stagiaires qui manquent
 * (prospects compris), modules (noms, jours, qui suit quoi) et places réservées
 * par entreprise, relus sur Digiforma. placedNames : modules Digiforma placés sur
 * cette session (un nom vide = toute la session) ; aucun = tous ceux de ses dates.
 * Renvoie le nombre de réservations mises à jour.
 */
export async function refreshPlacedSession(
  supabase: SupabaseClient,
  sess: { id: string; start_at: string; end_at: string },
  sm: Parameters<typeof dfBlocksInRange>[0],
  detail: Parameters<typeof dfBlocksInRange>[1] & { companies: DigiformaCompany[] },
  placedNames: (string | null | undefined)[],
  onAdded: (n: number) => void = () => {},
  onModules: (n: number) => void = () => {}
): Promise<number> {
  const names = placedNames.map((n) => String(n || '').trim());
  const all = !names.length || names.some((n) => !n);
  const blocks = dfBlocksInRange(sm, detail, sess.start_at, sess.end_at).filter((b) => all || names.includes(b.name.trim()));
  // Stagiaires d'abord, pour qu'ils aient leurs modules tout de suite.
  onAdded(await addNewTrainees(supabase, sess, blocks.length ? blocks.flatMap((b) => b.trainees) : detail.trainees, true));
  onModules(await writeSessionModules(supabase, sess.id, blocks));
  return syncReservations(supabase, sess.id, companiesFor(detail.companies, blocks.length ? blocks.map((b) => b.name) : null));
}

/** Modules Digiforma qui tombent dans les dates d'une session du planning, avec leurs stagiaires et leurs jours. */
export function dfBlocksInRange(
  sm: { modules: { name: string | null; start: string; end: string | null; startTime: string | null; endTime: string | null; slotIds?: string[]; days?: string[]; dayTimes?: DayTime[] }[] },
  detail: { trainees: DigiformaTrainee[]; bySlot: Record<string, string[]>; subsOf: Record<string, string[]> },
  startAt: string,
  endAt: string
) {
  const a = String(startAt).slice(0, 10);
  const b = String(endAt).slice(0, 10);
  return sm.modules
    .filter((m) => m.name && m.start.slice(0, 10) <= b && (m.end || m.start).slice(0, 10) >= a)
    .map((m) => {
      const present = presentOn(detail, m.slotIds);
      return {
        name: m.name!,
        start_at: toWallClock(m.start, m.startTime, '08:00'),
        end_at: toWallClock(m.end || m.start, m.endTime, '16:00'),
        trainees: detail.trainees.filter((t) => present(t.id) && followsModule(detail.subsOf, t.id, m.name)),
        days: (m.dayTimes?.length ? withAttendance(m.dayTimes, detail.bySlot) : m.days) || null,
      };
    });
}

/**
 * Émargement Digiforma des créneaux d'un module : le stagiaire y est-il prévu ?
 * Un stagiaire absent de tout l'émargement de la session (prospect pas encore
 * placé sur les créneaux…) n'est pas écarté : l'émargement ne dit rien de lui.
 */
export function presentOn(detail: { bySlot: Record<string, string[]> }, slotIds: string[] | undefined): (id: string) => boolean {
  const known = (slotIds || []).filter((id) => id in detail.bySlot);
  if (!known.length) return () => true;
  const here = new Set(known.flatMap((id) => detail.bySlot[id]));
  const anywhere = new Set(Object.values(detail.bySlot).flat());
  return (id) => here.has(id) || !anywhere.has(id);
}

const DF_NOTE = 'Places prévues sur Digiforma (synchronisation)';
const companyKey2 = (v: string | null | undefined) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plainName = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Clients entreprise concernés par une session du planning (modules cochés sur Digiforma ∩ modules de la session). */
export function companiesFor(companies: DigiformaCompany[], moduleNames: (string | null | undefined)[] | null): DigiformaCompany[] {
  const mods = new Set((moduleNames || []).filter(Boolean).map((n) => plainName(String(n))));
  return companies.filter((c) => !mods.size || !c.subs.length || c.subs.some((x) => mods.has(plainName(x))));
}

/**
 * Places réservées par entreprise d'après Digiforma : apprenants prévus par un
 * client entreprise mais pas encore nommés (ex. « CTI ELEC · 1 » sans nom).
 * En attente si le client est un prospect. Seules les réservations créées par la
 * synchronisation sont modifiées ; une réservation faite à la main est gardée.
 */
export async function syncReservations(supabase: SupabaseClient, sessionId: string, companies: DigiformaCompany[]): Promise<number> {
  const probe = await supabase.from('session_reservations').select('id, company, seats, status, note').eq('session_id', sessionId);
  if (probe.error) return 0; // migrations 20 / 50 absentes
  const rows = (probe.data as any[]) || [];
  // Places voulues par entreprise et par statut.
  const want = new Map<string, { company: string; status: 'validee' | 'en_attente'; unnamed: number }>();
  for (const c of companies) {
    const k = `${companyKey2(c.name)}|${c.status}`;
    const e = want.get(k) || { company: c.name, status: c.status, unnamed: 0 };
    e.unnamed += Math.max(0, c.total - c.named.length);
    want.set(k, e);
  }
  // Places validées : un stagiaire validé de la même entreprise occupe une place (voir lib/reservations) ; on les ajoute.
  const { data: links } = await supabase.from('session_trainees').select('status, trainees(company)').eq('session_id', sessionId).eq('status', 'validee');
  const validatedOf = (company: string) => ((links as any[]) || []).filter((l) => companyKey2((Array.isArray(l.trainees) ? l.trainees[0] : l.trainees)?.company) === companyKey2(company)).length;
  let changed = 0;
  const kept = new Set<string>();
  for (const w of want.values()) {
    const manual = rows.find((r) => r.note !== DF_NOTE && companyKey2(r.company) === companyKey2(w.company));
    if (manual) continue; // réservation faite à la main : on n'y touche pas
    const mine = rows.find((r) => r.note === DF_NOTE && companyKey2(r.company) === companyKey2(w.company) && (r.status || 'validee') === w.status);
    const seats = Math.min(200, w.unnamed + (w.status === 'validee' && w.unnamed ? validatedOf(w.company) : 0));
    if (!w.unnamed) continue;
    if (mine) {
      kept.add(mine.id);
      if (mine.seats !== seats) {
        await supabase.from('session_reservations').update({ seats }).eq('id', mine.id);
        changed++;
      }
    } else {
      const { error } = await supabase.from('session_reservations').insert({ session_id: sessionId, company: w.company, seats, note: DF_NOTE, status: w.status });
      if (!error) changed++;
    }
  }
  // Places nommées depuis (ou client retiré) : réservation de la synchronisation supprimée.
  const gone = rows.filter((r) => r.note === DF_NOTE && !kept.has(r.id)).map((r) => r.id);
  if (gone.length) {
    await supabase.from('session_reservations').delete().in('id', gone);
    changed += gone.length;
  }
  return changed;
}

/** Colonnes de suivi Digiforma (migration 70) : null = pas encore vérifié. */
let dfTrackCols: boolean | null = null;
async function trackCols(supabase: SupabaseClient): Promise<boolean> {
  if (dfTrackCols === null) {
    const [a, b] = await Promise.all([
      supabase.from('trainees').select('digiforma_id').limit(1),
      supabase.from('session_trainees').select('from_digiforma').limit(1),
    ]);
    dfTrackCols = !a.error && !b.error;
  }
  return dfTrackCols;
}

/** Entreprise affichée pour un stagiaire Digiforma : son entreprise cliente, ou « Particulier ». */
const companyFromDf = (t: DigiformaTrainee) => (t.particulier ? 'Particulier' : t.company || null);

/**
 * Stagiaires Digiforma → session du planning : ajoute ceux qui manquent, met à
 * jour ceux qui ont changé sur Digiforma (nom, e-mail, entreprise ou
 * « Particulier », inscription confirmée), et — si `complete` — retire ceux qui
 * ne sont plus sur la session Digiforma (déplacés, client annulé), seulement
 * s'ils venaient de Digiforma et que la session n'a pas commencé.
 */
export async function addNewTrainees(
  supabase: SupabaseClient,
  row: { id: string; start_at: string; end_at: string },
  remoteAll: DigiformaTrainee[],
  complete = false
): Promise<number> {
  // Jamais de stagiaire fictif (« Apprenant A ») ni mis à la corbeille.
  const seenIds = new Set<string>();
  const remote = remoteAll.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t) && !seenIds.has(t.id) && Boolean(seenIds.add(t.id)));
  const track = await trackCols(supabase);
  const cols = track
    ? 'trainee_id, status, from_digiforma, trainees(id, email, full_name, first_name, last_name, company, digiforma_id)'
    : 'trainee_id, status, trainees(id, email, full_name, first_name, last_name, company)';
  const { data: links } = await supabase.from('session_trainees').select(cols).eq('session_id', row.id);
  const byDf = new Map<string, any>();
  const emails = new Map<string, any>();
  const names = new Map<string, any>();
  for (const l of (links as any[]) || []) {
    const t = Array.isArray(l.trainees) ? l.trainees[0] : l.trainees;
    l.t = t;
    if (t?.digiforma_id) byDf.set(String(t.digiforma_id), l);
    if (t?.email) emails.set(String(t.email).trim().toLowerCase(), l);
    for (const n of [t?.full_name, `${t?.first_name || ''} ${t?.last_name || ''}`]) if (n && n.trim()) names.set(nameKey(n), l);
  }
  let added = 0;
  const matched = new Set<string>();
  for (const t of remote) {
    const have = byDf.get(t.id) || (t.email && emails.get(t.email.trim().toLowerCase())) || names.get(nameKey(`${t.firstName || ''} ${t.lastName || ''}`));
    if (have) {
      if (matched.has(have.trainee_id)) continue;
      matched.add(have.trainee_id);
      // Fiche du stagiaire : ce qui a changé sur Digiforma (jamais d'e-mail vidé).
      const cur = have.t || {};
      const upd: Record<string, any> = {};
      const company = companyFromDf(t);
      if (company && company !== cur.company) upd.company = company;
      if (t.email && t.email.trim().toLowerCase() !== String(cur.email || '').trim().toLowerCase()) {
        const { data: other } = await supabase.from('trainees').select('id').ilike('email', t.email.trim()).neq('id', have.trainee_id).limit(1);
        if (!(other as any[])?.length) upd.email = t.email.trim();
      }
      if (track && cur.digiforma_id !== t.id) upd.digiforma_id = t.id;
      // Nom corrigé sur Digiforma (même fiche Digiforma) : repris.
      if (track && cur.digiforma_id === t.id && t.lastName && (t.lastName.trim() !== String(cur.last_name || '').trim() || (t.firstName || '').trim() !== String(cur.first_name || '').trim())) {
        upd.first_name = (t.firstName || '').trim() || null;
        upd.last_name = t.lastName.trim();
        upd.full_name = `${upd.first_name ? `${upd.first_name} ` : ''}${upd.last_name}`;
      }
      if (Object.keys(upd).length) {
        const { error } = await supabase.from('trainees').update(upd).eq('id', have.trainee_id);
        if (error && upd.full_name) {
          delete upd.first_name;
          delete upd.last_name;
          delete upd.full_name;
          if (Object.keys(upd).length) await supabase.from('trainees').update(upd).eq('id', have.trainee_id);
        }
      }
      // Prospect devenu inscrit sur Digiforma : validé ici aussi (jamais l'inverse, ni s'il est pris ailleurs).
      const link: Record<string, any> = {};
      if (track && !have.from_digiforma) link.from_digiforma = true;
      if (have.status === 'en_attente' && t.status !== 'en_attente') {
        const conflict = await findTraineeConflict(supabase, have.trainee_id, row.start_at, row.end_at, row.id);
        if (!conflict) link.status = 'validee';
      }
      if (Object.keys(link).length) await supabase.from('session_trainees').update(link).eq('session_id', row.id).eq('trainee_id', have.trainee_id);
      continue;
    }
    // Déjà connu par sa fiche Digiforma (nom ou e-mail changé depuis) : même stagiaire, pas de doublon.
    let trainee: { id: string } | null = null;
    if (track) {
      const { data: known } = await supabase.from('trainees').select('id').eq('digiforma_id', t.id).limit(1);
      if ((known as any[])?.length) trainee = { id: (known as any[])[0].id };
    }
    trainee ||= await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email, companyFromDf(t));
    if (!trainee) continue;
    if (matched.has(trainee.id)) continue;
    matched.add(trainee.id);
    if (track) await supabase.from('trainees').update({ digiforma_id: t.id }).eq('id', trainee.id).is('digiforma_id', null);
    const conflict = await findTraineeConflict(supabase, trainee.id, row.start_at, row.end_at, row.id);
    const { data: ins, error } = await supabase
      .from('session_trainees')
      // Inscription indécise (ou autre) sur Digiforma, ou créneau déjà pris : en attente.
      .upsert(
        { session_id: row.id, trainee_id: trainee.id, status: conflict || t.status === 'en_attente' ? 'en_attente' : 'validee', ...(track ? { from_digiforma: true } : {}) },
        { onConflict: 'session_id,trainee_id', ignoreDuplicates: true }
      )
      .select('trainee_id');
    if (!error && (ins as any[] | null)?.length) added++;
  }
  // Plus sur la session Digiforma (déplacé sur une autre session, client annulé…) : retiré d'ici,
  // seulement s'il venait de Digiforma, avant le début de la session, et si Digiforma a tout renvoyé.
  if (complete && track && remote.length && particuliersReadable() && String(row.start_at).slice(0, 16) > parisNow()) {
    const gone = ((links as any[]) || []).filter((l) => l.from_digiforma && !matched.has(l.trainee_id)).map((l) => l.trainee_id as string);
    if (gone.length) {
      await supabase.from('session_trainee_modules').delete().eq('session_id', row.id).in('trainee_id', gone);
      await supabase.from('session_trainees').delete().eq('session_id', row.id).in('trainee_id', gone);
    }
  }
  return added;
}

/** Heure de Paris « AAAA-MM-JJTHH:MM » (les sessions sont enregistrées à l'heure affichée). */
function parisNow(): string {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
  return p.replace(' ', 'T');
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

/** Stage / période en entreprise (POEC, GEIQ) : rien à placer en salle. */
export function isCompanyPeriod(name: string) {
  const t = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\bstage\b|en entreprise|periode (en )?entreprise|immersion|pmsmp|\bpae\b|\bafest\b/.test(t);
}

/** Marque des parcours créés par la synchronisation (leurs modules sont créés automatiquement). */
const AUTO_PROGRAM = 'Parcours créé automatiquement depuis Digiforma';

/** Vacances, fermeture, absence, férié… : aucune formation ces jours-là. */
export function isOffPeriod(name: string) {
  const t = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /vacances|conges?\b|ferie|fermeture|absence|interruption|pause|rattrapage employeur|en attente de/.test(t);
}

/** Semaines de stage qui se suivent → une seule période (dates AAAA-MM-JJ). */
function mergeBlocks(list: { start_at: string; end_at: string }[]) {
  const out: { start: string; end: string }[] = [];
  for (const b of [...list].sort((x, y) => x.start_at.localeCompare(y.start_at))) {
    const st = b.start_at.slice(0, 10);
    const en = b.end_at.slice(0, 10);
    const last = out[out.length - 1];
    if (last && (new Date(st).getTime() - new Date(last.end).getTime()) / 86400000 <= 3) {
      if (en > last.end) last.end = en;
    } else out.push({ start: st, end: en });
  }
  return out;
}
