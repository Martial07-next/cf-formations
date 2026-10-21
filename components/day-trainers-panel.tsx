'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import { setDayTrainers, setSessionTrainer } from '@/app/sessions/[id]/actions';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { fullDateLabel } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

type T = { id: string; full_name: string; color: string | null; status?: string | null };

/**
 * Formateur jour par jour : on change le formateur directement sur la ligne
 * du jour. Un autre jour que le premier : seulement ce jour-là (remplaçant).
 * Le premier jour : le formateur de toute la formation.
 */
export function DayTrainersPanel({
  sessionId,
  days,
  principalId,
  trainers,
  dayTrainers,
  absences,
  canEdit,
  focusDay = null,
}: {
  sessionId: string;
  days: string[];
  principalId: string | null;
  trainers: T[];
  dayTrainers: Record<string, { trainer_id: string; note?: string | null }>;
  absences: Absence[];
  canEdit: boolean;
  /** Jour ouvert depuis le planning (mis en évidence). */
  focusDay?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Arrivée depuis un jour du planning : on descend jusqu'au tableau.
  useEffect(() => {
    if (focusDay && days.includes(focusDay)) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDay]);

  if (days.length < 2 && !Object.keys(dayTrainers).length) return null;
  const byId = new Map(trainers.map((t) => [t.id, t]));
  const principal = principalId ? byId.get(principalId) : null;
  const first = days[0];
  const replacedCount = Object.keys(dayTrainers).length;
  const active = trainers.filter((t) => t.status !== 'inactif');

  function run(day: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    setNotice(null);
    setBusyDay(day);
    startTransition(async () => {
      const res = await fn();
      setBusyDay(null);
      if (!res.ok) setError(res.error || 'Erreur.');
      else setNotice(done);
    });
  }

  function change(day: string, trainerId: string) {
    const label = fullDateLabel(new Date(day + 'T00:00:00Z'));
    const t = byId.get(trainerId);
    if (day === first) {
      if ((trainerId || null) === (principalId || null)) return;
      const msg = `Premier jour : changer le formateur change toute la formation (tous les jours${replacedCount ? ', remplacements retirés' : ''}).\n\nNouveau formateur : ${t?.full_name || 'non attribué'}. Continuer ?`;
      if (!confirm(msg)) return;
      run(day, () => setSessionTrainer(sessionId, trainerId || null), `Toute la formation est maintenant assurée par ${t?.full_name || 'personne (à définir)'}.`);
      return;
    }
    const back = !trainerId || trainerId === principalId;
    run(
      day,
      () => setDayTrainers(sessionId, [day], back ? null : trainerId),
      back ? `${label} : rendu à ${principal?.full_name || 'au formateur principal'}.` : `${label} : ${t?.full_name} remplace ${principal?.full_name || 'le formateur'} ce jour-là uniquement.`
    );
  }

  return (
    <div className="panel" id="formateur-jour" ref={panelRef}>
      <h2><ArrowLeftRight size={18} aria-hidden /> Formateur par jour</h2>
      <p className="panel-intro">
        Change le formateur directement sur le jour voulu : <strong>seulement ce jour-là</strong> change. Sur le <strong>premier jour</strong>, c’est le formateur de <strong>toute la formation</strong> qui change.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Jour</th>
              <th>Formateur</th>
              <th>Motif</th>
              {canEdit && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const r = dayTrainers[d];
              const whoId = r ? r.trainer_id : principalId || '';
              const who = whoId ? byId.get(whoId) : null;
              const off = !r && principalId ? absenceFor(absences, principalId, d, d) : null;
              const isFirst = d === first;
              return (
                <tr key={d} className={`${r ? 'replaced-day' : ''}${focusDay === d ? ' focus-day' : ''}`}>
                  <td>
                    {fullDateLabel(new Date(d + 'T00:00:00Z'))}
                    {isFirst && <span className="day-first">1er jour · toute la formation</span>}
                  </td>
                  <td>
                    {canEdit ? (
                      <span className="day-trainer-pick" style={{ ['--c' as any]: who?.color || DEFAULT_TRAINER_COLOR }}>
                        <span className="swatch" aria-hidden />
                        <select
                          value={whoId}
                          disabled={isPending}
                          aria-label={`Formateur du ${fullDateLabel(new Date(d + 'T00:00:00Z'))}`}
                          onChange={(e) => change(d, e.target.value)}
                        >
                          {isFirst && <option value="">Non attribué</option>}
                          {active.map((t) => {
                            const busy = absenceFor(absences, t.id, d, d);
                            return (
                              <option key={t.id} value={t.id} disabled={Boolean(busy) && t.id !== whoId}>
                                {t.full_name}
                                {!isFirst && t.id === principalId ? ' (principal)' : ''}
                                {busy ? ` (${absenceText(busy)})` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {busyDay === d && <span className="hint">…</span>}
                      </span>
                    ) : (
                      <span className="trainer-tag">
                        <span className="swatch" style={{ background: who?.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                        {who?.full_name || 'Non attribué'}
                        {r && <span className="hint"> (remplaçant)</span>}
                      </span>
                    )}
                    {r && canEdit && <span className="hint" style={{ display: 'block', marginTop: 2 }}>Remplaçant ce jour-là</span>}
                    {off && <span className="sc-absence" style={{ marginTop: 4, display: 'inline-flex' }}>{principal?.full_name} {absenceText(off)}</span>}
                  </td>
                  <td>{r?.note || <span className="hint">-</span>}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      {r && (
                        <button className="small" disabled={isPending} onClick={() => change(d, principalId || '')}>
                          <RotateCcw size={13} aria-hidden /> Rétablir {principal?.full_name?.split(' ')[0] || ''}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {replacedCount > 0 && <p className="hint" style={{ margin: '8px 0 0' }}>{replacedCount} jour{replacedCount > 1 ? 's' : ''} assuré{replacedCount > 1 ? 's' : ''} par un remplaçant.</p>}
    </div>
  );
}
