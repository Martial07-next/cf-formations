'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Download, Receipt, AlertTriangle } from 'lucide-react';
import { BillingBox } from '@/components/billing/session-billing';
import type { BillingState, Invoice } from '@/lib/billing';

export type BillingRow = {
  id: string;
  title: string;
  period: string;
  endAt: string;
  trainer: string | null;
  validated: number;
  companies: { company: string; count: number }[];
  state: BillingState;
  doneByName: string | null;
  invoices: Invoice[];
};

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Liste de la page Facturation, avec la fenêtre de facturation d'une session. */
export function BillingList({ rows, canBill, tab }: { rows: BillingRow[]; canBill: boolean; tab: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const open = rows.find((r) => r.id === openId) || null;
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);

  const exportCsv = () => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Session', 'Dates', 'Formateur', 'Stagiaires validés', 'Entreprises', 'Factures', 'Statut', 'Facturée le'].map(esc).join(';'),
      ...rows.map((r) =>
        [
          r.title,
          r.period,
          r.trainer || '',
          String(r.validated),
          r.companies.map((c) => `${c.company} x${c.count}`).join(', '),
          r.invoices.map((i) => (i.company ? `${i.label} (${i.company})` : i.label)).join(', '),
          r.state.done ? 'Facturée' : r.invoices.length ? 'En cours' : 'À faire',
          r.state.doneAt ? new Date(r.state.doneAt).toLocaleDateString('fr-FR') : '',
        ].map(esc).join(';')
      ),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturation-${tab}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <>
      <div className="form-actions" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button type="button" className="small" onClick={exportCsv} disabled={!rows.length}><Download size={14} aria-hidden /> Exporter (Excel / CSV)</button>
      </div>
      {!rows.length ? (
        <p className="empty">Rien ici pour l’instant.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Session</th><th>Entreprises</th><th>Factures</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const age = daysSince(r.endAt);
                const late = !r.state.done && age > 30;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/sessions/${r.id}#facturation`}><strong>{r.title}</strong></Link>
                      <div className="hint">{r.period}{r.trainer ? ` · ${r.trainer}` : ''}</div>
                    </td>
                    <td>
                      <span className="hint">{r.validated} stagiaire{r.validated > 1 ? 's' : ''}</span>
                      <div className="billing-companies">
                        {r.companies.map((c) => <span key={c.company} className="autor-chip">{c.company} ×{c.count}</span>)}
                      </div>
                    </td>
                    <td>
                      {r.invoices.length ? (
                        r.invoices.map((i) => <div key={i.id}><strong>{i.label}</strong>{i.company ? <span className="hint"> · {i.company}</span> : ''}</div>)
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td>
                      {r.state.done ? (
                        <span className="badge validee">Facturée {r.state.doneAt ? `le ${new Date(r.state.doneAt).toLocaleDateString('fr-FR')}` : ''}</span>
                      ) : age < 0 ? (
                        <span className="badge brouillon">À venir</span>
                      ) : r.invoices.length ? (
                        <span className="badge planifiee">En cours</span>
                      ) : (
                        <span className={`badge ${late ? 'indisponible' : 'planifiee'}`}>
                          {late && <AlertTriangle size={12} aria-hidden />} À faire · terminée {age === 0 ? 'aujourd’hui' : `il y a ${age} j`}
                        </span>
                      )}
                    </td>
                    <td className="row-actions">
                      <button type="button" className={`small${canBill && !r.state.done ? ' primary' : ''}`} onClick={() => setOpenId(r.id)}>
                        <Receipt size={14} aria-hidden /> {canBill && !r.state.done ? 'Facturer' : 'Voir'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <dialog ref={ref} className="modal" onClose={() => setOpenId(null)} aria-label="Facturation de la session">
        <div className="modal-head">
          <h2>{open?.title}</h2>
          <button className="icon ghost" onClick={() => setOpenId(null)} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 18 }}>
          {open && (
            <>
              <p className="hint" style={{ marginTop: 0 }}>{open.period} · {open.validated} stagiaire{open.validated > 1 ? 's' : ''} : {open.companies.map((c) => `${c.company} ×${c.count}`).join(', ')}</p>
              <BillingBox
                key={open.id + String(open.state.done) + open.invoices.length}
                sessionId={open.id}
                state={open.state}
                invoices={open.invoices}
                companies={open.companies.map((c) => c.company).filter((c) => c !== 'Sans entreprise')}
                canBill={canBill}
                doneByName={open.doneByName}
              />
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
