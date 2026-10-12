'use client';

import { useState, useTransition } from 'react';
import { ArrowLeftRight, RotateCcw, UserRound } from 'lucide-react';
import { setDayTrainers } from '@/app/sessions/[id]/actions';
import { absenceFor, absenceText, type Absence } from '@/lib/absences';
import { fullDateLabel } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

type T = { id: string; full_name: string; color: string | null; status?: string | null };

/**
 * Formateur jour par jour : permet de confier certains jours à un remplaçant
 * (ex. jours 3 et 4) sans changer le formateur principal de la session.
 */
export function DayTrainersPanel({
  sessionId,
  days,
  principalId,
  trainers,
  dayTrainers,
  absences,
  canEdit,
}: {
  sessionId: string;
  days: string[];
  principalId: string | null;
  trainers: T[];
  dayTrainers: Record<string, { trainer_id: string; note?: string | null }>;
  absences: Absence[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [replacement, setReplacement] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (days.length < 2 && !Object.keys(dayTrainers).length) return null;
  const byId = new Map(trainers.map((t) => [t.id, t]));
  const principal = principalId ? byId.get(principalId) : null;
  const replacedCount = Object.keys(dayTrainers).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Erreur.');
      else {
        setNotice(done);
        setSelected([]);
        setNote('');
      }
    });
  }

  const tag = (t: T | null | undefined, label?: string) =>
    t ? (
      <span className="trainer-tag">
        <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
        {t.full_name}
        {label && <span className="hint"> {label}</span>}
      </span>
    ) : (
      <span className="hint">Non attribué</span>
    );

  return (
    <div className="panel">
      <h2><ArrowLeftRight size={18} aria-hidden /> Formateur par jour</h2>
      <p className="panel-intro">
        Le formateur principal ne peut pas assurer certains jours ? Confie-les à un remplaçant : il apparaît ces jours-là sur
        le planning, signe l’émargement et ses heures sont comptées dans son suivi.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {canEdit && <th style={{ width: 36 }}><span className="sr-only">Choisir</span></th>}
              <th>Jour</th>
              <th>Formateur</th>
              <th>Motif</th>
              {canEdit && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const r = dayTrainers[d];
              const who = r ? byId.get(r.trainer_id) : principal;
              const off = !r && principalId ? absenceFor(absences, principalId, d, d) : null;
              return (
                <tr key={d} className={r ? 'replaced-day' : ''}>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Choisir le ${fullDateLabel(new Date(d + 'T00:00:00Z'))}`}
                        checked={selected.includes(d)}
                        onChange={(e) => setSelected((l) => (e.target.checked ? [...l, d] : l.filter((x) => x !== d)))}
                      />
                    </td>
                  )}
                  <td>{fullDateLabel(new Date(d + 'T00:00:00Z'))}</td>
                  <td>
                    {tag(who, r ? '(remplaçant)' : '')}
                    {off && <span className="sc-absence" style={{ marginTop: 4, display: 'inline-flex' }}>{principal?.full_name} {absenceText(off)}</span>}
                  </td>
                  <td>{r?.note || <span className="hint">-</span>}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      {r && (
                        <button
                          className="small"
                          disabled={isPending}
                          onClick={() => run(() => setDayTrainers(sessionId, [d], null), 'Jour rendu au formateur principal.')}
                        >
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

      {canEdit && (
        <div className="day-trainer-form">
          <div className="form-row" style={{ alignItems: 'end' }}>
            <label>
              Remplaçant pour {selected.length ? `${selected.length} jour${selected.length > 1 ? 's' : ''} coché${selected.length > 1 ? 's' : ''}` : 'les jours cochés'}
              <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                <option value="">Choisir un formateur…</option>
                {trainers
                  .filter((t) => t.id !== principalId && t.status !== 'inactif')
                  .map((t) => {
                    const busy = selected.map((d) => absenceFor(absences, t.id, d, d)).find(Boolean);
                    return (
                      <option key={t.id} value={t.id} disabled={Boolean(busy)}>
                        {t.full_name}{busy ? ` (${absenceText(busy)})` : ''}
                      </option>
                    );
                  })}
              </select>
            </label>
            <label>
              Motif (facultatif)
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. déplacement, formation externe…" />
            </label>
            <button
              type="button"
              className="primary"
              disabled={isPending || !selected.length || !replacement}
              onClick={() => run(() => setDayTrainers(sessionId, selected, replacement, note), 'Remplaçant affecté.')}
            >
              <UserRound size={15} aria-hidden /> {isPending ? 'Enregistrement…' : 'Affecter le remplaçant'}
            </button>
          </div>
          {replacedCount > 0 && <p className="hint" style={{ margin: 0 }}>{replacedCount} jour{replacedCount > 1 ? 's' : ''} assuré{replacedCount > 1 ? 's' : ''} par un remplaçant.</p>}
        </div>
      )}
    </div>
  );
}
