'use client';

import { useState, useTransition } from 'react';
import { saveDigiformaRef, importFromDigiforma } from '@/app/sessions/[id]/actions';

/**
 * Identifiant Digiforma de la session : information technique, repliée en bas
 * de la fiche. Session créée depuis Digiforma : identifiant en lecture seule
 * (il relie la session à son module, mis à jour automatiquement).
 */
export function DigiformaPanel({ sessionId, digiformaRef }: { sessionId: string; digiformaRef: string }) {
  const [ref, setRef] = useState(digiformaRef);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fromModule = digiformaRef.includes(':');

  function handleImport() {
    setMessage(null);
    startTransition(async () => {
      await saveDigiformaRef(sessionId, ref);
      const result = await importFromDigiforma(sessionId, ref);
      if (result.ok) {
        const heldMsg = result.heldBack > 0 ? ` (${result.heldBack} mis en attente pour cause de conflit de créneau)` : '';
        setMessage({ text: `${result.imported} stagiaire(s) importé(s) depuis Digiforma.${heldMsg}`, error: false });
      } else {
        setMessage({ text: result.error, error: true });
      }
    });
  }

  return (
    <details className="panel df-tech">
      <summary>
        <strong>Identifiant Digiforma</strong> <span className="hint">· technique, rien à modifier</span>
      </summary>
      {fromModule ? (
        <p className="hint" style={{ marginTop: 10 }}>
          Session créée depuis Digiforma (session n° {digiformaRef.split(':')[0]}) : ses stagiaires, clients particuliers compris, sont mis à jour
          automatiquement à chaque synchronisation. Rien à faire ici.
        </p>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 10 }}>
            Seulement pour une session créée à la main : l’identifiant de la session côté Digiforma permet de récupérer ses stagiaires (clients
            particuliers compris), puis de les tenir à jour automatiquement.
          </p>
          {message && <div role="status" className={`alert ${message.error ? 'alert-error' : 'alert-success'}`}>{message.text}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Id de session Digiforma" style={{ minWidth: 220, maxWidth: '100%' }} />
            <button type="button" className="small" onClick={handleImport} disabled={isPending || !ref.trim()}>
              {isPending ? 'Import…' : 'Importer les stagiaires depuis Digiforma'}
            </button>
          </div>
        </>
      )}
    </details>
  );
}
