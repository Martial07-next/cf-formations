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

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      setResult(await syncDigiformaNow());
    });
  }

  return (
    <div className="panel">
      <h2>Relais Digiforma → planning</h2>
      <p className="panel-intro">
        Chaque matin, la plateforme récupère les sessions Digiforma <strong>enregistrées et pas encore passées</strong>{' '}
        et les place directement sur le planning, dans la colonne <strong>« À affecter »</strong>, avec le statut{' '}
        <span className="status-pill planifiee">En attente</span> et leurs stagiaires. Les sessions déjà terminées
        sont ignorées, et une session déjà importée n'est jamais écrasée. Il reste à leur choisir une vraie salle
        depuis leur fiche.
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
        {isPending ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </button>
    </div>
  );
}
