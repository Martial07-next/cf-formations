'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { autoSyncDigiforma } from '@/app/digiforma/actions';

// Une seule demande par chargement de l'application (pas à chaque rendu).
let started = false;

/**
 * Ouverture ou actualisation du planning : synchronisation Digiforma en
 * arrière-plan (le serveur décide si c'est le moment), puis planning
 * rafraîchi seulement si quelque chose a changé. Rien ne bloque la page.
 */
export function DigiformaAutoSync({ showStatus }: { showStatus: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (started) return;
    started = true;
    // Laisse d'abord le planning s'afficher.
    let fired = false;
    const t = window.setTimeout(async () => {
      fired = true;
      setBusy(true);
      try {
        const r = await autoSyncDigiforma();
        if (r.changed) router.refresh();
      } catch {
        // réseau coupé, page quittée… : sans effet
      } finally {
        setBusy(false);
        started = false; // la prochaine actualisation pourra relancer
      }
    }, 1200);
    return () => {
      window.clearTimeout(t);
      if (!fired) started = false;
    };
  }, [router]);
  if (!showStatus || !busy) return null;
  return (
    <div className="df-autosync" role="status" aria-live="polite">
      <RefreshCw size={13} className="spin" aria-hidden /> Digiforma : synchronisation…
    </div>
  );
}
