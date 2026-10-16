'use client';

import Link from 'next/link';
import { AlertTriangle, BellRing } from 'lucide-react';
import { ALERT_DAYS, inDays, type SessionAlert } from '@/lib/session-alerts';

/** Bandeau de relance (équipe) : sessions à moins d'une semaine qui ne sont pas prêtes. */
export function SessionAlerts({ alerts, todayIso }: { alerts: SessionAlert[]; todayIso: string }) {
  if (!alerts.length) return null;
  const urgent = alerts.filter((a) => a.urgent).length;
  return (
    <details className={`session-alerts${urgent ? ' urgent' : ''}`} open>
      <summary>
        <BellRing size={16} aria-hidden />
        <strong>
          {alerts.length} session{alerts.length > 1 ? 's' : ''} à relancer
        </strong>
        <span className="hint">
          commencent dans moins de {ALERT_DAYS} jours{urgent ? ` · ${urgent} urgente${urgent > 1 ? 's' : ''}` : ''}
        </span>
      </summary>
      <ul>
        {alerts.map((a) => (
          <li key={a.id} className={a.urgent ? 'urgent' : ''}>
            {a.urgent && <AlertTriangle size={14} aria-label="Urgent" />}
            <Link href={`/sessions/${a.id}`}>
              <strong>{a.title}</strong>
            </Link>
            <span className="hint">
              {new Date(a.startAt.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · {inDays(a.startAt, todayIso)}
              {a.manager ? ` · gérée par ${a.manager}` : ''}
            </span>
            <span className="alert-reasons">
              {a.reasons.map((r) => (
                <span key={r} className="alert-reason">{r}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
