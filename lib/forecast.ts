/**
 * Planning prévisionnel : « IA » de prévision (sans service payant).
 * À partir de l'historique des sessions, elle repère les formations qui
 * reviennent (rythme, jour de la semaine, durée, salle, formateur, horaires)
 * et propose leurs prochaines dates. Ce sont des estimations, jamais des
 * sessions : le bureau les positionne ensuite sur le vrai planning.
 */

import { isWorkingDay } from '@/lib/holidays';

export type ForecastStatus = 'prevu' | 'place' | 'ignore';

export type Forecast = {
  id: string;
  ai_key: string | null;
  source: 'ia' | 'manuel';
  status: ForecastStatus;
  template_id: string | null;
  title: string;
  room_id: string | null;
  trainer_id: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  confidence: number | null;
  reason: string | null;
  placed_session_id: string | null;
};

export type HistSession = {
  id?: string;
  title: string;
  template_id: string | null;
  room_id: string | null;
  trainer_id: string | null;
  start_at: string;
  end_at: string;
  status?: string;
};

export type Proposal = Omit<Forecast, 'id' | 'status' | 'placed_session_id'> & { source: 'ia' };

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00Z');
const addD = (s: string, n: number) => iso(new Date(at(s).getTime() + n * DAY));
const diffD = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / DAY);
const dow = (s: string) => (at(s).getUTCDay() + 6) % 7; // lundi = 0
const mondayIso = (s: string) => addD(s, -dow(s));
const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(session|groupe|gr|n°|no)\b.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Jours ouvrés d'une session (week-ends et fériés non travaillés exclus). */
function workDays(start: string, end: string) {
  const out: string[] = [];
  for (let d = start.slice(0, 10); d <= end.slice(0, 10); d = addD(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}
/** Fin d'une session de n jours ouvrés commençant à `start`. */
function endAfter(start: string, n: number) {
  let d = start;
  let left = Math.max(1, n) - 1;
  while (left > 0) {
    d = addD(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}
/** Premier jour ouvré à partir de `d`. */
function nextWorking(d: string) {
  let x = d;
  for (let i = 0; i < 10 && !isWorkingDay(x); i++) x = addD(x, 1);
  return x;
}
function mode<T>(list: T[]): T | null {
  const m = new Map<T, number>();
  for (const v of list) if (v != null) m.set(v, (m.get(v) || 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [k, c] of m) if (c > n) [best, n] = [k, c];
  return best;
}
function median(list: number[]) {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
const time = (s: string) => s.slice(11, 16) || '';

/**
 * Prévisions de `from` (lundi) à `to` (inclus).
 *  · history : sessions passées (12 à 18 mois), hors brouillons ;
 *  · planned : sessions réelles déjà sur le planning (à venir) ;
 *  · taken : autres prévisions déjà posées (manuelles, positionnées) ;
 *  · skip : clés déjà ignorées ou déjà posées (pas reproposées).
 */
export function forecastSessions(input: {
  history: HistSession[];
  planned: HistSession[];
  taken?: { room_id: string | null; start_date: string; end_date: string }[];
  skip?: Set<string>;
  rooms: { id: string; name: string }[];
  roomNames?: Record<string, string>;
  trainerNames?: Record<string, string>;
  from: string;
  to: string;
  today: string;
}): Proposal[] {
  const { from, to, today } = input;
  const yearAgo = addD(today, -365);
  const groups = new Map<string, HistSession[]>();
  for (const s of input.history) {
    if (!s.start_at || s.start_at.slice(0, 10) >= today) continue;
    const key = s.template_id || `t:${norm(s.title)}`;
    if (!key || key === 't:') continue;
    (groups.get(key) || groups.set(key, []).get(key)!).push(s);
  }
  const keyOf = (s: HistSession) => s.template_id || `t:${norm(s.title)}`;

  // Occupation des salles (vraies sessions + prévisions déjà retenues).
  const busy = new Map<string, Set<string>>();
  const occupy = (room: string | null, a: string, b: string) => {
    if (!room) return;
    const set = busy.get(room) || busy.set(room, new Set()).get(room)!;
    for (const d of workDays(a, b)) set.add(d);
  };
  for (const p of input.planned) occupy(p.room_id, p.start_at.slice(0, 10), p.end_at.slice(0, 10));
  for (const t of input.taken || []) occupy(t.room_id, t.start_date, t.end_date);
  const free = (room: string, a: string, b: string) => !workDays(a, b).some((d) => busy.get(room)?.has(d));

  const out: Proposal[] = [];
  for (const [key, list0] of groups) {
    const list = [...list0].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const recent = list.filter((s) => s.start_at.slice(0, 10) >= yearAgo);
    const last = list[list.length - 1];
    const sample = list.slice(-8);
    const title = mode(sample.map((s) => s.title)) || last.title;
    const dur = mode(sample.map((s) => workDays(s.start_at, s.end_at).length || 1)) || 1;
    const wday = mode(sample.map((s) => dow(s.start_at))) ?? 0;
    const startTime = mode(sample.map((s) => time(s.start_at)).filter(Boolean)) || '08:00';
    const endTime = mode(sample.map((s) => time(s.end_at)).filter(Boolean)) || '16:00';
    const roomsUsed = sample.map((s) => s.room_id).filter(Boolean) as string[];
    const room0 = mode(roomsUsed);
    const trainer = mode(sample.map((s) => s.trainer_id).filter(Boolean) as string[]);
    const roomOrder = [...new Set([room0, ...roomsUsed].filter(Boolean))] as string[];
    const plannedSame = input.planned.filter((p) => keyOf(p) === key);
    const dayName = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][wday];
    const who = [room0 && input.roomNames?.[room0] ? `en ${input.roomNames[room0]}` : '', trainer && input.trainerNames?.[trainer] ? `avec ${input.trainerNames[trainer]}` : '']
      .filter(Boolean)
      .join(' ');

    // Dates candidates : rythme régulier (3 fois ou plus en 12 mois), sinon même période que l'an dernier.
    const dates: { start: string; confidence: number; reason: string; window: number }[] = [];
    if (recent.length >= 3) {
      const starts = recent.map((s) => s.start_at.slice(0, 10));
      const gaps = starts.slice(1).map((d, i) => diffD(starts[i], d)).filter((g) => g > 0);
      const gap = Math.min(120, Math.max(7, median(gaps) || 30));
      const spread = median(gaps.map((g) => Math.abs(g - gap))) / gap;
      const regular = Math.max(0, 1 - Math.min(1, spread));
      const confidence = Math.round(Math.min(95, 35 + regular * 35 + Math.min(25, recent.length * 2.5)));
      const every = gap % 7 === 0 || gap > 10 ? `toutes les ~${Math.round(gap / 7)} semaine${Math.round(gap / 7) > 1 ? 's' : ''}` : `tous les ~${gap} jours`;
      const reason = `Revient ${every} (${recent.length} fois en 12 mois), souvent le ${dayName}${who ? ` ${who}` : ''}.`;
      let d = addD(last.start_at.slice(0, 10), gap);
      // Rattrapage : si la dernière date est loin, on avance jusqu'à la période voulue.
      for (let i = 0; i < 60 && d < from; i++) d = addD(d, gap);
      for (let i = 0; i < 26 && d <= to; i++, d = addD(d, gap)) dates.push({ start: d, confidence, reason, window: Math.max(5, Math.min(14, Math.round(gap / 2))) });
    } else {
      for (const s of list) {
        const ly = s.start_at.slice(0, 10);
        const next = addD(ly, 364); // même jour de la semaine, un an plus tard
        if (next >= from && next <= to)
          dates.push({ start: next, confidence: 45, reason: `Même période l’an dernier (semaine du ${mondayIso(ly).split('-').reverse().join('/')})${who ? `, ${who}` : ''}.`, window: 21 });
      }
    }

    for (const c of dates) {
      // Jour habituel de la semaine, dans la même semaine.
      const start = nextWorking(addD(mondayIso(c.start), wday));
      if (start < from || start > to || start <= today) continue;
      const end = endAfter(start, dur);
      const aiKey = `${key}|${mondayIso(start)}`;
      if (input.skip?.has(aiKey)) continue;
      // Déjà sur le planning à ces dates (même formation, à quelques jours près) : rien à prévoir.
      if (plannedSame.some((p) => Math.abs(diffD(p.start_at.slice(0, 10), start)) <= c.window)) continue;
      if (out.some((o) => o.ai_key === aiKey)) continue;
      const room = roomOrder.find((r) => free(r, start, end)) || null;
      const note = room ? (room !== room0 && room0 ? ` Salle habituelle prise : ${input.roomNames?.[room] || 'autre salle'} proposée.` : '') : roomOrder.length ? ' Salles habituelles déjà prises : salle à trouver.' : '';
      occupy(room, start, end);
      out.push({
        ai_key: aiKey,
        source: 'ia',
        template_id: key.startsWith('t:') ? null : key,
        title,
        room_id: room,
        trainer_id: trainer,
        start_date: start,
        end_date: end,
        start_time: startTime,
        end_time: endTime,
        confidence: room ? c.confidence : Math.max(20, c.confidence - 15),
        reason: c.reason + note,
      });
    }
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date) || (b.confidence || 0) - (a.confidence || 0));
}

/** Jours (lundi → vendredi) d'une prévision dans une semaine : index de début et nombre de jours. */
export function spanInWeek(f: { start_date: string; end_date: string }, monday: string): { col: number; span: number } | null {
  const fri = addD(monday, 4);
  const a = f.start_date < monday ? monday : f.start_date;
  const b = f.end_date > fri ? fri : f.end_date;
  if (a > b) return null;
  return { col: dow(a), span: dow(b) - dow(a) + 1 };
}

export const forecastIso = { addD, mondayIso, diffD };
