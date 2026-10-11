'use client';

import { useState, useTransition } from 'react';
import { updateSettings } from '@/app/administration/parametres/actions';

type Settings = {
  company_name: string;
  company_address: string | null;
  default_session_duration_hours: number;
  notify_on_conflict: boolean;
  siret?: string | null;
  nda?: string | null;
  signature_city?: string | null;
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
        <h3 className="sub-heading">Mentions des documents (feuille d’émargement)</h3>
        <div className="form-row">
          <label>
            N° SIRET
            <input name="siret" defaultValue={settings.siret || ''} placeholder="Ex. 123 456 789 00012" inputMode="numeric" />
          </label>
        </div>
        <div className="form-row">
          <label>
            N° de déclaration d’activité
            <input name="nda" defaultValue={settings.nda || ''} placeholder="Ex. 32 59 12345 59" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Ville du « Fait à »
            <input name="signature_city" defaultValue={settings.signature_city || 'Cuincy'} />
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
