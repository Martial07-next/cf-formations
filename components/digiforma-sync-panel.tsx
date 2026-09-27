'use client';

import { useState, useTransition } from 'react';
import { runDigiformaSync, type SyncResult } from '@/app/administration/integrations/sync-actions';

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
      const res = await runDigiformaSync();
      setResult(res);
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 680 }}>
      <h2>Synchronisation automatique</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        Une fois par jour (limite du plan Vercel gratuit), la plateforme récupère les nouvelles sessions Digiforma et
        les crée dans le planning, dans la salle <strong>« À affecter »</strong>, avec leurs stagiaires. Un
        administrateur réaffecte ensuite la vraie salle depuis la fiche de chaque session importée.
      </p>

      <div className="counters" style={{ margin: '14px 0' }}>
        <div className="counter-chip" style={{ minWidth: 160 }}>
          <strong style={{ fontSize: 14 }}>
            {lastSync.status === 'ok' ? '✅ OK' : lastSync.status === 'error' ? '⚠ Erreur' : '—'}
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

      {lastSync.log && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', background: '#f5faf5', padding: '10px 12px', borderRadius: 10 }}>
          {lastSync.log}
        </p>
      )}

      {result && (
        <div role="status" className={`alert ${result.ok ? 'alert-success' : 'alert-error'}`}>
          {result.ok ? result.log : result.error}
        </div>
      )}

      <button className="primary" onClick={handleSync} disabled={isPending}>
        {isPending ? 'Synchronisation…' : 'Synchroniser maintenant'}
      </button>
    </div>
  );
}
