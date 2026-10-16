'use client';

import { submitWith } from '@/lib/form-submit';
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
  signataire?: string | null;
  agrement?: string | null;
  cachet_image?: string | null;
  director_name?: string | null;
  director_title?: string | null;
};

/** Image du cachet + signature, réduite (700 px max) pour le stockage. */
async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const scale = Math.min(1, 700 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cachet, setCachet] = useState<string>(settings.cachet_image || '');

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
      <form onSubmit={submitWith(handle)}>
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
        <h3 className="sub-heading">Conventions de stage POEC</h3>
        <div className="form-row">
          <label>
            Représenté par
            <input name="director_name" defaultValue={settings.director_name || 'Madame Aurélie Lancelle'} />
          </label>
          <label>
            Fonction
            <input name="director_title" defaultValue={settings.director_title || 'Directrice de CF Réseaux'} />
          </label>
        </div>
        <h3 className="sub-heading">Attestation de fin de formation et appréciation des compétences</h3>
        <div className="form-row">
          <label>
            Signataire (« Par … »)
            <input name="signataire" defaultValue={settings.signataire || 'GRÉBERT MATTHIEU'} />
          </label>
        </div>
        <div className="form-row">
          <label>
            N° d’agrément (pied de page)
            <input name="agrement" defaultValue={settings.agrement || 'CTST-2026-27/1/P'} />
          </label>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          Cachet et signature
          <span className="hint">Une image (PNG ou JPG) avec le cachet et la signature, placée sous « SIGNATURE ET CACHET ». Idéalement sur fond transparent ou blanc.</span>
          <input type="hidden" name="cachet_image" value={cachet} />
          {cachet ? (
            <div className="cachet-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cachet} alt="Cachet et signature" />
              <button type="button" className="small danger" onClick={() => setCachet('')}>Retirer</button>
            </div>
          ) : (
            <span className="hint">Aucune image : la zone « Signature et cachet » restera vide.</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Image du cachet et de la signature"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 8 * 1024 * 1024) return setError('Image trop lourde (8 Mo maximum).');
              setCachet(await toDataUrl(f));
            }}
          />
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
