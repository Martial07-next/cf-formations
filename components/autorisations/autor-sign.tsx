'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Search, FileText, ChevronLeft } from 'lucide-react';
import { signAuthorizations } from '@/app/autorisations/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { AUTH_KIND, type AuthKind } from '@/lib/autorisations';
import { clothesText } from '@/lib/vetements';
import type { AutorTrainee } from '@/lib/autorisations-server';

const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Page du QR code : le stagiaire choisit son nom, remplit uniquement ce qui manque, signe une fois. */
export function AutorSign({ token, trainees }: { token: string; trainees: AutorTrainee[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<AutorTrainee | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="sign-done" role="status">
        <CheckCircle2 size={48} aria-hidden />
        <h2>Merci {done} !</h2>
        <p>Tes autorisations sont enregistrées. Tu n’auras plus à les remplir sur tes prochaines formations.</p>
        <button onClick={() => { setDone(null); setChosen(null); setQuery(''); router.refresh(); }}>Un autre stagiaire</button>
      </div>
    );
  }

  if (chosen) {
    return <AutorForm token={token} trainee={chosen} onBack={() => setChosen(null)} onDone={() => setDone(chosen.name)} />;
  }

  const list = trainees.filter((t) => fold(t.name).includes(fold(query.trim())));
  return (
    <div className="sign-step">
      <label className="search" style={{ marginBottom: 10 }}>
        <Search size={15} aria-hidden />
        <span className="sr-only">Rechercher mon nom</span>
        <input placeholder="Mon nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sign-names">
        {list.map((t) =>
          t.missing.length + t.loans.length ? (
            <button key={t.id} type="button" className="sign-name" onClick={() => setChosen(t)}>
              <span>{t.name}</span>
              <span className="autor-todo">{t.missing.length + t.loans.length} à remplir</span>
            </button>
          ) : (
            <div key={t.id} className="sign-name autor-ok" aria-label={`${t.name} : rien à remplir`}>
              <span>{t.name}</span>
              <span><CheckCircle2 size={15} aria-hidden /> Rien à remplir</span>
            </div>
          )
        )}
        {!list.length && <p className="hint">Aucun stagiaire trouvé. Vérifie avec le formateur que tu es bien inscrit.</p>}
      </div>
    </div>
  );
}

function AutorForm({ token, trainee, onBack, onDone }: { token: string; trainee: AutorTrainee; onBack: () => void; onDone: () => void }) {
  const kinds = trainee.missing;
  const loans = trainee.loans;
  const needsAddress = kinds.includes('image') || loans.length > 0;
  const [address, setAddress] = useState(trainee.address || '');
  const [imageOk, setImageOk] = useState<boolean | null>(null);
  const [company, setCompany] = useState(trainee.company || '');
  const [memo, setMemo] = useState(false);
  const [pv, setPv] = useState(false);
  const [autres, setAutres] = useState('');
  const [city, setCity] = useState('Cuincy');
  const [read, setRead] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);

  const has = (k: AuthKind) => kinds.includes(k);
  const ready =
    (!needsAddress || (address.trim() && (!has('image') || imageOk !== null))) &&
    (!has('livret') || memo || pv || autres.trim()) &&
    city.trim() && read && !empty;

  const docLink = (k: AuthKind) => (
    <a href={AUTH_KIND[k].template} target="_blank" rel="noreferrer" className="autor-doc-link">
      <FileText size={13} aria-hidden /> Lire le document
    </a>
  );

  return (
    <div className="sign-step autor-form">
      <button type="button" className="ghost small" onClick={onBack}><ChevronLeft size={15} aria-hidden /> Ce n’est pas moi</button>
      <p className="eyebrow">Autorisations à remplir</p>
      <h2>{trainee.name}</h2>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      {needsAddress && (
        <label className="field">
          Mon adresse
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="N°, rue, code postal, ville" />
        </label>
      )}

      {has('image') && (
        <section className="autor-card">
          <h3>{AUTH_KIND.image.short}</h3>
          <p className="hint">{AUTH_KIND.image.intro} {docLink('image')}</p>
          <div className="status-choice">
            <label><input type="radio" name="img" checked={imageOk === true} onChange={() => setImageOk(true)} /> J’autorise</label>
            <label><input type="radio" name="img" checked={imageOk === false} onChange={() => setImageOk(false)} /> Je n’autorise pas</label>
          </div>
        </section>
      )}

      {has('livret') && (
        <section className="autor-card">
          <h3>{AUTH_KIND.livret.short}</h3>
          <p className="hint">{AUTH_KIND.livret.intro} {docLink('livret')}</p>
          <label className="field">Entreprise<input value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label className="check-line"><input type="checkbox" checked={memo} onChange={(e) => setMemo(e.target.checked)} /> 1 MémoFormat Habilitation Électrique</label>
          <label className="check-line"><input type="checkbox" checked={pv} onChange={(e) => setPv(e.target.checked)} /> 1 Livret PV</label>
          <label className="field" style={{ marginTop: 6 }}>Autre(s) document(s)<input value={autres} onChange={(e) => setAutres(e.target.value)} placeholder="Facultatif" /></label>
        </section>
      )}

      {loans.length > 0 && (
        <section className="autor-card">
          <h3>Vêtements TST prêtés</h3>
          <p className="hint">
            CF Réseaux te prête : <strong>{loans.map((l) => clothesText(l.vestes, l.pantalons)).join(' + ')}</strong>. À nettoyer puis à ramener au siège.{' '}
            <a href="/templates/vetements-tst.pdf" target="_blank" rel="noreferrer" className="autor-doc-link"><FileText size={13} aria-hidden /> Lire le document</a>
          </p>
        </section>
      )}

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
            setError(null);
            startTransition(async () => {
              const res = await signAuthorizations(token, trainee.id, {
                address,
                city,
                signature,
                docs: [
                  { kind: 'image', data: { address }, accepted: imageOk !== false },
                  { kind: 'livret', data: { company, memoformat: memo, livret_pv: pv, autres } },
                ].filter((d) => has(d.kind as AuthKind)),
              });
              if (!res.ok) setError(res.error);
              else onDone();
            });
          }}
        >
          {isPending ? 'Enregistrement…' : `Signer ${kinds.length + loans.length > 1 ? `les ${kinds.length + loans.length} documents` : 'le document'}`}
        </button>
      </div>
    </div>
  );
}
