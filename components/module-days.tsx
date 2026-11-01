'use client';

import { useEffect, useMemo, useState } from 'react';
import { frDay } from '@/lib/modules';
import { formatHours } from '@/lib/week';

/**
 * Jours d'un module et durée calculée automatiquement :
 *  · les jours déjà pris par un autre module ne sont plus proposés ;
 *  · le dernier jour s'arrête avant le prochain jour déjà pris (pas de chevauchement) ;
 *  · la durée = heures de formation des jours choisis (pause déduite), modifiable.
 * Champs envoyés : start_day, end_day, duration_h, duration_min.
 */
export function ModuleDays({
  days,
  dayMinutes,
  taken,
  defaultStart,
  defaultEnd,
  defaultMinutes,
  compact = false,
}: {
  /** Jours de formation de la session (AAAA-MM-JJ). */
  days: string[];
  /** Minutes de formation par jour. */
  dayMinutes: Record<string, number>;
  /** Jours déjà couverts par les autres modules. */
  taken: string[];
  defaultStart?: string;
  defaultEnd?: string;
  /** Durée enregistrée (modification d'un module). */
  defaultMinutes?: number | null;
  compact?: boolean;
}) {
  const free = useMemo(() => days.filter((d) => !taken.includes(d)), [days, taken]);
  const [start, setStart] = useState(defaultStart && free.includes(defaultStart) ? defaultStart : free[0] || '');
  // Fin possible : jours libres consécutifs à partir du début (on s'arrête au premier jour pris).
  const ends = useMemo(() => {
    const out: string[] = [];
    for (const d of days.slice(days.indexOf(start))) {
      if (taken.includes(d)) break;
      out.push(d);
    }
    return out;
  }, [days, taken, start]);
  const [end, setEnd] = useState(defaultEnd && ends.includes(defaultEnd) ? defaultEnd : ends[0] || start);
  useEffect(() => {
    if (!ends.includes(end)) setEnd(ends[0] || start);
  }, [ends, end, start]);
  const auto = useMemo(() => days.filter((d) => d >= start && d <= end).reduce((n, d) => n + (dayMinutes[d] || 0), 0), [days, dayMinutes, start, end]);
  const [manual, setManual] = useState<number | null>(defaultMinutes != null && Math.round(defaultMinutes) !== auto ? Math.round(defaultMinutes) : null);
  const minutes = manual ?? auto;

  if (!free.length) return <p className="hint">Tous les jours de la session ont déjà un module.</p>;
  return (
    <>
      <label className={compact ? 'md-field' : undefined}>
        {!compact && 'Du'}
        <select name="start_day" value={start} onChange={(e) => { setStart(e.target.value); setManual(null); }} aria-label="Premier jour">
          {free.map((d) => <option key={d} value={d}>{frDay(d)}</option>)}
        </select>
      </label>
      <label className={compact ? 'md-field' : undefined}>
        {!compact && 'Au'}
        <select name="end_day" value={end} onChange={(e) => { setEnd(e.target.value); setManual(null); }} aria-label="Dernier jour">
          {ends.map((d) => <option key={d} value={d}>{frDay(d)}</option>)}
        </select>
      </label>
      <div className={compact ? 'md-field md-dur' : 'field md-dur'}>
        {!compact && 'Durée'}
        <span className="duration-input">
          <input type="number" min={0} max={300} aria-label="Heures" value={Math.floor(minutes / 60)} onChange={(e) => setManual(Math.max(0, Number(e.target.value) || 0) * 60 + (minutes % 60))} />
          <span>h</span>
          <select aria-label="Minutes" value={String(minutes % 60 - (minutes % 15))} onChange={(e) => setManual(Math.floor(minutes / 60) * 60 + Number(e.target.value))}>
            {['0', '15', '30', '45'].map((x) => <option key={x} value={x}>{x.padStart(2, '0')}</option>)}
          </select>
        </span>
        <input type="hidden" name="duration_h" value={Math.floor(minutes / 60)} />
        <input type="hidden" name="duration_min" value={minutes % 60} />
        <small className="hint md-auto">{manual == null ? `Calculée : ${formatHours(auto / 60)} sur ${days.filter((d) => d >= start && d <= end).length} jour(s)` : <button type="button" className="link" onClick={() => setManual(null)}>Revenir au calcul ({formatHours(auto / 60)})</button>}</small>
      </div>
    </>
  );
}
