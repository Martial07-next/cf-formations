'use client';

import { useState, useTransition } from 'react';
import { updateSettings } from '@/app/administration/parametres/actions';

type Settings = {
  company_name: string;
  company_address: string | null;
  default_session_duration_hours: number;
  notify_on_conflict: boolean;
};

export function SettingsForm({ settings }: { settings: Settings }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle(formData: FormData) {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await updateSettings(formData);
      if (result.ok) setNotice('Paramètres enregistrés.');
      else setError(result.error ?? 'Une erreur est survenue.');
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 520 }}>
      <h2>Informations générales</h2>
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <form action={handle}>
        <div className="form-row">
          <label>
            Nom de l'entreprise
            <input name="company_name" defaultValue={settings.company_name} required />
          </label>
        </div>
        <div className="form-row">
          <label>
            Adresse
            <input name="company_address" defaultValue={settings.company_address || ''} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Durée par défaut d'une session (heures)
            <input
              name="default_session_duration_hours"
              type="number"
              step="0.5"
              min={0}
              defaultValue={settings.default_session_duration_hours}
            />
          </label>
        </div>
        <div className="form-row">
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="notify_on_conflict" defaultChecked={settings.notify_on_conflict} style={{ width: 'auto' }} />
            Afficher une alerte lors d'un conflit de salle ou de formateur
          </label>
        </div>
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}
