'use client';

import { useRef, useState, useTransition } from 'react';
import { importTraineesCsvGlobal, importTraineesFromDigiforma, type ImportResult } from '@/app/stagiaires/actions';

function summarize(result: ImportResult): { text: string; error: boolean } {
  if (!result.ok) return { text: result.error, error: true };
  const parts = [];
  if (result.created) parts.push(`${result.created} créé(s)`);
  if (result.matched) parts.push(`${result.matched} déjà connu(s)`);
  if (result.skipped) parts.push(`${result.skipped} ignoré(s)`);
  return { text: parts.join(', ') || 'Rien à importer.', error: false };
}

export function QuickImportPanel() {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleCsv(formData: FormData) {
    setMessage(null);
    setErrors([]);
    startTransition(async () => {
      const result = await importTraineesCsvGlobal(formData);
      setMessage(summarize(result));
      if (result.ok) {
        setErrors(result.errors);
        formRef.current?.reset();
      }
    });
  }

  function handleDigiforma() {
    setMessage(null);
    setErrors([]);
    startTransition(async () => {
      const result = await importTraineesFromDigiforma();
      setMessage(summarize(result));
      if (result.ok) setErrors(result.errors);
    });
  }

  return (
    <div className="panel">
      <h2>Import rapide</h2>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '-8px 0 14px' }}>
        Ajoute des stagiaires à l'annuaire sans ressaisie. Un stagiaire déjà connu (par e-mail ou par nom) est
        réutilisé plutôt que dupliqué. L'inscription à une session précise se fait ensuite depuis la fiche de cette
        session.
      </p>

      {message && (
        <div role="status" className={`alert ${message.error ? 'alert-error' : 'alert-success'}`}>
          {message.text}
          {errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 8px' }}>Depuis un CSV</p>
          <form ref={formRef} action={handleCsv} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="file" name="file" accept=".csv,text/csv" required />
            <button type="submit" className="primary" disabled={isPending}>
              {isPending ? '…' : 'Importer'}
            </button>
          </form>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Colonnes : Prénom, Nom, Email, Entreprise.</p>
        </div>

        <div>
          <p style={{ fontSize: 12.5, fontWeight: 700, margin: '0 0 8px' }}>Depuis Digiforma</p>
          <button onClick={handleDigiforma} disabled={isPending}>
            {isPending ? '…' : 'Importer tous les stagiaires Digiforma'}
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
            Nécessite la clé API configurée (Administration → Intégrations).
          </p>
        </div>
      </div>
    </div>
  );
}
