'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, Trash2, CheckCircle2, CircleDashed, Plus } from 'lucide-react';
import { addInvoice, deleteInvoice, setBillingDone } from '@/app/facturation/actions';
import type { BillingState, Invoice } from '@/lib/billing';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Facturation d'une session (la facture elle-même est faite dans Digiforma) :
 * nom de la facture, entreprise, et case « Facturation faite », réservés au
 * compte Facturation. Les autres comptes voient l'état sans le modifier.
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Affichage instantané (case cochée, facture ajoutée ou supprimée), confirmé ensuite par le serveur.
  const [done, setDone] = useState(state.done);
  useEffect(() => setDone(state.done), [state.done]);
  const [added, setAdded] = useState<Invoice[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    setAdded([]);
    setRemoved(new Set());
  }, [invoices]);
  const list = [...invoices.filter((i) => !removed.has(i.id)), ...added];
  const run = (fn: () => Promise<Result>, after?: () => void, undo?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        undo?.();
      } else {
        setError(null);
        after?.();
        router.refresh();
      }
    });
  const listId = `companies-${sessionId}`;

  return (
    <div className={`billing-box${compact ? ' compact' : ''}`}>
      <div className="billing-status">
        {done ? (
          <span className="badge validee"><CheckCircle2 size={13} aria-hidden /> Facturée{state.done && state.doneAt ? ` le ${new Date(state.doneAt).toLocaleDateString('fr-FR')}` : ''}{doneByName ? ` par ${doneByName}` : ''}</span>
        ) : list.length ? (
          <span className="badge planifiee"><CircleDashed size={13} aria-hidden /> En cours</span>
        ) : (
          <span className="badge planifiee"><CircleDashed size={13} aria-hidden /> À faire</span>
        )}
      </div>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {list.length > 0 ? (
        <ul className="invoice-list">
          {list.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.label}</strong>
                {i.company && <span className="hint"> · {i.company}</span>}
              </span>
              {canBill && !done && (
                <button type="button" className="small icon ghost" aria-label={`Supprimer la facture ${i.label}`} disabled={isPending} onClick={() => confirm(`Supprimer la facture « ${i.label} » ?`) && (setRemoved((r) => new Set(r).add(i.id)), run(() => deleteInvoice(sessionId, i.id), undefined, () => setRemoved((r) => { const n = new Set(r); n.delete(i.id); return n; })))}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" style={{ margin: '6px 0' }}>Aucune facture pour l’instant.</p>
      )}

      {canBill && !done && (
        <form
          className="invoice-form"
          onSubmit={(e) => {
            e.preventDefault();
            const tmp: Invoice = { id: `tmp-${Date.now()}`, label: label.trim(), company: company.trim() || null } as Invoice;
            setAdded((a) => [...a, tmp]);
            setLabel('');
            run(() => addInvoice(sessionId, { label: tmp.label, company: tmp.company || '' }), undefined, () => setAdded((a) => a.filter((x) => x !== tmp)));
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nom de la facture *" aria-label="Nom de la facture" required />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Entreprise" aria-label="Entreprise facturée" list={listId} />
          <datalist id={listId}>{companies.map((c) => <option key={c} value={c} />)}</datalist>
          <button type="submit" className="small" disabled={isPending || !label.trim()}><Plus size={14} aria-hidden /> Ajouter</button>
        </form>
      )}

      {canBill ? (
        <div className="billing-actions">
          <label className={`billing-done${done ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={done}
              disabled={!done && !list.length}
              onChange={(e) => {
                const v = e.target.checked;
                if (!v && !confirm('Annuler « Facturation faite » ? Le dossier ne sera plus complet.')) return;
                setDone(v);
                run(() => setBillingDone(sessionId, v), undefined, () => setDone(!v));
              }}
            />
            Facturation faite
          </label>
        </div>
      ) : (
        <p className="hint" style={{ margin: '6px 0 0' }}>Seul le compte Facturation renseigne les factures et coche « Facturation faite ».</p>
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
