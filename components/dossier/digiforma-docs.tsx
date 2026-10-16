'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, Link2, Pencil } from 'lucide-react';
import { setDigiformaDocsUrl } from '@/app/sessions/[id]/actions';
import { setDigiformaDone } from '@/app/dossier/actions';

/**
 * Bouton « Autres documents sur Digiforma » du dossier de formation : le
 * bureau colle le lien de la session dans Digiforma, le formateur y va en un clic.
 */
export function DigiformaDocs({
  sessionId,
  url,
  done,
  canEdit,
  canFill,
  onDone,
}: {
  sessionId: string;
  url: string | null;
  done: boolean;
  canEdit: boolean;
  canFill: boolean;
  onDone: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url || '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  if (!url && !canEdit) return null;

  const save = () =>
    startTransition(async () => {
      const r = await setDigiformaDocsUrl(sessionId, value);
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setEditing(false);
      }
    });

  return (
    <div className="digiforma-docs">
      {url && !editing ? (
        <>
          <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden /> Autres documents à remplir sur Digiforma
          </a>
          <label className={`check-line${done ? ' done' : ''}`}>
            <input
              type="checkbox"
              checked={done}
              disabled={!canFill || isPending}
              onChange={(e) => {
                const v = e.target.checked;
                onDone(v);
                startTransition(async () => {
                  const r = await setDigiformaDone(sessionId, v);
                  if (!r.ok) {
                    setError(r.error);
                    onDone(!v);
                  }
                });
              }}
            />
            {done ? 'Fait sur Digiforma' : 'C’est fait sur Digiforma'}
          </label>
          {canEdit && (
            <button type="button" className="small ghost" onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden /> Modifier le lien
            </button>
          )}
        </>
      ) : !editing ? (
        <>
          <span className="hint">
            <Link2 size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Pas encore de lien Digiforma : ajoute-le pour que le formateur trouve les autres documents à remplir.
          </span>
          <button type="button" className="small" onClick={() => setEditing(true)}>Ajouter le lien Digiforma</button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            type="url"
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://app.digiforma.com/… (lien de la session)"
            aria-label="Lien Digiforma de la session"
            autoFocus
          />
          <button type="submit" className="small primary" disabled={isPending}>{isPending ? '…' : 'Enregistrer'}</button>
          <button type="button" className="small ghost" onClick={() => { setEditing(false); setValue(url || ''); setError(null); }}>Annuler</button>
        </form>
      )}
      {error && <span role="alert" className="field-error">{error}</span>}
    </div>
  );
}
