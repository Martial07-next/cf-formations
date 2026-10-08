'use client';

import { useState, useTransition } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { addAbsence, deleteAbsence, type AbsenceResult } from '@/app/formateurs/actions';
import { ABSENCE_KINDS, ABSENCE_LABEL, frDate, type Absence } from '@/lib/absences';

export function AbsencesPanel({ trainerId, absences, canEdit }: { trainerId: string; absences: Absence[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AbsenceResult | null>(null);
  const [start, setStart] = useState('');
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = absences.filter((a) => a.end_date >= today);
  const past = absences.filter((a) => a.end_date < today).reverse().slice(0, 10);

  function run(fn: () => Promise<AbsenceResult>, after?: () => void) {
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) after?.();
    });
  }

  const Row = ({ a }: { a: Absence }) => (
    <tr>
      <td><span className="badge en_attente">{ABSENCE_LABEL[a.kind]}</span></td>
      <td>{a.start_date === a.end_date ? `le ${frDate(a.start_date)}` : `du ${frDate(a.start_date)} au ${frDate(a.end_date)}`}</td>
      <td>{a.note || <span className="hint">-</span>}</td>
      {canEdit && (
        <td className="row-actions">
          <button
            className="danger small icon"
            aria-label="Supprimer"
            disabled={isPending}
            onClick={() => confirm('Supprimer cette absence ?') && run(() => deleteAbsence(a.id, trainerId))}
          >
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <h2><CalendarOff size={18} aria-hidden /> Congés et absences</h2>
        {canEdit && (
          <button className={open ? 'small' : 'small primary'} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Plus size={14} aria-hidden /> {open ? 'Fermer' : 'Ajouter'}
          </button>
        )}
      </div>
      <p className="panel-intro">
        Pendant un congé ou une absence, le formateur ne peut pas être affecté à une session : la plateforme le bloque
        et l’indique sur le planning.
      </p>

      {result && !result.ok && <div role="alert" className="alert alert-error">{result.error}</div>}
      {result?.ok && result.warning && <div role="alert" className="alert alert-warning">{result.warning}</div>}

      {canEdit && open && (
        <form
          action={(fd) => run(() => addAbsence(trainerId, fd), () => { setOpen(false); setStart(''); })}
          style={{ marginBottom: 14 }}
        >
          <div className="form-row">
            <label>
              Type
              <select name="kind" defaultValue="conge">
                {ABSENCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label>
              Du
              <input name="start_date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              Au (inclus)
              <input name="end_date" type="date" required min={start || undefined} defaultValue="" />
            </label>
            <label>
              Note
              <input name="note" placeholder="Optionnel" />
            </label>
          </div>
          <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </form>
      )}

      {upcoming.length === 0 ? (
        <p className="hint">Aucun congé ni absence à venir.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <tbody>{upcoming.map((a) => <Row key={a.id} a={a} />)}</tbody>
          </table>
        </div>
      )}
      {past.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>Absences passées ({past.length})</summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <tbody>{past.map((a) => <Row key={a.id} a={a} />)}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
