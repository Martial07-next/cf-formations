'use client';

import { useRef, useState, useTransition } from 'react';
import { CheckCircle2, PenLine, Search } from 'lucide-react';
import { signAttendance } from '@/app/emargement/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';

/** Page du stagiaire (après scan du QR code) : choisir son nom puis signer. */
export function EmargementSign({
  token,
  trainees,
}: {
  token: string;
  trainees: { id: string; name: string; signed: boolean }[];
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState<string[]>(trainees.filter((t) => t.signed).map((t) => t.id));
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(true);
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);

  const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = trainees.filter((t) => fold(t.name).includes(fold(query.trim())));

  if (success) {
    return (
      <div className="sign-done" role="status">
        <CheckCircle2 size={48} aria-hidden />
        <h2>Merci {success} !</h2>
        <p>Ta signature est enregistrée sur la feuille d’émargement.</p>
        <button onClick={() => { setSuccess(null); setChosen(null); setQuery(''); }}>Un autre stagiaire signe</button>
      </div>
    );
  }

  if (chosen) {
    return (
      <div className="sign-step">
        <p className="eyebrow">Signature</p>
        <h2>{chosen.name}</h2>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <SignaturePad ref={pad} height={200} onChange={setEmpty} />
        <div className="sign-actions">
          <button type="button" onClick={() => { setChosen(null); setError(null); }}>Ce n’est pas moi</button>
          <button
            type="button"
            className="primary"
            disabled={isPending || empty}
            onClick={() => {
              const sig = pad.current?.toDataURL();
              if (!sig) return setError('Signe dans le cadre avant de valider.');
              setError(null);
              startTransition(async () => {
                const res = await signAttendance(token, chosen.id, sig);
                if (!res.ok) setError(res.error);
                else {
                  setDone((d) => [...d, chosen.id]);
                  setSuccess(chosen.name);
                }
              });
            }}
          >
            <PenLine size={16} aria-hidden /> {isPending ? 'Enregistrement…' : 'Je signe'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sign-step">
      <p className="eyebrow">Étape 1</p>
      <h2>Touche ton nom</h2>
      <label className="search" style={{ width: '100%', marginBottom: 10 }}>
        <Search size={15} aria-hidden />
        <span className="sr-only">Rechercher ton nom</span>
        <input placeholder="Rechercher ton nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sign-names">
        {list.map((t) => {
          const signed = done.includes(t.id);
          return (
            <button key={t.id} type="button" className="sign-name" disabled={signed} onClick={() => setChosen(t)}>
              <span>{t.name}</span>
              {signed && <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Signé</span>}
            </button>
          );
        })}
        {list.length === 0 && <p className="hint">Nom introuvable : préviens le formateur.</p>}
      </div>
    </div>
  );
}
