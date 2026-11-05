import type { SupabaseClient } from '@supabase/supabase-js';
import { digiformaFetchSessionTrainees, digiformaListModules, digiformaSessionDetail, isPlannedStatus, seenRegStatus, toWallClock, type DigiformaTrainee } from '@/lib/digiforma';
import { findOrCreateTrainee, findTraineeConflict } from '@/lib/trainee-conflict';
import { matchCatalog, matchModule } from '@/lib/catalog-match';
import { randomBytes } from 'crypto';
import { placeModuleRow } from '@/lib/digiforma-place';
import { People, isPlaceholder } from '@/lib/digiforma-people';

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
  seenRegStatus.clear();
  // Corbeille de la page Stagiaires (migration 60) : ces personnes ne sont jamais ajoutées.
  const { data: trashedRows } = await supabase.from('trainees').select('email, full_name, first_name, last_name').not('trashed_at', 'is', null).limit(5000);
  ignoredTrainees = new People();
  for (const t of (trashedRows as any[]) || []) ignoredTrainees.add(t);
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
  let stages = 0;
  type Mod = { key: string; name: string | null; start_at: string; end_at: string; whole: boolean; slotIds: string[] };
  const todo: { id: string; name: string; startAt: string | null; endAt: string | null; modules: Mod[]; stages: Mod[] }[] = [];
  // Sous-sessions des parcours (GEIQ…) : déjà prises comme modules de leur session parente.
  const subIds = new Set(
    listed.sessions
      .filter((x) => x.fromSubsessions && (!listed.hasStatus || isPlannedStatus(x.status)))
      .flatMap((x) => x.modules.map((m) => m.key.split('~')[0]))
  );
  let asModule = 0;
  for (const s of listed.sessions) {
    if (subIds.has(s.id)) {
      asModule++;
      continue;
    }
    if (listed.hasStatus) {
      const st = s.status || '(vide)';
      seenStatus.set(st, (seenStatus.get(st) || 0) + 1);
      if (!isPlannedStatus(s.status)) {
        notPlanned++;
        continue;
      }
    }
    const raw = s.modules.length
      ? s.modules.map((m) => ({ key: `${s.id}:${m.key}`, name: m.name, start_at: toWallClock(m.start, m.startTime, '08:00'), end_at: toWallClock(m.end || m.start, m.endTime, '16:00'), whole: false, slotIds: m.slotIds || [] }))
      : s.startAt && s.endAt && new Date(s.endAt.slice(0, 10)).getTime() - new Date(s.startAt.slice(0, 10)).getTime() <= 6 * 86400000
        ? [{ key: `${s.id}:session`, name: null, start_at: toWallClock(s.startAt, null, '08:00'), end_at: toWallClock(s.endAt, null, '16:00'), whole: true, slotIds: [] as string[] }]
        : [];
    const inRange = (m: { start_at: string; end_at: string }) => m.end_at.slice(0, 10) >= today && m.start_at.slice(0, 10) <= horizon && m.end_at >= m.start_at;
    // Stage / période en entreprise : un évènement du parcours (période de stage), pas un module en salle.
    const stageBlocks = raw.filter((m) => isCompanyPeriod(m.name || '') && inRange(m));
    // Vacances, fermeture, absence… : rien à placer.
    const notStage = raw.filter((m) => !isCompanyPeriod(m.name || '') && !isOffPeriod(m.name || ''));
    stages += stageBlocks.length;
    const upcoming = notStage.filter(inRange);
    past += raw.length - upcoming.length;
    if (upcoming.length || stageBlocks.length) todo.push({ id: s.id, name: s.name, startAt: s.startAt, endAt: s.endAt, modules: upcoming, stages: stageBlocks });
  }
  // Les plus proches d'abord (si le temps manque, la suite est reprise au prochain passage).
  const firstOf = (x: { modules: Mod[]; stages: Mod[] }) => (x.modules[0] || x.stages[0]).start_at;
  todo.sort((a, b) => firstOf(a).localeCompare(firstOf(b)));

  // Sessions déjà sur le planning (même formation, mêmes dates) : le module y est relié, pas reproposé.
  const { data: tplRows } = await supabase.from('templates').select('id, title');
  const catalog = ((tplRows as any[]) || []).map((t) => ({ id: t.id as string, title: t.title as string }));
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
  const programs = ((progRows as any[]) || []).map((p) => ({ id: p.id as string, title: p.title as string, notes: (p.notes as string | null) ?? null, digiforma_ref: (p.digiforma_ref as string | null) ?? null }));
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
  const programFor = (dfName: string, all: DigiformaTrainee[]): string | null => {
    const trainees = all.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t));
    const byTitle = matchCatalog(dfName, programs, '');
    if (byTitle.templateId && byTitle.score >= 0.55) return byTitle.templateId;
    if (!trainees.length) return null;
    let best: { id: string; n: number } | null = null;
    for (const p of programs) {
      const e = progPeople.get(p.id);
      if (!e) continue;
      const n = trainees.filter((t) => (t.email && e.emails.has(t.email.trim().toLowerCase())) || e.names.has(nameKey(`${t.firstName || ''} ${t.lastName || ''}`))).length;
      if (n >= Math.max(1, Math.ceil(trainees.length / 2)) && (!best || n > best.n)) best = { id: p.id, n };
    }
    return best?.id || null;
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

  let modulesSaved = 0;
  let remaining = 0;
  let programsCreated = 0;
  let programsLinked = 0;
  let autoPlaced = 0;
  let stagePeriods = 0;
  for (const s of todo) {
    if (Date.now() > deadline) {
      remaining++;
      continue;
    }
    let detail: { trainees: DigiformaTrainee[]; byModule: Record<string, DigiformaTrainee[]>; bySlot: Record<string, string[]> };
    try {
      detail = await digiformaSessionDetail(s.id);
    } catch {
      continue;
    }
    const rows = s.modules.map((m) => {
      const own = detail.byModule[m.key.slice(s.id.length + 1).split('~')[0]];
      // Présence par créneau (Digiforma) : seulement les stagiaires prévus ces jours-là.
      const known = m.slotIds.filter((id) => id in detail.bySlot);
      const present = known.length ? new Set(known.flatMap((id) => detail.bySlot[id])) : null;
      const base = own && own.length ? own : detail.trainees;
      return {
        key: m.key,
        df_session_id: s.id,
        df_session_name: s.name,
        name: m.name,
        start_at: m.start_at,
        end_at: m.end_at,
        trainees: present ? base.filter((t) => present.has(t.id)) : base,
        whole_session: m.whole,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = rows.length ? await supabase.from('digiforma_modules').upsert(rows, { onConflict: 'key' }) : { error: null };
    if (error) continue;
    modulesSaved += rows.length;

    // Parcours (GEIQ, POEC, alternance… ou session de plus de 4 semaines) : relié au parcours de la plateforme
    // qui a ses stagiaires (ou le même nom) ; sinon parcours personnalisé créé automatiquement, avec ses modules.
    let programId: string | null = null;
    let autoProgram = false;
    const span = s.startAt && s.endAt ? (new Date(s.endAt.slice(0, 10)).getTime() - new Date(s.startAt.slice(0, 10)).getTime()) / 86400000 : 0;
    const namedParcours = /geiq|poec|parcours|alternance|contrat pro|professionnalisation|apprentissage/i.test(s.name);
    if (namedParcours || span > 28) {
      const real = detail.trainees.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t));
      const byRef = programs.find((p) => p.digiforma_ref === s.id);
      programId = byRef?.id || programFor(s.name, real);
      // Création : seulement si le nom dit clairement que c'est un parcours (GEIQ, POEC…).
      if (!programId && hasProgRef && namedParcours) {
        const starts = s.modules.map((m) => m.start_at.slice(0, 10)).sort();
        const ends = s.modules.map((m) => m.end_at.slice(0, 10)).sort();
        const { data: np } = await supabase
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
          programs.push({ id: programId!, title: s.name, notes: AUTO_PROGRAM, digiforma_ref: s.id });
          programsCreated++;
        }
      }
      if (programId) {
        autoProgram = Boolean(programs.find((p) => p.id === programId)?.notes?.startsWith(AUTO_PROGRAM));
        if (hasProgRef && !byRef && autoProgram) await supabase.from('poec_programs').update({ digiforma_ref: s.id }).eq('id', programId);
        // Stagiaires du parcours : les vrais, sans doublon.
        for (const t of real) {
          const trainee = await findOrCreateTrainee(supabase, { first_name: t.firstName, last_name: t.lastName }, t.email);
          if (trainee) await supabase.from('poec_trainees').upsert({ program_id: programId, trainee_id: trainee.id }, { onConflict: 'program_id,trainee_id', ignoreDuplicates: true });
        }
        await supabase.from('digiforma_modules').update({ program_id: programId }).eq('df_session_id', s.id);
        programsLinked++;
      }
    }
    // Modules pas encore placés mais déjà sur le planning (créés à la main) : reliés.
    const { data: unplaced } = await supabase.from('digiforma_modules').select('key').eq('df_session_id', s.id).is('placed_session_id', null);
    const open = new Set(((unplaced as any[]) || []).map((u) => u.key));
    for (const r of rows) {
      if (!open.has(r.key)) continue;
      const hit = findOnPlanning(r.name || s.name, s.name, r.start_at, r.end_at, (r.trainees as DigiformaTrainee[]) || []);
      if (!hit) {
        // Parcours (GEIQ, POEC, personnalisé) déjà posé cette semaine sur le planning.
        const prog = programFor(s.name, (r.trainees as DigiformaTrainee[]) || []);
        const cov = prog ? coveredBy(prog, r.start_at, r.end_at) : null;
        const { error: ce } = await supabase.from('digiforma_modules').update({ covered_by: cov }).eq('key', r.key);
        if (!ce && cov) covered++;
        continue;
      }
      const { error: le } = await supabase.from('digiforma_modules').update({ placed_session_id: hit }).eq('key', r.key);
      if (!le) {
        alreadyLinked.add(hit);
        linked++;
      }
    }
    // Stages / périodes en entreprise : périodes du parcours (affichées comme évènements sur le planning).
    if (programId && s.stages.length) {
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
    if (autoProgram && programId) {
      const { data: still } = await supabase.from('digiforma_modules').select('*').eq('df_session_id', s.id).is('placed_session_id', null);
      for (const m of (still as any[]) || []) {
        if (m.covered_by || Date.now() > deadline) continue;
        // Aucun vrai stagiaire prévu (fictifs, corbeille, absents de ces créneaux) : pas de module.
        if (!((m.trainees as DigiformaTrainee[]) || []).some((t) => !isPlaceholder(t) && !ignoredTrainees.has(t))) continue;
        const mm = matchModule(m.name || s.name, s.name, catalog);
        const r = await placeModuleRow(supabase, m, mm.confidence === 'sure' ? mm.templateId : null, programId);
        if (r.ok) autoPlaced++;
      }
    }
    // Modules disparus de Digiforma (pas encore placés) : retirés.
    const keep = rows.map((r) => r.key);
    let purge = supabase.from('digiforma_modules').delete().eq('df_session_id', s.id).is('placed_session_id', null).gte('end_at', `${today}T00:00:00`);
    if (keep.length) purge = purge.not('key', 'in', `(${keep.map((k) => `"${k.replace(/"/g, '')}"`).join(',')})`);
    await purge;
  }
  // Première version de la synchronisation : sessions Digiforma entières (parfois sur des mois) posées dans
  // « À affecter ». Jamais placées (toujours sans salle) : retirées, les modules les remplacent.
  const { data: legacy } = await supabase.from('sessions').select('id').in('room_id', [...holdIds]).like('notes', 'Importée automatiquement de Digiforma%');
  const legacyIds = ((legacy as any[]) || []).map((x) => x.id);
  if (legacyIds.length) await supabase.from('sessions').delete().in('id', legacyIds);

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
    `${modulesSaved} module(s) à venir relu(s) sur ${todo.length} session(s) planifiée(s) ou en cours` +
    (asModule ? ` (${asModule} sous-session(s) de parcours GEIQ / POEC prises comme modules)` : '') +
    `. ${linked} module(s) déjà sur le planning, reliés, et ${covered} couvert(s) par un parcours déjà posé cette semaine (non reproposés). ` +
    (stages ? `${stages} semaine(s) de stage en entreprise, ${stagePeriods} période(s) de stage ajoutée(s) aux parcours. ` : '') +
    (legacyIds.length ? `${legacyIds.length} ancienne(s) session(s) entière(s) « À affecter » retirée(s). ` : '') +
    `${programsLinked} parcours Digiforma relié(s) à un parcours de la plateforme, dont ${programsCreated} créé(s) automatiquement ; ${autoPlaced} module(s) de parcours créé(s) automatiquement (salle à choisir). ` +
    (hasProgRef ? '' : 'Migration 61 à exécuter pour créer les parcours automatiquement. ') +
    `${addedLater} stagiaire(s) ajouté(s) depuis Digiforma aux sessions déjà placées. ` +
    `${past} module(s) passé(s) ou lointain(s) ignoré(s).` +
    (remaining ? ` ${remaining} session(s) restante(s) : relance la synchronisation.` : '') +
    (listed.hasStatus
      ? ` ${notPlanned} session(s) non planifiée(s) ignorée(s). Statuts Digiforma : ${[...seenStatus].map(([k, n]) => `${k} (${n})`).join(', ') || 'aucun'}.`
      : ' Statut Digiforma introuvable : toutes les sessions avec des dates sont prises.') +
    (listed.hasModules ? '' : ' Aucun champ « modules » trouvé dans l’API : sessions entières utilisées.') +
    (seenRegStatus.size ? ` Statuts d'inscription (clients) : ${[...seenRegStatus].map(([k, n]) => `${k} (${n})`).join(', ')}.` : '');
  await logSync(supabase, 'ok', log);
  return { ok: true, created: modulesSaved, traineesLinked: addedLater, skipped: notPlanned, past, log };
}

/** Ajoute à une session du planning les stagiaires Digiforma qui n'y sont pas encore (jamais de retrait). */
let ignoredTrainees = new People();

export async function addNewTrainees(supabase: SupabaseClient, row: { id: string; start_at: string; end_at: string }, remoteAll: DigiformaTrainee[]): Promise<number> {
  // Jamais de stagiaire fictif (« Apprenant A ») ni mis à la corbeille.
  const remote = remoteAll.filter((t) => !isPlaceholder(t) && !ignoredTrainees.has(t));
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
      // Inscription indécise (ou autre) sur Digiforma, ou créneau déjà pris : en attente.
      .upsert({ session_id: row.id, trainee_id: trainee.id, status: conflict || t.status === 'en_attente' ? 'en_attente' : 'validee' }, { onConflict: 'session_id,trainee_id', ignoreDuplicates: true })
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
