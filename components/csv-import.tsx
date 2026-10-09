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
      <h2>Importer des stagiaires (Excel ou CSV)</h2>
      <p className="panel-intro">
        Colonnes : <code>NOM</code>, <code>PRENOM</code>, <code>ENTREPRISE</code>, <code>EMAIL</code> (et{' '}
        <code>STATUT</code> facultatif : « validé » ou « en attente », défaut en attente). Les doublons du fichier sont
        retirés, un stagiaire déjà connu n’est jamais recréé et un stagiaire déjà inscrit à la session n’est pas modifié :
        tu peux réimporter un fichier mis à jour sans risque.
      </p>

      {result && !result.ok && <div role="alert" className="alert alert-error">{result.error}</div>}
      {result && result.ok && (
        <div role="status" className={`alert ${result.errors.length ? '' : 'alert-success'}`}>
          {result.added} stagiaire{result.added > 1 ? 's' : ''} inscrit{result.added > 1 ? 's' : ''}.
          {(result.already ?? 0) > 0 && ` ${result.already} déjà inscrit(s), inchangé(s).`}
          {(result.duplicates ?? 0) > 0 && ` ${result.duplicates} doublon(s) retiré(s) du fichier.`}
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
        <input type="file" name="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? 'Import…' : 'Importer'}
        </button>
      </form>
    </div>
  );
}
