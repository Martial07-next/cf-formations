'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Shirt, X, PenLine, PackageCheck, Trash2, AlertTriangle } from 'lucide-react';
import { lendClothes, lendFromTrainee, signLoan, returnClothes, deleteLoan } from '@/app/vetements/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { LOAN_STATUS_LABEL, clothesText, loanStatus, loanText, missingOf, missingText, type ClothingLoan } from '@/lib/vetements';
import { askConfirm } from '@/lib/confirm-dialog';

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
      address: l.address, vestes: l.vestes, pantalons: l.pantalons, baudriers: l.baudriers || 0,
      returned_vestes: l.returned_vestes, returned_pantalons: l.returned_pantalons, returned_baudriers: l.returned_baudriers ?? null, return_note: l.return_note,
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
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> Lu et approuvé : je m’engage à nettoyer les vêtements, à garder le matériel en bon état et à tout ramener au siège de CF Réseaux.
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
function ReturnStep({ loan, onDone, isPending }: { loan: ClothingLoan; onDone: (r: { vestes: number; pantalons: number; baudriers: number; note: string; signature: string }) => void; isPending: boolean }) {
  const lentB = loan.baudriers || 0;
  const [baudriers, setBaudriers] = useState(loan.returned_at ? Math.max(loan.returned_baudriers ?? 0, lentB) : lentB);
  const mb = lentB - baudriers;
  const [vestes, setVestes] = useState(loan.returned_at ? Math.max(loan.returned_vestes ?? 0, loan.vestes) : loan.vestes);
  const [pantalons, setPantalons] = useState(loan.returned_at ? Math.max(loan.returned_pantalons ?? 0, loan.pantalons) : loan.pantalons);
  const [note, setNote] = useState(loan.return_note || '');
  const [empty, setEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const mv = loan.vestes - vestes;
  const mp = loan.pantalons - pantalons;
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>Prêtés : <strong>{loanText(loan)}</strong>. Indique ce qui est rendu (au total).</p>
      <div className="autor-counts">
        {loan.vestes > 0 && <Stepper label="Vestes rendues" value={vestes} max={loan.vestes} onChange={setVestes} />}
        {loan.pantalons > 0 && <Stepper label="Pantalons rendus" value={pantalons} max={loan.pantalons} onChange={setPantalons} />}
        {lentB > 0 && <Stepper label="Baudriers rendus" value={baudriers} max={lentB} onChange={setBaudriers} />}
      </div>
      {mv + mp + mb > 0 ? (
        <div role="alert" className="alert alert-warning" style={{ marginTop: 10 }}>
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> Manque : <strong>{clothesText(mv, mp, mb)}</strong>. Ce sera noté sur l’attestation et sur la fiche du stagiaire.
        </div>
      ) : (
        <p className="hint">Tout est rendu.</p>
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
            if (signature) onDone({ vestes, pantalons, baudriers, note, signature });
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
        <strong>{name}</strong> · {loanText(loan)}
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
        {loan.signed_at && <AuthPdfButton items={[loanPdf(loan, name)]} cachet={cachet} fileName={`Prêt de matériel - ${name}.pdf`} />}
        {canManage && (
          <button type="button" className="small icon ghost" aria-label="Supprimer le prêt" disabled={isPending} onClick={async () => (await askConfirm('Supprimer ce prêt ?')) && run(() => deleteLoan(loan.id))}>
            <Trash2 size={14} />
          </button>
        )}
      </span>
      <Modal open={mode === 'sign'} onClose={() => setMode(null)} title={`Prêt de matériel · ${name}`}>
        <p className="hint" style={{ marginTop: 0 }}>Prêtés : <strong>{loanText(loan)}</strong>.</p>
        <SignStep address={loan.address || address} isPending={isPending} label="Signer le prêt" onSign={(s) => run(() => signLoan(loan.id, s), () => setMode(null))} />
      </Modal>
      <Modal open={mode === 'return'} onClose={() => setMode(null)} title={`Retour du matériel · ${name}`}>
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

type Qty = { vestes: number; pantalons: number; baudriers: number };
type Sign = { address: string; city: string; signature: string };

/**
 * Nouveau prêt : stagiaire (choisi dans la liste, ou déjà connu), session
 * éventuelle (fiche stagiaire), quantités, puis signature maintenant ou plus tard.
 */
function LendModal({
  open,
  onClose,
  people,
  fixed,
  sessions,
  error,
  isPending,
  onLend,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  fixed?: Person;
  sessions?: { id: string; title: string }[];
  error: string | null;
  isPending: boolean;
  onLend: (who: string, sessionId: string | null, qty: Qty, sign: Sign | null, done: () => void) => void;
}) {
  const [who, setWho] = useState(fixed?.id || '');
  const [sessionId, setSessionId] = useState(sessions?.[0]?.id || '');
  const [vestes, setVestes] = useState(0);
  const [pantalons, setPantalons] = useState(0);
  const [baudriers, setBaudriers] = useState(0);
  const [step, setStep] = useState<'choose' | 'sign'>('choose');
  const reset = () => { setWho(fixed?.id || ''); setVestes(0); setPantalons(0); setBaudriers(0); setStep('choose'); onClose(); };
  const person = fixed || people.find((t) => t.id === who);
  const total = vestes + pantalons + baudriers;
  const qty = { vestes, pantalons, baudriers };
  return (
    <Modal open={open} onClose={reset} title={fixed ? `Prêter du matériel · ${fixed.name}` : 'Prêter du matériel'}>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {step === 'choose' ? (
        <>
          {!fixed && (
            <label className="field">
              Stagiaire
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Choisir le stagiaire…</option>
                {people.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          {sessions && (
            <label className="field">
              Formation concernée
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                <option value="">Aucune formation en particulier</option>
              </select>
            </label>
          )}
          <div className="autor-counts" style={{ marginTop: 10 }}>
            <Stepper label="Veste(s) TST" value={vestes} onChange={setVestes} />
            <Stepper label="Pantalon(s) TST" value={pantalons} onChange={setPantalons} />
            <Stepper label="Baudrier(s)" value={baudriers} onChange={setBaudriers} />
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button type="button" className="primary" disabled={!person || total === 0} onClick={() => setStep('sign')}>
              <PenLine size={15} aria-hidden /> Faire signer maintenant
            </button>
            <button
              type="button"
              disabled={!person || total === 0 || isPending}
              onClick={() => onLend(person!.id, sessionId || null, qty, null, reset)}
              title="Le stagiaire signera plus tard (bouton « Faire signer », ou QR code des autorisations de la session)"
            >
              Signer plus tard
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            <strong>{person?.name}</strong> emprunte {clothesText(vestes, pantalons, baudriers)}.{' '}
            <button type="button" className="small ghost" onClick={() => setStep('choose')}>Modifier</button>
          </p>
          <SignStep address={person?.address || null} isPending={isPending} label="Signer le prêt" onSign={(s) => onLend(person!.id, sessionId || null, qty, s, reset)} />
        </>
      )}
    </Modal>
  );
}

/**
 * Fiche session : prêts de vêtements TST et de baudriers, seulement aux
 * stagiaires choisis (ceux qui ont leur propre équipement n'ont rien à signer).
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
  /** Matériel pas (entièrement) rendu d'une formation précédente. */
  otherOpen: ClothingLoan[];
  canManage: boolean;
  cachet: string | null;
}) {
  const { error, isPending, run } = useRun();
  const [lending, setLending] = useState(false);
  const person = (id: string) => trainees.find((t) => t.id === id);

  return (
    <section className="panel" id="vetements">
      <div className="panel-head">
        <h2><Shirt size={17} aria-hidden /> Vêtements TST et baudriers prêtés</h2>
        {trainees.length > 0 && <button type="button" className="small" onClick={() => setLending(true)}><Shirt size={14} aria-hidden /> Prêter du matériel</button>}
      </div>
      {error && !lending && <div role="alert" className="alert alert-error">{error}</div>}
      {otherOpen.length > 0 && (
        <div role="alert" className="alert alert-warning">
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> Matériel d’une formation précédente pas rendu :{' '}
          {otherOpen.map((l) => {
            const m = missingOf(l);
            return `${person(l.trainee_id)?.name || 'Stagiaire'} (${clothesText(m.vestes, m.pantalons, m.baudriers)})`;
          }).join(' · ')}
        </div>
      )}
      {!loans.length ? (
        <p className="hint" style={{ margin: 0 }}>Aucun prêt : seuls les stagiaires sans leur propre équipement signent l’attestation.</p>
      ) : (
        <ul className="loan-list">
          {loans.map((l) => (
            <LoanItem key={l.id} loan={l} name={person(l.trainee_id)?.name || 'Stagiaire'} address={person(l.trainee_id)?.address || null} canManage={canManage} cachet={cachet} run={run} isPending={isPending} />
          ))}
        </ul>
      )}
      <LendModal
        open={lending}
        onClose={() => setLending(false)}
        people={trainees}
        error={error}
        isPending={isPending}
        onLend={(who, _s, qty, sign, done) => run(async () => lendClothes(sessionId, who, qty, sign), done)}
      />
    </section>
  );
}

/** Fiche stagiaire : tous ses prêts, nouveau prêt possible, retour à tout moment. */
export function TraineeLoans({
  traineeId,
  traineeName,
  address,
  loans,
  sessionTitles,
  lendSessions = [],
  canLend = false,
  canManage,
  cachet,
}: {
  traineeId: string;
  traineeName: string;
  address: string | null;
  loans: ClothingLoan[];
  sessionTitles: Record<string, string>;
  /** Sessions proposées pour rattacher un nouveau prêt (en cours et à venir d'abord). */
  lendSessions?: { id: string; title: string }[];
  canLend?: boolean;
  canManage: boolean;
  cachet: string | null;
}) {
  const { error, isPending, run } = useRun();
  const [lending, setLending] = useState(false);
  if (!loans.length && !canLend) return null;
  const open = loans.filter((l) => ['prete', 'incomplet'].includes(loanStatus(l)));
  const me = { id: traineeId, name: traineeName, address };
  return (
    <section className="panel" id="vetements">
      <div className="panel-head">
        <h2><Shirt size={17} aria-hidden /> Vêtements TST et baudriers prêtés</h2>
        {canLend && <button type="button" className="small" onClick={() => setLending(true)}><Shirt size={14} aria-hidden /> Prêter du matériel</button>}
      </div>
      {open.length > 0 && (
        <div role="alert" className="alert alert-warning">
          <AlertTriangle size={15} aria-hidden style={{ verticalAlign: '-3px' }} /> À rendre :{' '}
          {open.map((l) => { const m = missingOf(l); return clothesText(m.vestes, m.pantalons, m.baudriers); }).join(' + ')}
        </div>
      )}
      {error && !lending && <div role="alert" className="alert alert-error">{error}</div>}
      {!loans.length ? (
        <p className="hint" style={{ margin: 0 }}>Aucun prêt pour ce stagiaire.</p>
      ) : (
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
      )}
      {canLend && (
        <LendModal
          open={lending}
          onClose={() => setLending(false)}
          people={[me]}
          fixed={me}
          sessions={lendSessions}
          error={error}
          isPending={isPending}
          onLend={(who, sessionId, qty, sign, done) => run(async () => lendFromTrainee(who, sessionId, qty, sign), done)}
        />
      )}
    </section>
  );
}
