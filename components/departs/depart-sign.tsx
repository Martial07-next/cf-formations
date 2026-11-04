'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { CheckCircle2, ChevronLeft, Clock, Search } from 'lucide-react';
import { recordDeparture } from '@/app/depart/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import { DEPART_REASONS, departWhen } from '@/lib/departs';

const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Attestation de départ anticipé, remplie par le stagiaire sur son téléphone. */
export function DepartSign({ token, formationTitle, trainees }: { token: string; formationTitle: string; trainees: { id: string; name: string }[] }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState<{ name: string; at: string } | null>(null);

  if (done) {
    const w = departWhen(done.at);
    return (
      <div className="sign-done" role="status">
        <CheckCircle2 size={48} aria-hidden />
        <h2>C’est enregistré, {done.name}</h2>
        <p>Départ anticipé le <strong>{w.date}</strong> à <strong>{w.time}</strong>. Le formateur et le bureau sont prévenus. Bonne route !</p>
        <button onClick={() => { setDone(null); setChosen(null); setQuery(''); }}>Un autre stagiaire</button>
      </div>
    );
  }
  if (chosen) return <DepartForm token={token} formationTitle={formationTitle} trainee={chosen} onBack={() => setChosen(null)} onDone={(at) => setDone({ name: chosen.name, at })} />;

  const list = trainees.filter((t) => fold(t.name).includes(fold(query.trim())));
  return (
    <div className="sign-step">
      <label className="search" style={{ marginBottom: 10 }}>
        <Search size={15} aria-hidden />
        <span className="sr-only">Rechercher mon nom</span>
        <input placeholder="Mon nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="sign-names">
        {list.map((t) => (
          <button key={t.id} type="button" className="sign-name" onClick={() => setChosen(t)}>
            <span>{t.name}</span>
          </button>
        ))}
        {!list.length && <p className="hint">Aucun stagiaire trouvé. Vérifie avec le formateur que tu es bien inscrit.</p>}
      </div>
    </div>
  );
}

function DepartForm({ token, formationTitle, trainee, onBack, onDone }: { token: string; formationTitle: string; trainee: { id: string; name: string }; onBack: () => void; onDone: (at: string) => void }) {
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [city, setCity] = useState('Cuincy');
  const [read, setRead] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [isPending, startTransition] = useTransition();
  const pad = useRef<SignaturePadHandle>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 15000);
    return () => clearInterval(t);
  }, []);
  const w = departWhen(now);
  const ready = reason && (reason !== 'Autre' || details.trim()) && city.trim() && read && !empty;

  return (
    <div className="sign-step autor-form">
      <button type="button" className="ghost small" onClick={onBack}><ChevronLeft size={15} aria-hidden /> Ce n’est pas moi</button>
      <p className="eyebrow">Mon départ</p>
      <h2>{trainee.name}</h2>
      {error && <div role="alert" className="alert alert-error">{error}</div>}

      <section className="autor-card depart-when">
        <Clock size={18} aria-hidden />
        <div>
          <strong>Le {w.date} à {w.time}</strong>
          <small>Date et heure enregistrées automatiquement à l’envoi · {formationTitle}</small>
        </div>
      </section>

      <section className="autor-card">
        <h3>Raison du départ</h3>
        <div className="depart-reasons" role="radiogroup" aria-label="Raison du départ">
          {DEPART_REASONS.map((r) => (
            <label key={r} className={`depart-reason${reason === r ? ' on' : ''}`}>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
            </label>
          ))}
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          {reason === 'Autre' ? 'Précise la raison' : 'Précision (facultatif)'}
          <input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} />
        </label>
      </section>

      <section className="autor-card">
        <h3>Décharge de responsabilité</h3>
        <p className="hint" style={{ margin: 0 }}>
          Je reconnais quitter plus tôt la formation « {formationTitle} » dispensée par CF Réseaux. Je certifie que cette décision a été prise en toute connaissance de cause et sans contrainte de la part de l’organisme de formation. En conséquence, je décharge l’organisme de formation CF Réseaux, ainsi que ses responsables et formateurs, de toute responsabilité liée à ce départ anticipé.
        </p>
      </section>

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
            if (!signature) return setError('Signe dans le cadre avant d’envoyer.');
            setError(null);
            startTransition(async () => {
              const res = await recordDeparture(token, trainee.id, { reason, details, city, signature });
              if (!res.ok) setError(res.error);
              else onDone(res.departedAt);
            });
          }}
        >
          {isPending ? 'Envoi…' : 'Envoyer mon attestation'}
        </button>
      </div>
    </div>
  );
}
