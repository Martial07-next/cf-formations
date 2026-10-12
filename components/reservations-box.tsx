'use client';

import { useState, useTransition } from 'react';
import { Building2, Minus, Plus, Trash2 } from 'lucide-react';
import { addReservation, updateReservationSeats } from '@/app/sessions/[id]/actions';
import type { Reservation } from '@/lib/reservations';

type Row = Reservation & { named: number; unnamed: number };

/**
 * Places réservées par entreprise : « 3 personnes de l'entreprise X » sans
 * connaître les noms. Chaque stagiaire validé de cette entreprise remplit
 * automatiquement une des places.
 */
export function ReservationsBox({
  sessionId,
  rows,
  companies,
  canEdit,
}: {
  sessionId: string;
  rows: Row[];
  companies: string[];
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Erreur.');
      else after?.();
    });
  }

  if (!rows.length && !canEdit) return null;

  return (
    <div className="reservations">
      <div className="panel-head" style={{ marginBottom: 6 }}>
        <h3 className="sub-heading" style={{ margin: 0 }}>
          <Building2 size={16} aria-hidden style={{ verticalAlign: '-3px' }} /> Places réservées par entreprise
        </h3>
        {canEdit && !open && (
          <button className="small" onClick={() => setOpen(true)}>
            <Plus size={14} aria-hidden /> Réserver des places
          </button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Pour un groupe dont on ne connaît pas encore les noms (ex. 3 personnes de telle entreprise). Dès qu’un stagiaire de
        cette entreprise est validé, il prend une des places.
      </p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {canEdit && open && (
        <form
          className="inline-form reservation-form"
          action={(fd) => run(() => addReservation(sessionId, fd), () => setOpen(false))}
        >
          <datalist id={`companies-${sessionId}`}>
            {companies.map((c) => <option key={c} value={c} />)}
          </datalist>
          <input className="input" name="company" required placeholder="Entreprise" list={`companies-${sessionId}`} aria-label="Entreprise" autoFocus />
          <input className="input" name="seats" type="number" min={1} max={200} required defaultValue={1} aria-label="Nombre de places" style={{ width: 90 }} />
          <input className="input" name="note" placeholder="Remarque (facultatif)" aria-label="Remarque" />
          <button type="submit" className="primary small" disabled={isPending}>Réserver</button>
          <button type="button" className="small" onClick={() => setOpen(false)}>Annuler</button>
        </form>
      )}

      {rows.length > 0 && (
        <div className="reservation-list">
          {rows.map((r) => (
            <div key={r.id} className="reservation-item">
              <span className="reservation-main">
                <strong>{r.company}</strong>
                <small className="hint">
                  {r.seats} place{r.seats > 1 ? 's' : ''}
                  {r.named > 0 && ` · ${r.named} nommée${r.named > 1 ? 's' : ''}`}
                  {r.note ? ` · ${r.note}` : ''}
                </small>
              </span>
              <span className={`badge ${r.unnamed ? 'en_attente' : 'validee'}`}>
                {r.unnamed ? `${r.unnamed} sans nom` : 'Tous nommés'}
              </span>
              {canEdit && (
                <span className="row-actions">
                  <button className="small icon ghost" aria-label={`Une place de moins pour ${r.company}`} disabled={isPending} onClick={() => run(() => updateReservationSeats(sessionId, r.id, r.seats - 1))}>
                    <Minus size={14} />
                  </button>
                  <button className="small icon ghost" aria-label={`Une place de plus pour ${r.company}`} disabled={isPending} onClick={() => run(() => updateReservationSeats(sessionId, r.id, r.seats + 1))}>
                    <Plus size={14} />
                  </button>
                  <button
                    className="small icon ghost danger"
                    aria-label={`Supprimer la réservation ${r.company}`}
                    disabled={isPending}
                    onClick={() => confirm(`Supprimer les places réservées pour ${r.company} ?`) && run(() => updateReservationSeats(sessionId, r.id, 0))}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
