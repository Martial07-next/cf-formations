'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { signAsFranceTravail } from '@/app/convention/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { ConventionPdfButton, type ConventionPdfData } from '@/components/poec/convention-public';
import { ProgrammePdfButton } from '@/components/poec/programme-pdf-button';
import { CONVENTION_STATUS_LABEL, conventionStatus, frShort, type Convention, type PoecPeriod } from '@/lib/poec';
import type { ProgrammeInput } from '@/lib/pdf-poec-programme';
import type { Legal } from '@/lib/pdf-brand';
import type { Director } from '@/lib/poec-public';

export function FranceTravailPanel({
  token,
  programTitle,
  advisor,
  members,
  periods,
  conventions,
  director,
  legal,
  programme,
}: {
  token: string;
  programTitle: string;
  advisor: string;
  members: { id: string; name: string }[];
  periods: PoecPeriod[];
  conventions: Convention[];
  director: Director;
  legal: Legal;
  programme: ProgrammeInput;
}) {
  const router = useRouter();
  const [signer, setSigner] = useState(advisor);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);

  const name = (id: string) => members.find((m) => m.id === id)?.name || 'Stagiaire';
  const pdf = (c: Convention): ConventionPdfData => {
    const p = periods.find((x) => x.id === c.period_id)!;
    return { convention: c, traineeName: name(c.trainee_id), period: p, programTitle, director, legal };
  };
  const ready = conventions.filter((c) => conventionStatus(c) === 'signee');
  const signedAll = conventions.filter((c) => c.ft_signed_at);

  return (
    <>
      <div className="stats">
        <div className="stat"><span>Stagiaires</span><strong>{members.length}</strong></div>
        <div className="stat"><span>Périodes de stage</span><strong>{periods.length}</strong></div>
        <div className="stat"><span>Conventions signées</span><strong>{conventions.filter((c) => ['signee', 'validee_ft'].includes(conventionStatus(c))).length}/{conventions.length}</strong><small>par les 3 parties</small></div>
        <div className="stat"><span>Visées France Travail</span><strong>{signedAll.length}</strong></div>
      </div>
      <div className="form-actions" style={{ marginBottom: 16 }}>
        <ProgrammePdfButton input={programme} />
        <ConventionPdfButton
          items={conventions.filter((c) => periods.some((p) => p.id === c.period_id)).map(pdf)}
          fileName={`Conventions POEC - ${programTitle}.pdf`}
          label="Toutes les conventions (PDF)"
        />
      </div>

      {periods.map((p) => {
        const list = conventions.filter((c) => c.period_id === p.id).sort((a, b) => name(a.trainee_id).localeCompare(name(b.trainee_id), 'fr'));
        return (
          <section key={p.id}>
            <h2 className="sub-heading">{p.label} · du {frShort(p.start_date)} au {frShort(p.end_date)}</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Stagiaire</th><th>Entreprise d’accueil</th><th>Avancement</th><th></th></tr></thead>
                <tbody>
                  {list.map((c) => {
                    const st = conventionStatus(c);
                    return (
                      <tr key={c.id}>
                        <td><strong>{name(c.trainee_id)}</strong></td>
                        <td>{c.company_name || <span className="hint">À compléter</span>}</td>
                        <td><span className={`poec-status ${st}`}>{CONVENTION_STATUS_LABEL[st]}</span></td>
                        <td><ConventionPdfButton items={[pdf(c)]} fileName={`Convention - ${name(c.trainee_id)}.pdf`} label="PDF" className="small" /></td>
                      </tr>
                    );
                  })}
                  {!list.length && <tr><td colSpan={4} className="hint">Aucune convention.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="poec-ft-sign">
        <h2 className="sub-heading"><PenLine size={16} aria-hidden /> Visa France Travail</h2>
        {done && <div role="status" className="alert alert-success">{done}</div>}
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {ready.length === 0 ? (
          <p className="hint">Aucune convention en attente de votre visa : elles apparaissent ici dès que CF Réseaux, l’entreprise et le stagiaire ont signé.</p>
        ) : (
          <>
            <p className="hint">
              {ready.length} convention{ready.length > 1 ? 's' : ''} prête{ready.length > 1 ? 's' : ''} : {ready.map((c) => name(c.trainee_id)).join(', ')}.
              Une seule signature les vise toutes.
            </p>
            <label className="field" style={{ marginBottom: 12 }}>
              Nom du conseiller et agence (cachet)
              <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Ex. Mme Dupont · France Travail Douai" />
            </label>
            <SignaturePad ref={pad} height={170} onChange={setEmpty} />
            <div className="sign-actions">
              <button
                type="button"
                className="primary"
                disabled={isPending || empty || !signer.trim()}
                onClick={() => {
                  const sig = pad.current?.toDataURL();
                  if (!sig) return setError('Signez dans le cadre avant de valider.');
                  startTransition(async () => {
                    const res = await signAsFranceTravail(token, ready.map((c) => c.id), signer, sig);
                    if (!res.ok) setError(res.error);
                    else {
                      setError(null);
                      setDone(`${ready.length} convention${ready.length > 1 ? 's' : ''} visée${ready.length > 1 ? 's' : ''}. Merci !`);
                      router.refresh();
                    }
                  });
                }}
              >
                {isPending ? 'Signature…' : `Viser ${ready.length} convention${ready.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
