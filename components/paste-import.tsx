'use client';

import { useRef, useState, useTransition } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { importTraineesFromText, type PasteImportResult } from '@/app/stagiaires/actions';
import { parseNameList, type NameOrder } from '@/lib/name-list';

/**
 * Import le plus simple : copier les colonnes Nom et Prénom dans Excel et les
 * coller ici. Aucune entreprise ni e-mail nécessaire, aucune API externe.
 */
export function PasteImport({ sessionId }: { sessionId?: string }) {
  const [text, setText] = useState('');
  const [order, setOrder] = useState<NameOrder>('nom_prenom');
  const [result, setResult] = useState<PasteImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const preview = text.trim() ? parseNameList(text, order) : [];

  function handle(fd: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await importTraineesFromText(fd);
      setResult(res);
      if (res.ok) setText('');
    });
  }

  return (
    <div className="panel">
      <h2><ClipboardPaste size={18} aria-hidden /> Coller une liste de stagiaires</h2>
      <p className="panel-intro">
        Dans Excel, sélectionne les colonnes <strong>Nom</strong> et <strong>Prénom</strong>, copie (Ctrl+C) puis colle
        ici (Ctrl+V). Une personne par ligne ; l’entreprise et l’e-mail ne sont pas nécessaires. Un stagiaire déjà
        connu n’est pas créé en double.
      </p>

      {result && !result.ok && <div role="alert" className="alert alert-error">{result.error}</div>}
      {result?.ok && (
        <div role="status" className={`alert ${result.errors.length ? 'alert-warning' : 'alert-success'}`} style={{ flexDirection: 'column' }}>
          <span>
            {result.created} créé{result.created > 1 ? 's' : ''}, {result.matched} déjà connu{result.matched > 1 ? 's' : ''}
            {sessionId && `, ${result.enrolled} inscrit${result.enrolled > 1 ? 's' : ''} à la session`}.
          </span>
          {result.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.errors.map((e, i) => <li key={i} style={{ fontSize: 12.5 }}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <form ref={formRef} action={handle}>
        {sessionId && <input type="hidden" name="session_id" value={sessionId} />}
        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
          <label>
            Liste
            <textarea
              name="list"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'DUPONT\tJean\nMARTIN\tSophie\nBERNARD Lucas'}
              spellCheck={false}
            />
          </label>
        </div>
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <span className="hint">Ordre des colonnes :</span>
          <label className="radio-inline">
            <input type="radio" name="order" value="nom_prenom" checked={order === 'nom_prenom'} onChange={() => setOrder('nom_prenom')} /> Nom puis Prénom
          </label>
          <label className="radio-inline">
            <input type="radio" name="order" value="prenom_nom" checked={order === 'prenom_nom'} onChange={() => setOrder('prenom_nom')} /> Prénom puis Nom
          </label>
          {sessionId && (
            <select name="enroll_status" className="input" defaultValue="validee" aria-label="Statut d’inscription">
              <option value="validee">Inscrire en « validé »</option>
              <option value="en_attente">Inscrire en « en attente »</option>
            </select>
          )}
        </div>

        {preview.length > 0 && (
          <p className="hint" style={{ marginBottom: 12 }}>
            Aperçu ({preview.length}) :{' '}
            {preview.slice(0, 4).map((p, i) => (
              <span key={i}>
                <strong>{p.name.last_name}</strong> {p.name.first_name || ''}
                {i < Math.min(preview.length, 4) - 1 ? ' · ' : ''}
              </span>
            ))}
            {preview.length > 4 && ' …'} — vérifie que le nom (en gras) est au bon endroit.
          </p>
        )}

        <button type="submit" className="primary" disabled={isPending || preview.length === 0}>
          {isPending ? 'Import…' : `Ajouter ${preview.length || ''} stagiaire${preview.length > 1 ? 's' : ''}`}
        </button>
      </form>
    </div>
  );
}
