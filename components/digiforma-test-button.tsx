'use client';

import { useState, useTransition } from 'react';
import { testDigiformaConnection } from '@/app/administration/parametres/actions';

export function DigiformaTestButton() {
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTest() {
    setResult(null);
    startTransition(async () => {
      const res = await testDigiformaConnection();
      if (res.ok) {
        setResult({ text: `Connexion réussie — ${res.typeCount} types détectés dans le schéma Digiforma.`, error: false });
      } else {
        setResult({ text: res.error, error: true });
      }
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={handleTest} disabled={isPending}>
        {isPending ? 'Test en cours…' : 'Tester la connexion Digiforma'}
      </button>
      {result && (
        <div role="status" className={`alert ${result.error ? 'alert-error' : 'alert-success'}`} style={{ marginTop: 10 }}>
          {result.text}
        </div>
      )}
    </div>
  );
}
