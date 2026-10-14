'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, Ban } from 'lucide-react';
import { signEmployeeDocs } from '@/app/salaries/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { DOC_LABEL, MATERIAL_ITEMS, materialSummary, type EmployeeDoc } from '@/lib/salaries';

const TEMPLATE = { image: '/templates/autorisation-image.pdf', materiel: '/templates/remise-materiel.pdf' };

/** Page personnelle du salarié : relire, compléter l'adresse, signer en une fois ; puis télécharger ses PDF. */
export function EmployeeSign({
  link,
  name,
  address: initialAddress,
  docs,
  cachet,
}: {
  link: string;
  name: string;
  address: string | null;
  docs: EmployeeDoc[];
  cachet: string | null;
}) {
  const router = useRouter();
  const pending = docs.filter((d) => !d.signed_at);
  const signed = docs.filter((d) => d.signed_at);
  const [address, setAddress] = useState(initialAddress || '');
  const [city, setCity] = useState('Cuincy');
  const [imageOk, setImageOk] = useState<boolean | null>(null);
  const [read, setRead] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);
  const hasImage = pending.some((d) => d.kind === 'image');
  const ready = address.trim() && city.trim() && read && !empty && (!hasImage || imageOk !== null);
  const pdfItem = (d: EmployeeDoc) => ({ auth: { ...d, signed_at: d.signed_at!, data: d.data as Record<string, any> }, traineeName: name });

  return (
    <div className="autor-form">
      {pending.length === 0 ? (
        <div className="sign-done" role="status">
          <CheckCircle2 size={44} aria-hidden />
          <h2>Tout est signé, merci !</h2>
        </div>
      ) : (
        <>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <label className="field">
            Mon adresse
            <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="N°, rue, code postal, ville" />
          </label>
          {pending.map((d) => (
            <section key={d.id} className="autor-card">
              <h3>{DOC_LABEL[d.kind]}</h3>
              {d.kind === 'image' ? (
                <>
                  <p className="hint">
                    Photos et vidéos réalisées par CF Réseaux (site, réseaux sociaux…). Tu peux accepter ou refuser.{' '}
                    <a href={TEMPLATE.image} target="_blank" rel="noreferrer" className="autor-doc-link"><FileText size={13} aria-hidden /> Lire le document</a>
                  </p>
                  <div className="status-choice">
                    <label><input type="radio" name="img" checked={imageOk === true} onChange={() => setImageOk(true)} /> J’autorise</label>
                    <label><input type="radio" name="img" checked={imageOk === false} onChange={() => setImageOk(false)} /> Je n’autorise pas</label>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">
                    Équipements reçus de CF Réseaux, à conserver en bon état et à restituer en cas de départ.{' '}
                    <a href={TEMPLATE.materiel} target="_blank" rel="noreferrer" className="autor-doc-link"><FileText size={13} aria-hidden /> Lire le document</a>
                  </p>
                  <ul className="material-list">
                    {MATERIAL_ITEMS.filter((i) => (d.data[i.key] || 0) > 0).map((i) => (
                      <li key={i.key}><strong>{d.data[i.key]}</strong> {i.label}</li>
                    ))}
                  </ul>
                  <p className="hint">Une erreur dans la liste ? Préviens le bureau administratif avant de signer.</p>
                </>
              )}
            </section>
          ))}
          <section className="autor-card">
            <h3>Signature</h3>
            <label className="field">Fait à<input value={city} onChange={(e) => setCity(e.target.value)} /></label>
            <label className="check-line" style={{ margin: '10px 0' }}>
              <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> Lu et approuvé
            </label>
            <SignaturePad ref={pad} height={180} onChange={setEmpty} />
          </section>
          <div className="sign-actions">
            <button
              type="button"
              className="primary"
              disabled={isPending || !ready}
              onClick={() => {
                const signature = pad.current?.toDataURL();
                if (!signature) return setError('Signe dans le cadre avant de valider.');
                startTransition(async () => {
                  const res = await signEmployeeDocs(link, { address, city, imageAccepted: hasImage ? imageOk : null, signature });
                  if (!res.ok) setError(res.error);
                  else {
                    setError(null);
                    router.refresh();
                  }
                });
              }}
            >
              {isPending ? 'Signature…' : `Signer ${pending.length > 1 ? `les ${pending.length} documents` : 'le document'}`}
            </button>
          </div>
        </>
      )}

      {signed.length > 0 && (
        <section className="autor-card">
          <h3>Mes documents signés</h3>
          <ul className="material-list">
            {signed.map((d) => (
              <li key={d.id} style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{DOC_LABEL[d.kind]}</strong> · {new Date(d.signed_at!).toLocaleDateString('fr-FR')}
                  {d.kind === 'image' && !d.accepted && <span className="autor-refus" style={{ marginLeft: 6 }}><Ban size={12} aria-hidden /> refus</span>}
                  {d.kind === 'materiel' && <span className="hint"> · {materialSummary(d.data)}{d.returned_at ? ' · restitué' : ''}</span>}
                </span>
                <AuthPdfButton items={[pdfItem(d)]} cachet={cachet} fileName={`${DOC_LABEL[d.kind]} - ${name}.pdf`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
