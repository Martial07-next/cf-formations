import { HOLIDAYS_FROM, holidayOn, isClosedHoliday, nextWorkingDay, previousWorkingDay } from '@/lib/holidays';
import { invalidateWorkedHolidays, ensureWorkedHolidays } from '@/lib/holidays-server';
import { daysBetween } from '@/lib/week';

/**
 * Décalage automatique des sessions tombant sur un jour férié non travaillé
 * (migration 48). Le jour férié n'est plus un jour de formation : la session
 * finit un jour ouvré plus tard (et commence un jour plus tard si elle
 * débutait ce jour-là) ; modules, horaires du jour et remplaçants des jours
 * suivants avancent avec elle.
 *
 * Chaque férié n'est traité qu'une fois par session (session_holiday_shifts) :
 *  · « decale » : décalage fait ici ;
 *  · « prevu »  : session créée ou modifiée en tenant déjà compte du férié ;
 *  · « conflit » : décalage impossible (salle déjà réservée…), à replanifier.
 * Si la direction passe ensuite le férié en « travaillé », le décalage est annulé.
 */

type Db = any;
const DAY = /^\d{4}-\d{2}-\d{2}/;
const withDay = (ts: string, day: string) => day + String(ts).slice(10);

/** Fériés non travaillés en semaine dans [start, end]. */
function closedIn(start: string, end: string): string[] {
  return daysBetween(start, end).filter((d) => {
    const w = new Date(d + 'T00:00:00Z').getUTCDay();
    return w !== 0 && w !== 6 && isClosedHoliday(d);
  });
}

/** Avance (ou recule) les dates d'une session à partir d'un jour donné. */
async function moveChildren(db: Db, sessionId: string, from: string, dir: 1 | -1) {
  const step = (d: string) => (dir === 1 ? nextWorkingDay(d) : previousWorkingDay(d));
  const { data: mods } = await db.from('session_modules').select('id, start_day, end_day').eq('session_id', sessionId);
  for (const m of (mods as any[]) || []) {
    const s = String(m.start_day).slice(0, 10);
    const e = String(m.end_day).slice(0, 10);
    const ns = dir === 1 ? (s >= from ? step(s) : s) : s > from ? step(s) : s;
    const ne = dir === 1 ? (e >= from ? step(e) : e) : e > from ? step(e) : e;
    if (ns !== s || ne !== e) await db.from('session_modules').update({ start_day: ns, end_day: ne < ns ? ns : ne }).eq('id', m.id);
  }
  // Horaires propres à un jour et remplaçants : clés (session, jour) uniques,
  // déplacées en partant du bout pour ne jamais se chevaucher.
  for (const table of ['session_days', 'session_day_trainers']) {
    const { data: rows } = await db.from(table).select('day').eq('session_id', sessionId);
    const days = ((rows as any[]) || []).map((r) => String(r.day).slice(0, 10)).filter((d) => (dir === 1 ? d >= from : d > from));
    days.sort((a, b) => (dir === 1 ? b.localeCompare(a) : a.localeCompare(b)));
    for (const d of days) await db.from(table).update({ day: step(d) }).eq('session_id', sessionId).eq('day', d);
  }
}

export type ShiftReport = { shifted: number; conflicts: number; undone: number };

/**
 * Applique les décalages (toutes les sessions à venir, ou une seule).
 * `db` : client service_role (les triggers de conflit de salle s'appliquent).
 */
export async function applyHolidayShifts(db: Db, onlySessionId?: string): Promise<ShiftReport> {
  invalidateWorkedHolidays();
  await ensureWorkedHolidays(db);
  const report: ShiftReport = { shifted: 0, conflicts: 0, undone: 0 };
  let q = db.from('sessions').select('id, start_at, end_at').gte('end_at', `${HOLIDAYS_FROM}T00:00:00`);
  if (onlySessionId) q = q.eq('id', onlySessionId);
  const { data: sessions, error } = await q.limit(2000);
  if (error) return report;
  const ids = ((sessions as any[]) || []).map((s) => s.id);
  if (!ids.length) return report;
  const { data: recs, error: recErr } = await db.from('session_holiday_shifts').select('session_id, holiday, status, moved_start').in('session_id', ids);
  if (recErr) return report; // migration 48 absente
  const bySession = new Map<string, any[]>();
  for (const r of (recs as any[]) || []) (bySession.get(r.session_id) || bySession.set(r.session_id, []).get(r.session_id)!).push({ ...r, holiday: String(r.holiday).slice(0, 10) });

  for (const s of (sessions as any[]) || []) {
    if (!DAY.test(s.start_at) || !DAY.test(s.end_at)) continue;
    let start = String(s.start_at);
    let end = String(s.end_at);
    const records = bySession.get(s.id) || [];

    // 1. Férié devenu travaillé : on annule le décalage (ou la journée en plus).
    for (const r of records.filter((x) => !isClosedHoliday(x.holiday)).sort((a, b) => b.holiday.localeCompare(a.holiday))) {
      if (r.status !== 'conflit') {
        const nextStart = r.moved_start ? withDay(start, r.holiday) : start;
        const back = previousWorkingDay(end.slice(0, 10));
        const nextEnd = withDay(end, back < nextStart.slice(0, 10) ? nextStart.slice(0, 10) : back);
        const { error: e } = await db.from('sessions').update({ start_at: nextStart, end_at: nextEnd }).eq('id', s.id);
        if (e) continue;
        await moveChildren(db, s.id, r.holiday, -1);
        start = nextStart;
        end = nextEnd;
        report.undone++;
      }
      await db.from('session_holiday_shifts').delete().eq('session_id', s.id).eq('holiday', r.holiday);
    }

    // 2. Nouveaux fériés non travaillés dans la session : décalage d'un jour ouvré.
    const known = new Set(records.filter((x) => isClosedHoliday(x.holiday)).map((x) => x.holiday));
    for (let guard = 0; guard < 10; guard++) {
      const h = closedIn(start.slice(0, 10), end.slice(0, 10)).find((d) => !known.has(d));
      if (!h) break;
      known.add(h);
      const movedStart = start.slice(0, 10) === h;
      const nextStart = movedStart ? withDay(start, nextWorkingDay(h)) : start;
      // Session d'un seul jour sur le férié : elle passe entière au jour ouvré suivant.
      const nextEnd = withDay(end, movedStart && end.slice(0, 10) === h ? nextStart.slice(0, 10) : nextWorkingDay(end.slice(0, 10)));
      const label = holidayOn(h)?.label || 'Jour férié';
      const { error: e } = await db.from('sessions').update({ start_at: nextStart, end_at: nextEnd }).eq('id', s.id);
      if (e) {
        await db.from('session_holiday_shifts').upsert({ session_id: s.id, holiday: h, label, status: 'conflit', detail: String(e.message).slice(0, 300) });
        report.conflicts++;
        continue;
      }
      await moveChildren(db, s.id, h, 1);
      await db.from('session_holiday_shifts').upsert({ session_id: s.id, holiday: h, label, status: 'decale', moved_start: movedStart, detail: null });
      start = nextStart;
      end = nextEnd;
      report.shifted++;
    }
  }
  return report;
}

/**
 * Session créée ou modifiée à la main (ou importée) : les fériés de sa période
 * sont déjà pris en compte, on ne la décalera pas. Les fériés sortis de la
 * période sont oubliés.
 */
export async function markHolidaysAccounted(db: Db, sessionId: string) {
  await ensureWorkedHolidays(db);
  const { data: s } = await db.from('sessions').select('start_at, end_at').eq('id', sessionId).maybeSingle();
  if (!s) return;
  const start = String(s.start_at).slice(0, 10);
  const end = String(s.end_at).slice(0, 10);
  const { data: recs, error } = await db.from('session_holiday_shifts').select('holiday').eq('session_id', sessionId);
  if (error) return;
  const have = new Set(((recs as any[]) || []).map((r) => String(r.holiday).slice(0, 10)));
  const outside = [...have].filter((d) => d < start || d > end);
  if (outside.length) await db.from('session_holiday_shifts').delete().eq('session_id', sessionId).in('holiday', outside);
  const add = closedIn(start, end).filter((d) => !have.has(d));
  if (add.length) {
    await db.from('session_holiday_shifts').upsert(
      add.map((d) => ({ session_id: sessionId, holiday: d, label: holidayOn(d)?.label || 'Jour férié', status: 'prevu' })),
      { onConflict: 'session_id,holiday', ignoreDuplicates: true }
    );
  }
}

let lastRun = 0;
/** Au plus toutes les 10 minutes (ouverture du planning, sans plateforme de congés reliée). */
export async function applyHolidayShiftsIfStale(db: Db) {
  if (Date.now() - lastRun < 10 * 60 * 1000) return;
  lastRun = Date.now();
  await applyHolidayShifts(db);
}
