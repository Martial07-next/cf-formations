'use client';

import { useRef, useState } from 'react';
import { Camera, CheckCircle2, FileUp, Loader2, Search } from 'lucide-react';
import { confirmPublicTitleUpload, preparePublicTitleUpload } from '@/app/dossier/titres-actions';
import { sendTitle } from '@/components/dossier/titles';
import { TITLE_ACCEPT, TITLE_MAX_FILES } from '@/lib/titres';

/** Page du stagiaire : choisir son nom, puis photographier ou déposer son titre d'habilitation. */
export function TitleUploadPublic({ token, trainees }: { token: string; trainees: { id: string; name: string; files: number }[] }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(Object.fromEntries(trainees.map((t) => [t.id, t.files])));
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = trainees.filter((t) => fold(t.name).includes(fold(query.trim())));

  async function send(files: FileList | null) {
    if (!chosen || !files?.length) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      const res = await sendTitle(
        file,
        (n, m, s) => preparePublicTitleUpload(token, chosen.id, n, m, s),
        (p, n) => confirmPublicTitleUpload(token, chosen.id, p, n)
      );
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      setCounts((c) => ({ ...c, [chosen.id]: (c[chosen.id] || 0) + 1 }));
    }
    setBusy(false);
    setSent(true);
    if (camera.current) camera.current.value = '';
    if (picker.current) picker.current.value = '';
  }

  if (chosen) {
    const n = counts[chosen.id] || 0;
    return (
      <div className="sign-step">
        {sent ? (
          <div className="sign-done" role="status">
            <CheckCircle2 size={48} aria-hidden />
            <h2>Merci {chosen.name} !</h2>
            <p>Ton titre d’habilitation est bien envoyé{n > 1 ? ` (${n} fichiers)` : ''}.</p>
          </div>
        ) : (
          <>
            <p className="eyebrow">Étape 2</p>
            <h2>{chosen.name}</h2>
            <p className="hint">Prends ton titre d’habilitation en photo, bien à plat et lisible, ou dépose-le en PDF.{n ? ` Déjà ${n} fichier${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''}.` : ''}</p>
          </>
        )}
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => send(e.target.files)} />
        <input ref={picker} type="file" accept={TITLE_ACCEPT} multiple hidden onChange={(e) => send(e.target.files)} />
        {n < TITLE_MAX_FILES && (
          <div className="title-public-actions">
            <button type="button" className="primary" disabled={busy} onClick={() => camera.current?.click()}>
              {busy ? <Loader2 size={18} className="spin" aria-hidden /> : <Camera size={18} aria-hidden />} {sent ? 'Ajouter une photo (verso…)' : 'Prendre en photo'}
            </button>
            <button type="button" disabled={busy} onClick={() => picker.current?.click()}>
              <FileUp size={18} aria-hidden /> Choisir un fichier (photo ou PDF)
            </button>
          </div>
        )}
        <div className="sign-actions">
          <button type="button" onClick={() => { setChosen(null); setSent(false); setError(null); setQuery(''); }}>
            {sent ? 'Un autre stagiaire' : 'Ce n’est pas moi'}
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
        {list.map((t) => (
          <button key={t.id} type="button" className="sign-name" onClick={() => setChosen(t)}>
            <span>{t.name}</span>
            {(counts[t.id] || 0) > 0 && <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Envoyé</span>}
          </button>
        ))}
        {list.length === 0 && <p className="hint">Nom introuvable : préviens le formateur.</p>}
      </div>
    </div>
  );
}
