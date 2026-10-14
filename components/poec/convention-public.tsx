'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Download, Save, PenLine } from 'lucide-react';
import { saveCompanyInfo, signAsCompany, signAsTrainee } from '@/app/convention/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { COMPANY_FIELDS, frShort, missingCompany, signatureSteps, type Convention, type PoecPeriod } from '@/lib/poec';
import type { Legal } from '@/lib/pdf-brand';
import type { Director, Party } from '@/lib/poec-public';

export type ConventionPdfData = {
  convention: Convention;
  traineeName: string;
  period: Pick<PoecPeriod, 'start_date' | 'end_date'>;
  programTitle: string;
  director: Director;
  legal: Legal | null;
};

/** Téléchargement du PDF de la convention (généré dans le navigateur). */
export function ConventionPdfButton({ items, fileName, label = 'Télécharger la convention (PDF)', className = '' }: {
  items: ConventionPdfData[];
  fileName: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy || !items.length}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const [{ buildConventionsPdf }, { downloadPdf }] = await Promise.all([import('@/lib/pdf-convention'), import('@/lib/pdf-dossier')]);
            const bytes = await buildConventionsPdf(
              items.map((i) => ({
                convention: i.convention,
                traineeName: i.traineeName,
                periodStart: i.period.start_date,
                periodEnd: i.period.end_date,
                programTitle: i.programTitle,
                director: i.director,
                legal: i.legal,
              }))
            );
            downloadPdf(bytes, fileName);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'PDF impossible à générer.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={15} aria-hidden /> {busy ? 'Préparation…' : label}
      </button>
      {error && <span className="field-error">{error}</span>}
    </>
  );
}

export function SignatureSteps({ c }: { c: Partial<Convention> }) {
  return (
    <ul className="poec-steps">
      {signatureSteps(c).map((s) => (
        <li key={s.key} className={s.done ? 'done' : ''}>
          {s.done ? <CheckCircle2 size={15} aria-hidden /> : <Circle size={15} aria-hidden />} {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Page publique de l'entreprise d'accueil ou du stagiaire : compléter, relire, signer. */
export function ConventionPublic({ token, party, data }: { token: string; party: Party; data: ConventionPdfData }) {
  const router = useRouter();
  const c = data.convention;
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, String((c as any)[f.key] || '')]))
  );
  const [signer, setSigner] = useState(c.company_signer || c.company_rep || '');
  const [role, setRole] = useState(c.company_signer_role || c.company_rep_role || '');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState(c.trainee_address || '');
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);

  const signed = party === 'company' ? Boolean(c.company_signed_at) : Boolean(c.trainee_signed_at);
  const preview: Convention = party === 'company' ? ({ ...c, ...values } as Convention) : { ...c, trainee_address: address };
  const missing = party === 'company' ? missingCompany(preview) : address.trim() ? [] : ['Adresse'];

  const period = `du ${frShort(data.period.start_date)} au ${frShort(data.period.end_date)}`;

  if (signed) {
    return (
      <div className="sign-done" role="status">
        <CheckCircle2 size={48} aria-hidden />
        <h2>Convention signée, merci !</h2>
        <p>
          {party === 'company' ? 'Votre signature est enregistrée.' : 'Ta signature est enregistrée.'} CF Réseaux est prévenu automatiquement.
        </p>
        <SignatureSteps c={c} />
        <ConventionPdfButton items={[data]} fileName={`Convention de stage - ${data.traineeName}.pdf`} className="primary" />
      </div>
    );
  }

  const submit = () => {
    const sig = pad.current?.toDataURL();
    if (!sig) return setError('Signez dans le cadre avant de valider.');
    setError(null);
    startTransition(async () => {
      const res =
        party === 'company'
          ? await signAsCompany(token, values, { signer, role, city, signature: sig })
          : await signAsTrainee(token, { address, city, signature: sig });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="poec-public">
      <div className="poec-summary">
        <div><span>Stagiaire</span><strong>{data.traineeName}</strong></div>
        <div><span>Période de stage</span><strong>{period}</strong></div>
        <div><span>Formation</span><strong>{data.programTitle}</strong></div>
      </div>
      <SignatureSteps c={c} />

      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {info && <div role="status" className="alert alert-success">{info}</div>}

      {party === 'company' ? (
        <section>
          <h2 className="sub-heading">B · L’entreprise d’accueil</h2>
          <p className="hint">Les champs marqués * sont nécessaires pour signer. Vous pouvez enregistrer et revenir plus tard avec le même lien.</p>
          {COMPANY_FIELDS.map((f) => (
            <label key={f.key} className="field" style={{ marginBottom: 12 }}>
              {f.label}{f.required ? ' *' : ''}
              {'multiline' in f && f.multiline ? (
                <textarea rows={f.key === 'missions' ? 4 : 2} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ) : (
                <input
                  type={f.key === 'company_email' ? 'email' : 'text'}
                  value={values[f.key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValues({ ...values, [f.key]: v });
                    if (f.key === 'company_rep' && (!signer || signer === values.company_rep)) setSigner(v);
                    if (f.key === 'company_rep_role' && (!role || role === values.company_rep_role)) setRole(v);
                  }}
                />
              )}
            </label>
          ))}
          <div className="form-actions">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const res = await saveCompanyInfo(token, values);
                  if (!res.ok) setError(res.error);
                  else {
                    setError(null);
                    setInfo('Informations enregistrées.');
                  }
                })
              }
            >
              <Save size={15} aria-hidden /> Enregistrer sans signer
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h2 className="sub-heading">C · Le stagiaire</h2>
          <label className="field" style={{ marginBottom: 12 }}>
            Ton adresse *
            <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="N°, rue, code postal, ville" />
          </label>
          {c.company_name ? (
            <p className="hint">Entreprise d’accueil : <strong>{c.company_name}</strong>{c.company_tutor ? ` · tuteur : ${c.company_tutor}` : ''}</p>
          ) : (
            <p className="hint">L’entreprise d’accueil complète sa partie de son côté.</p>
          )}
        </section>
      )}

      <section className="poec-read">
        <h2 className="sub-heading">Relire la convention</h2>
        <p className="hint">La convention complète (10 articles : période, encadrement, statut, assurance, confidentialité…) est à relire avant de signer.</p>
        <ConventionPdfButton items={[{ ...data, convention: preview }]} fileName={`Convention de stage - ${data.traineeName}.pdf`} label="Lire la convention (PDF)" />
      </section>

      <section>
        <h2 className="sub-heading"><PenLine size={16} aria-hidden /> Signature</h2>
        {party === 'company' && (
          <div className="form-row">
            <label>Nom du signataire *<input value={signer} onChange={(e) => setSigner(e.target.value)} /></label>
            <label>Fonction<input value={role} onChange={(e) => setRole(e.target.value)} /></label>
          </div>
        )}
        <div className="form-row">
          <label>Fait à *<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" /></label>
          <label>Le<input value={new Date().toLocaleDateString('fr-FR')} disabled /></label>
        </div>
        <SignaturePad ref={pad} height={190} onChange={setEmpty} />
        {missing.length > 0 && <p className="field-error">À compléter avant de signer : {missing.join(', ')}.</p>}
        <div className="sign-actions">
          <button type="button" className="primary" disabled={isPending || empty || missing.length > 0 || !city.trim()} onClick={submit}>
            {isPending ? 'Signature…' : 'Lu et approuvé, je signe'}
          </button>
        </div>
      </section>
    </div>
  );
}
