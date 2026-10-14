'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Shirt, X, PenLine, PackageCheck, Trash2, AlertTriangle } from 'lucide-react';
import { lendClothes, signLoan, returnClothes, deleteLoan } from '@/app/vetements/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { LOAN_STATUS_LABEL, clothesText, loanStatus, missingOf, missingText, type ClothingLoan } from '@/lib/vetements';

type Result = { ok: true } | { ok: false; error: string };
type Person = { id: string; name: string; address: string | null };

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

function Stepper({ label, value, max = 20, onChange }: { label: string; value: number; max?: number; onChange: (n: number) => void }) {
  return (
    <div className="autor-counter">
      <span>{label}</span>
      <div>
        <button type="button" className="small icon" aria-label={`Moins : ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <strong aria-live="polite">{value}</strong>
        <button type="button" className="small icon" aria-label={`Plus : ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

const fr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');

export const loanPdf = (l: ClothingLoan, name: string) => ({
  auth: {
    kind: 'vetements' as const,
    accepted: true,
    signature: l.signature,
    city: l.city,
    signed_at: l.signed_at || l.created_at,
    returned_at: l.returned_at,
    return_signature: l.return_signature,
    data: {
      address: l.address, vestes: l.vestes, pantalons: l.pantalons,
      returned_vestes: l.returned_vestes, returned_pantalons: l.returned_pantalons, return_note: l.return_note,
    },
  },
  traineeName: name,
});

/** Signature du prêt par le stagiaire (sur la tablette du formateur / du bureau). */
function SignStep({ address: initial, onSign, isPending, label }: { address: string | null; onSign: (s: { address: string; city: string; signature: string }) => void; isPending: boolean; label: string }) {
  const [address, setAddress] = useState(initial || '');
  const [city, setCity] = useState('Cuincy');
  const [read, setRead] = useState(false);
  const [empty, setEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  return (
    <>
      <label className="field">Adresse du stagiaire<textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="N°, rue, code postal, ville" /></label>
      <label className="field" style={{ marginTop: 8 }}>Fait à<input value={city} onChange={(e) => setCity(e.target.value)} /></label>
      <label className="check-line" style={{ margin: '10px 0' }}>
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> Lu et approuvé : je m’engage à nettoyer les vêtements et à les ramener au siège de CF Réseaux.
      </label>
      <SignaturePad ref={pad} height={160} onChange={setEmpty} />
      <div className="sign-actions">
        <button
          type="button"
          className="primary"
          disabled={isPending || empty || !read || !address.trim() || !city.trim()}
          onClick={() => {
            const signature = pad.current?.toDataURL();
            if (signature) onSign({ address, city, signature });
          }}
        >
          {label}
        </button>
      </div>
    </>
  );
}

/** Retour : vêtements rendus (au total) + signature ; ce qui manque est signalé. */
function ReturnStep({ loan, onDone, isPending }: { loan: ClothingLoan; onDone: (r: { vestes: number; pantalons: number; note: string; signature: string }) => void; isPending: boolean }) {
  const [vestes, setVestes] = useState(loan.returned_at ? Math.max(loan.returned_vestes ?? 0, loan.vestes) : loan.vestes);
  const [pantalons, setPantalons] = useState(loan.returned_at ? Math.max(loan.returned_pantalons ?? 0, loan.pantalons) : loan.pantalons);
  const [note, setNote] = useState(loan.return_note || '');
  const [empty, setEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const mv = loan.vestes - vestes;
  const mp = loan.pantalons - pantalons;
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>Prêtés : <strong>{clothesText(loan.vestes, loan.pantalons)}</strong>. Indique ce qui est rendu (au total).</p>
      <div className="autor-counts">
        {loan.vestes > 0 && <Stepper label="Vestes rendues" value={vestes} max={loan.vestes} onChange={setVestes} />}
        {loan.pantalons > 0 && <Stepper label="Pantalons rendus" value={pantalons} max={loan.pantalons} onChange={setPantalons} />}
      </div>
      {mv + mp > 0 ? (
        <div role="alert" className="alert alert-warning" style={{ marginTop: 10 }}>
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> Manque : <strong>{clothesText(mv, mp)}</strong>. Ce sera noté sur l’attestation et sur la fiche du stagiaire.
        </div>
      ) : (
        <p className="hint">Tous les vêtements sont rendus.</p>
      )}
      <label className="field" style={{ marginTop: 8 }}>Remarque (facultatif)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. pantalon oublié, le ramène lundi" /></label>
      <p className="sub-heading" style={{ margin: '12px 0 6px' }}>Signature du stagiaire pour le retour</p>
      <SignaturePad ref={pad} height={150} onChange={setEmpty} />
      <div className="sign-actions">
        <button
          type="button"
          className="primary"
          disabled={isPending || empty}
          onClick={() => {
            const signature = pad.current?.toDataURL();
            if (signature) onDone({ vestes, pantalons, note, signature });
          }}
        >
          Valider le retour
        </button>
      </div>
    </>
  );
}

/** Ligne d'un prêt : statut, manquants, actions (signer, retour, PDF). */
function LoanItem({
  loan,
  name,
  address,
  canManage,
  cachet,
  extra,
  run,
  isPending,
}: {
  loan: ClothingLoan;
  name: string;
  address: string | null;
  canManage: boolean;
  cachet: string | null;
  extra?: string;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<null | 'sign' | 'return'>(null);
  const st = loanStatus(loan);
  const miss = missingText(loan);
  return (
    <li className={`loan-item ${st}`}>
      <span className="loan-main">
        <strong>{name}</strong> · {clothesText(loan.vestes, loan.pantalons)}
        <span className={`loan-status ${st}`}>{LOAN_STATUS_LABEL[st]}</span>
        {miss && <span className="autor-refus"><AlertTriangle size={12} aria-hidden /> {miss}</span>}
        <span className="hint loan-dates">
          {extra ? `${extra} · ` : ''}
          {loan.signed_at ? `prêtés le ${fr(loan.signed_at)}` : 'à faire signer'}
          {loan.returned_at ? ` · retour le ${fr(loan.returned_at)}` : ''}
          {loan.return_note ? ` · « ${loan.return_note} »` : ''}
        </span>
      </span>
      <span className="row-actions">
        {st === 'a_signer' && <button type="button" className="small primary" onClick={() => setMode('sign')}><PenLine size={14} aria-hidden /> Faire signer</button>}
        {(st === 'prete' || st === 'incomplet') && (
          <button type="button" className="small" onClick={() => setMode('return')}><PackageCheck size={14} aria-hidden /> {st === 'incomplet' ? 'Compléter le retour' : 'Retour'}</button>
        )}
        {loan.signed_at && <AuthPdfButton items={[loanPdf(loan, name)]} cachet={cachet} fileName={`Vêtements TST - ${name}.pdf`} />}
        {canManage && (
          <button type="button" className="small icon ghost" aria-label="Supprimer le prêt" disabled={isPending} onClick={() => confirm('Supprimer ce prêt de vêtements ?') && run(() => deleteLoan(loan.id))}>
            <Trash2 size={14} />
          </button>
        )}
      </span>
      <Modal open={mode === 'sign'} onClose={() => setMode(null)} title={`Prêt de vêtements · ${name}`}>
        <p className="hint" style={{ marginTop: 0 }}>Prêtés : <strong>{clothesText(loan.vestes, loan.pantalons)}</strong>.</p>
        <SignStep address={loan.address || address} isPending={isPending} label="Signer le prêt" onSign={(s) => run(() => signLoan(loan.id, s), () => setMode(null))} />
      </Modal>
      <Modal open={mode === 'return'} onClose={() => setMode(null)} title={`Retour des vêtements · ${name}`}>
        <ReturnStep loan={loan} isPending={isPending} onDone={(r) => run(() => returnClothes(loan.id, r), () => setMode(null))} />
      </Modal>
    </li>
  );
}

function useRun() {
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
  return { error, isPending, run };
}

/**
 * Fiche session : prêts de vêtements TST, seulement aux stagiaires choisis
 * (ceux qui ont leurs propres EPI n'ont rien à signer).
 */
export function SessionLoans({
  sessionId,
  trainees,
  loans,
  otherOpen,
  canManage,
  cachet,
}: {
  sessionId: string;
  trainees: Person[];
  loans: ClothingLoan[];
  /** Vêtements pas (entièrement) rendus d'une formation précédente. */
  otherOpen: ClothingLoan[];
  canManage: boolean;
  cachet: string | null;
}) {
  const { error, isPending, run } = useRun();
  const [lending, setLending] = useState(false);
  const [who, setWho] = useState('');
  const [vestes, setVestes] = useState(1);
  const [pantalons, setPantalons] = useState(1);
  const [step, setStep] = useState<'choose' | 'sign'>('choose');
  const person = (id: string) => trainees.find((t) => t.id === id);
  const reset = () => { setLending(false); setWho(''); setVestes(1); setPantalons(1); setStep('choose'); };

  return (
    <section className="panel" id="vetements">
      <div className="panel-head">
        <h2><Shirt size={17} aria-hidden /> Vêtements TST prêtés</h2>
        {trainees.length > 0 && <button type="button" className="small" onClick={() => setLending(true)}><Shirt size={14} aria-hidden /> Prêter des vêtements</button>}
      </div>
      {error && !lending && <div role="alert" className="alert alert-error">{error}</div>}
      {otherOpen.length > 0 && (
        <div role="alert" className="alert alert-warning">
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> Vêtements d’une formation précédente pas rendus :{' '}
          {otherOpen.map((l) => {
            const m = missingOf(l);
            return `${person(l.trainee_id)?.name || 'Stagiaire'} (${clothesText(m.vestes, m.pantalons)})`;
          }).join(' · ')}
        </div>
      )}
      {!loans.length ? (
        <p className="hint" style={{ margin: 0 }}>Aucun prêt : seuls les stagiaires sans leurs propres EPI signent l’attestation.</p>
      ) : (
        <ul className="loan-list">
          {loans.map((l) => (
            <LoanItem key={l.id} loan={l} name={person(l.trainee_id)?.name || 'Stagiaire'} address={person(l.trainee_id)?.address || null} canManage={canManage} cachet={cachet} run={run} isPending={isPending} />
          ))}
        </ul>
      )}

      <Modal open={lending} onClose={reset} title="Prêter des vêtements TST">
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {step === 'choose' ? (
          <>
            <label className="field">
              Stagiaire
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Choisir le stagiaire…</option>
                {trainees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="autor-counts" style={{ marginTop: 10 }}>
              <Stepper label="Veste(s) TST" value={vestes} onChange={setVestes} />
              <Stepper label="Pantalon(s) TST" value={pantalons} onChange={setPantalons} />
            </div>
            <div className="form-actions" style={{ marginTop: 14 }}>
              <button type="button" className="primary" disabled={!who || vestes + pantalons === 0} onClick={() => setStep('sign')}>
                <PenLine size={15} aria-hidden /> Faire signer maintenant
              </button>
              <button
                type="button"
                disabled={!who || vestes + pantalons === 0 || isPending}
                onClick={() => run(async () => lendClothes(sessionId, who, { vestes, pantalons }, null), reset)}
                title="Le stagiaire signera plus tard (QR code des autorisations ou bouton « Faire signer »)"
              >
                Signer plus tard
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              <strong>{person(who)?.name}</strong> emprunte {clothesText(vestes, pantalons)}.{' '}
              <button type="button" className="small ghost" onClick={() => setStep('choose')}>Modifier</button>
            </p>
            <SignStep
              address={person(who)?.address || null}
              isPending={isPending}
              label="Signer le prêt"
              onSign={(s) => run(async () => lendClothes(sessionId, who, { vestes, pantalons }, s), reset)}
            />
          </>
        )}
      </Modal>
    </section>
  );
}

/** Fiche stagiaire : tous ses prêts, avec le retour possible à tout moment. */
export function TraineeLoans({
  traineeName,
  address,
  loans,
  sessionTitles,
  canManage,
  cachet,
}: {
  traineeName: string;
  address: string | null;
  loans: ClothingLoan[];
  sessionTitles: Record<string, string>;
  canManage: boolean;
  cachet: string | null;
}) {
  const { error, isPending, run } = useRun();
  if (!loans.length) return null;
  const open = loans.filter((l) => ['prete', 'incomplet'].includes(loanStatus(l)));
  return (
    <section className="panel" id="vetements">
      <h2><Shirt size={17} aria-hidden /> Vêtements TST prêtés</h2>
      {open.length > 0 && (
        <div role="alert" className="alert alert-warning">
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> À rendre :{' '}
          {open.map((l) => { const m = missingOf(l); return clothesText(m.vestes, m.pantalons); }).join(' + ')}
        </div>
      )}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <ul className="loan-list">
        {[...loans].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((l) => (
          <LoanItem
            key={l.id}
            loan={l}
            name={traineeName}
            address={address}
            extra={l.session_id ? sessionTitles[l.session_id] : undefined}
            canManage={canManage}
            cachet={cachet}
            run={run}
            isPending={isPending}
          />
        ))}
      </ul>
    </section>
  );
}
