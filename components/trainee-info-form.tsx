'use client';

import { useState, useTransition } from 'react';
import { updateTrainee } from '@/app/stagiaires/actions';

export function TraineeInfoForm({
  isAdmin,
  traineeId,
  fullName,
  email,
  company,
}: {
  isAdmin: boolean;
  traineeId: string;
  fullName: string;
  email: string | null;
  company: string | null;
}) {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle(formData: FormData) {
    setNotice(null);
    startTransition(async () => {
      const result = await updateTrainee(traineeId, formData);
      setNotice(result.ok ? { text: 'Enregistré.', error: false } : { text: result.error ?? 'Erreur.', error: true });
    });
  }

  return (
    <div className="panel">
      <h2>Informations</h2>
      {notice && <div role="status" className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`}>{notice.text}</div>}
      <fieldset disabled={!isAdmin} style={{ border: 'none', padding: 0, margin: 0 }}>
        <form action={handle}>
          <div className="form-row">
            <label>
              Nom complet
              <input name="full_name" defaultValue={fullName} required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" defaultValue={email || ''} />
            </label>
            <label>
              Entreprise
              <input name="company" defaultValue={company || ''} />
            </label>
          </div>
          {isAdmin && (
            <button type="submit" className="primary" disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </form>
      </fieldset>
    </div>
  );
}
