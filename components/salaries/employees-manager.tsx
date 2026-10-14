'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Plus, X, Copy, Check, Mail, ExternalLink, PackagePlus, PackageCheck, Trash2, RefreshCcw, Ban, CheckCircle2, Clock } from 'lucide-react';
import {
  createEmployee, updateEmployee, deleteEmployee, addMaterial, requestImage, recordReturn, deleteEmployeeDoc, renewEmployeeLink,
} from '@/app/salaries/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { missingDocs, signatureFor, type DocSignature, type SignableDoc } from '@/lib/documents';
import { SignedDocButton } from '@/components/documents/signed-docs';
import { DOC_LABEL, MATERIAL_ITEMS, materialSummary, type Employee, type EmployeeDoc } from '@/lib/salaries';

type Row = Employee & { docs: EmployeeDoc[]; docSigs?: DocSignature[] };
type Account = { id: string; full_name: string };
type Result = { ok: true } | { ok: false; error: string };

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <div className="modal-body" style={{ paddingBottom: 18 }}>{open && children}</div>
    </dialog>
  );
}

/** Cases du matériel remis (« 1 » imprimé = case à cocher, sinon quantité). */
function MaterialFields() {
  return (
    <div className="material-grid">
      {MATERIAL_ITEMS.map((i) =>
        i.fixed ? (
          <label key={i.key} className="check-line"><input type="checkbox" name={i.key} value="1" /> 1 {i.label}</label>
        ) : (
          <label key={i.key} className="material-qty">
            <input type="number" name={i.key} min={0} max={20} defaultValue={0} aria-label={i.label} /> {i.label}
          </label>
        )
      )}
    </div>
  );
}

const fr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');

function imageState(docs: EmployeeDoc[]) {
  const last = docs.filter((d) => d.kind === 'image').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!last) return <span className="autor-chip">Non demandé</span>;
  if (!last.signed_at) return <span className="autor-chip wait"><Clock size={13} aria-hidden /> À signer</span>;
  return last.accepted ? (
    <span className="autor-chip ok"><CheckCircle2 size={13} aria-hidden /> Autorise · {fr(last.signed_at)}</span>
  ) : (
    <span className="autor-chip refus"><Ban size={13} aria-hidden /> Refus · {fr(last.signed_at)}</span>
  );
}

function materialState(docs: EmployeeDoc[]) {
  const mats = docs.filter((d) => d.kind === 'materiel');
  if (!mats.length) return <span className="hint">—</span>;
  return (
    <span className="material-states">
      {mats.map((d) => (
        <span key={d.id} className={`autor-chip${d.returned_at ? '' : d.signed_at ? ' ok' : ' wait'}`} title={materialSummary(d.data)}>
          {d.returned_at ? 'Restitué' : d.signed_at ? 'Remis' : 'À signer'} · {materialSummary(d.data)}
        </span>
      ))}
    </span>
  );
}

export function EmployeesManager({
  rows,
  accounts,
  cachet,
  extraDocs = [],
  materialOn = true,
}: {
  rows: Row[];
  accounts: Account[];
  cachet: string | null;
  extraDocs?: SignableDoc[];
  materialOn?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
  const open = rows.find((r) => r.id === openId) || null;
  const url = (r: Row) => `${window.location.origin}/salarie/${r.token}`;
  const copy = async (r: Row) => {
    try {
      await navigator.clipboard.writeText(url(r));
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt('Copie ce lien :', url(r));
    }
  };
  const mail = (r: Row) => {
    const body = `Bonjour ${r.full_name},\n\nVoici ton lien personnel pour signer en ligne tes documents CF Réseaux (droit à l’image, remise de matériel) :\n${url(r)}\n\nLe bureau administratif`;
    window.location.href = `mailto:${encodeURIComponent(r.email || '')}?subject=${encodeURIComponent('Tes documents à signer – CF Réseaux')}&body=${encodeURIComponent(body)}`;
  };
  const pending = (r: Row) => r.docs.filter((d) => !d.signed_at).length + missingDocs(extraDocs, r.docSigs || []).length;

  return (
    <>
      {error && !creating && !open && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="toolbar">
        <span className="hint">{rows.filter((r) => r.active).length} salarié(s) · {rows.reduce((n, r) => n + pending(r), 0)} document(s) en attente de signature</span>
        <span className="spacer" />
        <button type="button" className="primary" onClick={() => { setError(null); setCreating(true); }}><Plus size={15} aria-hidden /> Salarié</button>
      </div>

      {!rows.length ? (
        <p className="empty">Aucun salarié. Ajoute-en un : son lien de signature est créé automatiquement.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Salarié</th><th>Droit à l’image</th><th>Matériel</th>{extraDocs.length > 0 && <th>Autres documents</th>}<th>Lien de signature</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? '' : 'muted-row'}>
                  <td>
                    <button type="button" className="link-like" onClick={() => { setError(null); setOpenId(r.id); }}><strong>{r.full_name}</strong></button>
                    <div className="hint">{[r.job, r.email, !r.active && 'parti'].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{imageState(r.docs)}</td>
                  <td>{materialState(r.docs)}</td>
                  {extraDocs.length > 0 && (
                    <td>
                      <span className="material-states">
                        {extraDocs.map((d) => {
                          const sig = signatureFor(d, r.docSigs || []);
                          return <span key={d.id} className={`autor-chip${sig ? ' ok' : ' wait'}`}>{d.title} · {sig ? 'signé' : 'à signer'}</span>;
                        })}
                      </span>
                    </td>
                  )}
                  <td>
                    {pending(r) > 0 && r.active ? (
                      <span className="row-actions">
                        <button type="button" className="small" onClick={() => copy(r)}>{copied === r.id ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied === r.id ? 'Copié' : 'Copier'}</button>
                        <button type="button" className="small" onClick={() => mail(r)}><Mail size={14} aria-hidden /> E-mail</button>
                        <a className="btn small" href={`/salarie/${r.token}`} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> Signer ici</a>
                      </span>
                    ) : (
                      <span className="hint">Rien à signer</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="small" onClick={() => { setError(null); setOpenId(r.id); }}>Ouvrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouveau salarié">
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => createEmployee(fd), () => setCreating(false)); }}>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <div className="form-row">
            <label>Nom et prénom *<input name="full_name" required /></label>
            <label>Poste<input name="job" placeholder="Ex. Formateur, Assistante…" /></label>
          </div>
          <div className="form-row">
            <label>E-mail<input type="email" name="email" /></label>
            <label>
              Compte de la plateforme
              <select name="profile_id" defaultValue="">
                <option value="">Aucun</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </label>
          </div>
          <p className="sub-heading" style={{ marginBottom: 6 }}>Matériel remis (facultatif)</p>
          <MaterialFields />
          <p className="hint">Le droit à l’image est demandé automatiquement. Le salarié signe tout en une fois avec son lien.</p>
          <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>Créer</button></div>
        </form>
      </Modal>

      <Modal open={!!open} onClose={() => setOpenId(null)} title={open?.full_name || ''}>
        {open && <EmployeeDetail row={open} accounts={accounts} cachet={cachet} run={run} error={error} isPending={isPending} onDeleted={() => setOpenId(null)} extraDocs={extraDocs} materialOn={materialOn} />}
      </Modal>
    </>
  );
}

function EmployeeDetail({
  row,
  accounts,
  cachet,
  run,
  error,
  isPending,
  onDeleted,
  extraDocs,
  materialOn,
}: {
  extraDocs: SignableDoc[];
  materialOn: boolean;
  row: Row;
  accounts: Account[];
  cachet: string | null;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  error: string | null;
  isPending: boolean;
  onDeleted: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const docs = [...row.docs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pdf = (d: EmployeeDoc) => ({ auth: { ...d, signed_at: d.signed_at!, data: d.data as Record<string, any> }, traineeName: row.full_name });

  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => updateEmployee(row.id, fd)); }}>
        <div className="form-row">
          <label>Nom et prénom<input name="full_name" defaultValue={row.full_name} required /></label>
          <label>Poste<input name="job" defaultValue={row.job || ''} /></label>
        </div>
        <div className="form-row">
          <label>E-mail<input type="email" name="email" defaultValue={row.email || ''} /></label>
          <label>
            Compte de la plateforme
            <select name="profile_id" defaultValue={row.profile_id || ''}>
              <option value="">Aucun</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </label>
          <label>
            Statut
            <select name="active" defaultValue={row.active ? 'on' : 'off'}>
              <option value="on">Dans l’entreprise</option>
              <option value="off">Parti</option>
            </select>
          </label>
        </div>
        {row.address && <p className="hint">Adresse : {row.address}</p>}
        <div className="form-actions"><button type="submit" className="small" disabled={isPending}>Enregistrer</button></div>
      </form>

      <h3 className="sub-heading">Documents</h3>
      <ul className="employee-docs">
        {docs.map((d) => (
          <li key={d.id}>
            <span>
              <strong>{DOC_LABEL[d.kind]}</strong>
              {d.kind === 'materiel' && <span className="hint"> · {materialSummary(d.data)}</span>}
              <br />
              <span className="hint">
                {d.signed_at ? `Signé le ${fr(d.signed_at)}` : 'En attente de signature'}
                {d.kind === 'image' && d.signed_at && (d.accepted ? ' · autorise' : ' · refuse')}
                {d.returned_at && ` · restitué le ${fr(d.returned_at)}`}
              </span>
            </span>
            <span className="row-actions">
              {d.signed_at && <AuthPdfButton items={[pdf(d)]} cachet={cachet} fileName={`${DOC_LABEL[d.kind]} - ${row.full_name}.pdf`} />}
              {d.kind === 'materiel' && d.signed_at && !d.returned_at && (
                <button type="button" className="small" onClick={() => setReturning(returning === d.id ? null : d.id)}><PackageCheck size={14} aria-hidden /> Restitution</button>
              )}
              <button type="button" className="small icon ghost" aria-label="Supprimer" onClick={() => confirm('Supprimer ce document ?') && run(() => deleteEmployeeDoc(d.id))}><Trash2 size={14} /></button>
            </span>
            {returning === d.id && (
              <div className="employee-return">
                <p className="hint">Le salarié rend son matériel : il signe ci-dessous (date du jour et cachet CF Réseaux ajoutés au PDF).</p>
                <SignaturePad ref={pad} height={130} onChange={setEmpty} />
                <button
                  type="button"
                  className="small primary"
                  disabled={isPending || empty}
                  onClick={() => {
                    const sig = pad.current?.toDataURL();
                    if (sig) run(() => recordReturn(d.id, sig), () => setReturning(null));
                  }}
                >
                  Valider la restitution
                </button>
              </div>
            )}
          </li>
        ))}
        {extraDocs.map((d) => {
          const sig = signatureFor(d, row.docSigs || []);
          return (
            <li key={d.id}>
              <span>
                <strong>{d.title}</strong>
                <br />
                <span className="hint">{sig ? `Signé le ${fr(sig.signed_at)}` : 'En attente de signature'}</span>
              </span>
              {sig && <span className="row-actions"><SignedDocButton doc={d} sig={sig} signerName={row.full_name} signerRole="salarie" /></span>}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => addMaterial(row.id, fd), () => setAdding(false)); }} className="autor-card" style={{ marginTop: 12 }}>
          <h3>Matériel remis</h3>
          <MaterialFields />
          <div className="form-actions"><button type="submit" className="small primary" disabled={isPending}>Préparer l’attestation</button><button type="button" className="small" onClick={() => setAdding(false)}>Annuler</button></div>
        </form>
      ) : (
        <div className="form-actions" style={{ marginTop: 12 }}>
          {materialOn && <button type="button" className="small" onClick={() => setAdding(true)}><PackagePlus size={14} aria-hidden /> Remettre du matériel</button>}
          <button type="button" className="small" disabled={isPending} onClick={() => run(() => requestImage(row.id))}>Redemander le droit à l’image</button>
          <button type="button" className="small ghost" disabled={isPending} onClick={() => confirm('Nouveau lien ? L’ancien ne fonctionnera plus.') && run(() => renewEmployeeLink(row.id))}><RefreshCcw size={14} aria-hidden /> Nouveau lien</button>
          <button type="button" className="small danger" disabled={isPending} onClick={() => confirm(`Supprimer ${row.full_name} et ses documents ?`) && run(() => deleteEmployee(row.id), onDeleted)}><Trash2 size={14} aria-hidden /> Supprimer</button>
        </div>
      )}
    </>
  );
}
