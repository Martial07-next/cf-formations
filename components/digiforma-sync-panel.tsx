'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { syncDigiformaNow } from '@/app/administration/integrations/sync-actions';
import type { SyncResult } from '@/lib/digiforma-sync';

export function DigiformaSyncPanel({
  lastSync,
}: {
  lastSync: { at: string | null; status: string | null; log: string | null };
}) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const [progress, setProgress] = useState<string | null>(null);
  function handleSync() {
    setResult(null);
    startTransition(async () => {
      try {
        // Plusieurs lots si besoin (chaque lot ≈ 40 s) : jusqu'à ce que toutes les sessions soient relues.
        let last: SyncResult | null = null;
        for (let lot = 1; lot <= 8; lot++) {
          setProgress(lot > 1 ? `Lot ${lot}…` : null);
          last = await syncDigiformaNow();
          if (!last.ok || !('remaining' in last) || !last.remaining) break;
        }
        setResult(last);
      } catch {
        setResult({ ok: false, error: 'La synchronisation n’a pas pu aller au bout (délai dépassé). Relance-la : ce qui est déjà importé est conservé.' });
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <div className="panel">
      <h2>Relais Digiforma → planning</h2>
      <p className="panel-intro">
        Chaque matin, la plateforme relit les sessions <strong>planifiées</strong> sur Digiforma et enregistre
        leurs <strong>modules à venir</strong> (dates et stagiaires à jour). Sous le planning, la section
        « Modules Digiforma à placer » montre ceux de la semaine affichée : « Placer » crée la session, puis on
        choisit la salle et le formateur. Les nouveaux stagiaires inscrits sur Digiforma sont ajoutés aux modules
        déjà placés ; un stagiaire parti n'est plus proposé pour les modules suivants.
      </p>

      <div className="counters" style={{ margin: '14px 0' }}>
        <div className="counter-chip" style={{ minWidth: 160 }}>
          <strong style={{ fontSize: 14 }}>
            {lastSync.status === 'ok' ? 'OK' : lastSync.status === 'error' ? 'Erreur' : '-'}
          </strong>
          <span>Dernier statut</span>
        </div>
        <div className="counter-chip" style={{ minWidth: 200 }}>
          <strong style={{ fontSize: 14 }}>
            {lastSync.at ? new Date(lastSync.at).toLocaleString('fr-FR') : 'Jamais'}
          </strong>
          <span>Dernière synchronisation</span>
        </div>
      </div>

      {lastSync.log && <p className="log-box">{lastSync.log}</p>}

      {result && (
        <div role="status" className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`}>
          {result.ok ? result.log : result.error}
        </div>
      )}

      <button className="primary" onClick={handleSync} disabled={isPending}>
        <RefreshCw size={15} className={isPending ? 'spin' : ''} />
        {isPending ? `Synchronisation${progress ? ` · ${progress}` : '…'}` : 'Synchroniser maintenant'}
      </button>
    </div>
  );
}
