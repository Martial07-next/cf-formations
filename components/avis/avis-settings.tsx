'use client';

import { useState, useTransition } from 'react';
import { Loader2, MonitorPlay, Plus, Star, Trash2 } from 'lucide-react';
import { saveAvis } from '@/app/administration/parametres/actions';
import { AvisPresentation } from '@/components/avis/avis-presentation';
import type { AvisData, Review, ReviewSource } from '@/lib/avis';

/** Une source d'avis (note, nombre, 5 derniers avis) modifiable. */
function SourceEditor({ label, value, onChange, hint }: { label: string; value: ReviewSource; onChange: (v: ReviewSource) => void; hint: string }) {
  const setReview = (k: number, patch: Partial<Review>) => onChange({ ...value, reviews: value.reviews.map((r, i) => (i === k ? { ...r, ...patch } : r)) });
  return (
    <fieldset className="avis-src">
      <legend>{label}</legend>
      <p className="hint" style={{ marginTop: 0 }}>{hint}</p>
      <div className="avis-src-head">
        <label>Note moyenne (/5)<input className="input" type="number" step="0.1" min={0} max={5} value={value.note ?? ''} onChange={(e) => onChange({ ...value, note: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Nombre d’avis<input className="input" type="number" min={0} value={value.count ?? ''} onChange={(e) => onChange({ ...value, count: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      </div>
      {value.reviews.map((r, k) => (
        <div key={k} className="avis-row">
          <div className="avis-row-head">
            <input className="input" placeholder="Formation ou auteur" value={r.title} onChange={(e) => setReview(k, { title: e.target.value })} />
            <input className="input" placeholder="Date (JJ/MM/AAAA)" value={r.date || ''} onChange={(e) => setReview(k, { date: e.target.value })} style={{ maxWidth: 150 }} />
            <select className="input" value={r.rating} onChange={(e) => setReview(k, { rating: Number(e.target.value) })} aria-label="Note" style={{ maxWidth: 90 }}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
            <button type="button" className="icon ghost" aria-label="Retirer cet avis" onClick={() => onChange({ ...value, reviews: value.reviews.filter((_, i) => i !== k) })}><Trash2 size={15} /></button>
          </div>
          <textarea className="input" rows={2} placeholder="Texte de l’avis (copié tel quel)" value={r.text} onChange={(e) => setReview(k, { text: e.target.value })} />
        </div>
      ))}
      {value.reviews.length < 5 && (
        <button type="button" className="small" onClick={() => onChange({ ...value, reviews: [{ title: '', text: '', rating: 5, date: '' }, ...value.reviews] })}>
          <Plus size={13} aria-hidden /> Ajouter un avis (le plus récent en haut)
        </button>
      )}
    </fieldset>
  );
}

/**
 * Administration › Paramètres : avis clients montrés dans la présentation
 * « Votre avis compte ! » de chaque session. Google : à copier depuis la fiche
 * Google (pas de lecture automatique gratuite). Plus que pro : lu sur
 * cf-reseaux.fr quand c'est possible, sinon ces avis-ci.
 */
export function AvisSettings({ initial }: { initial: AvisData }) {
  const [avis, setAvis] = useState<AvisData>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  return (
    <section className="panel" id="avis">
      <div className="panel-head">
        <h2><Star size={17} aria-hidden /> Avis clients (présentation aux stagiaires)</h2>
        <button type="button" className="small" onClick={() => setPreview(true)}><MonitorPlay size={14} aria-hidden /> Voir la présentation</button>
      </div>
      <p className="panel-intro">
        Montrés dans la présentation « Votre avis compte ! » du dossier de chaque session. Les avis <b>Plus que pro</b> sont repris automatiquement de cf-reseaux.fr quand la page le permet ; sinon, ceux d’ici. Les avis <b>Google</b> se copient ici depuis la fiche Google de CF Réseaux (5 derniers).
      </p>
      <SourceEditor label="Google (avis à chaud)" hint="Note, nombre d’avis et 5 derniers avis visibles sur la fiche Google de CF Réseaux." value={avis.google} onChange={(google) => setAvis((a) => ({ ...a, google }))} />
      <SourceEditor label="Plus que pro (avis à froid)" hint="Valeurs de l’attestation Plus que pro (secours si cf-reseaux.fr n’est pas lisible)." value={avis.pqp} onChange={(pqp) => setAvis((a) => ({ ...a, pqp: { ...a.pqp, ...pqp } }))} />
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const clean = (s: ReviewSource) => ({ ...s, reviews: s.reviews.filter((r) => r.text.trim()) });
              const r = await saveAvis({ ...avis, google: clean(avis.google), pqp: { ...avis.pqp, ...clean(avis.pqp) } });
              setMsg(r.ok ? { ok: true, text: 'Avis enregistrés.' } : { ok: false, text: r.error });
            })
          }
        >
          {pending ? <Loader2 size={14} className="spin" aria-hidden /> : null} Enregistrer les avis
        </button>
        {msg && <span role="status" className={msg.ok ? 'hint' : 'field-error'}>{msg.text}</span>}
      </div>
      {preview && <AvisPresentation avis={avis} onClose={() => setPreview(false)} />}
    </section>
  );
}
