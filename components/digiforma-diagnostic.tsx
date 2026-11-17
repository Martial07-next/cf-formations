'use client';

import { useState, useTransition } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';
import { digiformaDiagnostic } from '@/app/digiforma/actions';

/** « Diagnostic Digiforma » : affiche ce que Digiforma renvoie pour la session (à envoyer en capture). */
export function DigiformaDiagnostic({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="df-diag">
      <button
        type="button"
        className="small ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await digiformaDiagnostic(sessionId);
            if (!r.ok) return setError(r.error);
            setText(r.text);
          })
        }
        title="Voir ce que Digiforma renvoie pour cette session"
      >
        {pending ? <Loader2 size={14} className="spin" aria-hidden /> : <Stethoscope size={14} aria-hidden />} Diagnostic Digiforma
      </button>
      {error && <small role="status" className="field-error">{error}</small>}
      {text && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.35, maxHeight: 520, overflow: 'auto', background: 'var(--surface-2, #f5f5f7)', padding: 10, borderRadius: 8, marginTop: 8 }}>
          {text}
        </pre>
      )}
    </div>
  );
}
