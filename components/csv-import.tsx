'use client';

import { useRef, useState, useTransition } from 'react';
import { importTraineesCsv, type CsvImportResult } from '@/app/sessions/[id]/actions';

export function CsvImportTrainees({ sessionId }: { sessionId: string }) {
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleImport(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const res = await importTraineesCsv(sessionId, formData);
      setResult(res);
      if (res.ok) formRef.current?.reset();
    });
  }

  return (
    <div className="panel">
      <h2>Importer des stagiaires (CSV)</h2>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '-8px 0 14px' }}>
        Colonnes attendues : <code>Nom</code> (requis), <code>Email</code>, <code>Entreprise</code>, <code>Statut</code>{' '}
        (facultatif : "validé" ou "en attente", défaut en attente). Un stagiaire déjà connu (par e-mail ou par nom) est
        réutilisé, sinon une nouvelle fiche est créée.
      </p>

      {result && !result.ok && <div role="alert" className="alert alert-error">{result.error}</div>}
      {result && result.ok && (
        <div role="status" className={`alert ${result.errors.length ? '' : 'alert-success'}`}>
          {result.added} stagiaire{result.added > 1 ? 's' : ''} importé{result.added > 1 ? 's' : ''}.
          {result.skipped > 0 && ` ${result.skipped} ligne(s) ignorée(s).`}
          {result.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form ref={formRef} action={handleImport} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? 'Import…' : 'Importer'}
        </button>
      </form>
    </div>
  );
}
