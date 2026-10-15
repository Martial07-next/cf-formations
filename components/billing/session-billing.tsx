'use client';

import { useState, useTransition } from 'react';
import { Receipt, Trash2, CheckCircle2, CircleDashed, Plus } from 'lucide-react';
import { addInvoice, deleteInvoice, setBillingDone, setBillingNote } from '@/app/facturation/actions';
import { euros, type BillingState, type Invoice } from '@/lib/billing';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Facturation d'une session : factures (nom / n°, entreprise, montant) et
 * case « Facturation faite », réservées au compte Facturation. Les autres
 * comptes voient l'état sans pouvoir le modifier.
 */
export function BillingBox({
  sessionId,
  state,
  invoices,
  companies,
  canBill,
  doneByName,
  compact = false,
}: {
  sessionId: string;
  state: BillingState;
  invoices: Invoice[];
  /** Entreprises des stagiaires validés (suggestions). */
  companies: string[];
  canBill: boolean;
  doneByName?: string | null;
  compact?: boolean;
}) {
  const [label, setLabel] = useState('');
  const [company, setCompany] = useState(companies.length === 1 ? companies[0] : '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [billNote, setBillNote] = useState(state.note || '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
      }
    });
  const total = invoices.reduce((n, i) => n + (Number(i.amount) || 0), 0);
  const listId = `companies-${sessionId}`;

  return (
    <div className={`billing-box${compact ? ' compact' : ''}`}>
      <div className="billing-status">
        {state.done ? (
          <span className="badge validee"><CheckCircle2 size={13} aria-hidden /> Facturée{state.doneAt ? ` le ${new Date(state.doneAt).toLocaleDateString('fr-FR')}` : ''}{doneByName ? ` par ${doneByName}` : ''}</span>
        ) : (
          <span className="badge planifiee"><CircleDashed size={13} aria-hidden /> À facturer</span>
        )}
        {total > 0 && <span className="hint">Total : <strong>{euros(total)}</strong></span>}
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {invoices.length > 0 ? (
        <ul className="invoice-list">
          {invoices.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.label}</strong>
                {i.company && <span className="hint"> · {i.company}</span>}
                {i.amount != null && <span> · {euros(Number(i.amount))}</span>}
                {i.note && <span className="hint"> · {i.note}</span>}
              </span>
              {canBill && !state.done && (
                <button type="button" className="small icon ghost" aria-label={`Supprimer la facture ${i.label}`} disabled={isPending} onClick={() => confirm(`Supprimer la facture « ${i.label} » ?`) && run(() => deleteInvoice(sessionId, i.id))}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ margin: '6px 0' }}>Aucune facture pour l’instant.</p>
      )}

      {canBill && !state.done && (
        <form
          className="invoice-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addInvoice(sessionId, { label, company, amount, note }), () => { setLabel(''); setAmount(''); setNote(''); });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom / n° de facture *" aria-label="Nom ou numéro de la facture" required />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Entreprise" aria-label="Entreprise facturée" list={listId} />
          <datalist id={listId}>{companies.map((c) => <option key={c} value={c} />)}</datalist>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant HT (€)" aria-label="Montant" inputMode="decimal" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" aria-label="Note" />
          <button type="submit" className="small" disabled={isPending || !label.trim()}><Plus size={14} aria-hidden /> Ajouter</button>
        </form>
      )}

      {canBill ? (
        <div className="billing-actions">
          <label className="field" style={{ flex: 1, minWidth: 220 }}>
            Note de suivi
            <input
              value={billNote}
              onChange={(e) => setBillNote(e.target.value)}
              onBlur={() => billNote !== (state.note || '') && run(() => setBillingNote(sessionId, billNote))}
              placeholder="Ex. en attente du bon de commande OPCO"
            />
          </label>
          <label className={`billing-done${state.done ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={state.done}
              disabled={isPending || (!state.done && !invoices.length)}
              onChange={(e) =>
                (e.target.checked || confirm('Annuler « Facturation faite » ? Le dossier ne sera plus complet.')) &&
                run(() => setBillingDone(sessionId, e.target.checked))
              }
            />
            Facturation faite
          </label>
        </div>
      ) : (
        <>
          {state.note && <p className="hint" style={{ margin: '6px 0 0' }}>Note : {state.note}</p>}
          <p className="hint" style={{ margin: '6px 0 0' }}>Seul le compte Facturation renseigne les factures et coche « Facturation faite ».</p>
        </>
      )}
    </div>
  );
}

/** Bloc de la fiche session. */
export function SessionBilling(props: Parameters<typeof BillingBox>[0]) {
  return (
    <section className="panel" id="facturation">
      <h2><Receipt size={17} aria-hidden /> Facturation</h2>
      <BillingBox {...props} />
    </section>
  );
}
