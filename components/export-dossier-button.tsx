'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

/** Demande au dossier de formation de la page d'exporter le dossier complet (un seul PDF). */
export function ExportDossierButton() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const done = () => setBusy(false);
    window.addEventListener('cf:export-dossier-done', done);
    return () => window.removeEventListener('cf:export-dossier-done', done);
  }, []);
  return (
    <button
      type="button"
      className="btn primary small"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        window.dispatchEvent(new CustomEvent('cf:export-dossier'));
        // Sans dossier sur la page : on ne reste pas bloqué.
        setTimeout(() => setBusy(false), 30000);
      }}
    >
      <Download size={14} aria-hidden /> {busy ? 'Préparation du PDF…' : 'Télécharger le dossier complet'}
    </button>
  );
}
