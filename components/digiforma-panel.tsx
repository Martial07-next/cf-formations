'use client';

import { useState, useTransition } from 'react';
import { saveDigiformaRef, importFromDigiforma } from '@/app/sessions/[id]/actions';

export function DigiformaPanel({ sessionId, digiformaRef }: { sessionId: string; digiformaRef: string }) {
  const [ref, setRef] = useState(digiformaRef);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleImport() {
    setMessage(null);
    startTransition(async () => {
      await saveDigiformaRef(sessionId, ref);
      const result = await importFromDigiforma(sessionId, ref);
      if (result.ok) {
        setMessage({ text: `${result.imported} stagiaire(s) importé(s) depuis Digiforma et validé(s).`, error: false });
      } else {
        setMessage({ text: result.error, error: true });
      }
    });
  }

  return (
    <div className="panel">
      <h2>Digiforma</h2>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '-8px 0 14px' }}>
        Colle l'identifiant (ou la référence) de la session correspondante côté Digiforma, puis récupère directement
        ses stagiaires inscrits — sans ressaisie. Nécessite qu'un administrateur ait configuré la clé API Digiforma
        côté serveur.
      </p>
      {message && (
        <div role="status" className={`alert ${message.error ? 'alert-error' : 'alert-success'}`}>{message.text}</div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Id ou référence de session Digiforma"
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, minWidth: 260, fontSize: 14 }}
        />
        <button className="primary" onClick={handleImport} disabled={isPending}>
          {isPending ? 'Import…' : 'Importer les stagiaires depuis Digiforma'}
        </button>
      </div>
    </div>
  );
}
