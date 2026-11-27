'use client';

import { useTransition, useState } from 'react';
import { CheckCircle2, Ban, Undo2, Trash2, PackageCheck, UserX, History } from 'lucide-react';
import { markReturned, deleteAuthorization, revokeImage } from '@/app/autorisations/actions';
import { TRACE_ACTION_LABEL, TRACE_CHANNEL_LABEL, TRACE_ENTITY_LABEL, deviceOf, traceActor, type TraceRow } from '@/lib/trace';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { AUTH_KIND, AUTH_KINDS, currentAuth, frDateTime, type Authorization } from '@/lib/autorisations';
import { askConfirm, askText } from '@/lib/confirm-dialog';

/** Fiche stagiaire : ses autorisations signées (valables pour toutes ses formations). */
export function TraineeAutorisations({
  traineeName,
  auths,
  sessionTitles,
  canManage,
  cachet,
  history = null,
}: {
  /** Registre de traçabilité du stagiaire (migration 79) ; null sans la migration. */
  history?: TraceRow[] | null;
  traineeName: string;
  auths: Authorization[];
  sessionTitles: Record<string, string>;
  canManage: boolean;
  cachet: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error || 'Erreur');
    });
  const sorted = [...auths].sort((a, b) => b.signed_at.localeCompare(a.signed_at));

  return (
    <section className="panel" id="autorisations">
      <h2>Autorisations</h2>
      <p className="panel-intro">Signées une fois (QR code en formation) : le stagiaire n’a plus à les remplir sur ses formations suivantes.</p>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <div className="autor-status">
        {AUTH_KINDS.map((k) => {
          const cur = currentAuth(auths, k.kind);
          const revoked = Boolean(cur && (cur.data as any)?.revoked_at);
          const ok = Boolean(cur && cur.accepted && !revoked);
          return (
            <span key={k.kind} className={`autor-chip${cur ? (ok ? ' ok' : ' refus') : ''}`}>
              {cur ? (ok ? <CheckCircle2 size={14} aria-hidden /> : <Ban size={14} aria-hidden />) : null}
              {k.short} : {cur ? (revoked ? `accord retiré le ${frDateTime((cur.data as any).revoked_at)}` : cur.accepted ? `signé le ${frDateTime(cur.signed_at)}` : 'refusé') : 'non signé'}
            </span>
          );
        })}
      </div>
      {sorted.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead><tr><th>Document</th><th>Signé le</th><th>Détail</th><th></th></tr></thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id}>
                  <td><strong>{AUTH_KIND[a.kind].short}</strong>{a.session_id && sessionTitles[a.session_id] && <div className="hint">{sessionTitles[a.session_id]}</div>}</td>
                  <td>{frDateTime(a.signed_at)}{a.city ? ` · ${a.city}` : ''}</td>
                  <td>
                    {a.kind === 'image' && (a.accepted ? 'Autorise' : <span className="autor-refus"><Ban size={12} aria-hidden /> N’autorise pas</span>)}
                    {a.kind === 'image' && (a.data as any)?.revoked_at && (
                      <div className="autor-refus">
                        <UserX size={12} aria-hidden /> Accord retiré le {frDateTime((a.data as any).revoked_at)}
                        {(a.data as any).revoked_by ? ` (noté par ${(a.data as any).revoked_by})` : ''}
                        {(a.data as any).revoked_note ? ` · ${(a.data as any).revoked_note}` : ''}
                      </div>
                    )}
                    {a.kind === 'livret' && [a.data.memoformat && 'MémoFormat', a.data.livret_pv && 'Livret PV', a.data.autres].filter(Boolean).join(' · ')}
                    {AUTH_KIND[a.kind].returnable && a.returned_at && <div className="hint">Restitué le {frDateTime(a.returned_at)}</div>}
                  </td>
                  <td className="row-actions">
                    {canManage && <AuthPdfButton items={[{ auth: a, traineeName }]} cachet={cachet} fileName={`${AUTH_KIND[a.kind].short} - ${traineeName}.pdf`} />}
                    {canManage && AUTH_KIND[a.kind].returnable && (
                      <button type="button" className="small" disabled={isPending} onClick={() => run(() => markReturned(a.id, !a.returned_at))}>
                        {a.returned_at ? <><Undo2 size={14} aria-hidden /> Annuler</> : <><PackageCheck size={14} aria-hidden /> Restitué</>}
                      </button>
                    )}
                    {canManage && a.kind === 'image' && a.accepted && !(a.data as any)?.revoked_at && (
                      <button
                        type="button"
                        className="small"
                        disabled={isPending}
                        title="Le stagiaire ne veut plus que ses photos soient utilisées"
                        onClick={async () => {
                          const note = await askText(`Retirer l’accord de droit à l’image de ${traineeName} ?\n\nLa signature d’origine est gardée ; l’accord sera marqué « retiré » dans le registre.`, {
                            confirmLabel: 'Retirer l’accord',
                            danger: true,
                            input: { label: 'Motif / demande', placeholder: 'Ex. demande par mail du 12/11' },
                          });
                          if (note !== null) run(() => revokeImage(a.id, note));
                        }}
                      >
                        <UserX size={14} aria-hidden /> Retirer l’accord
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="small icon ghost"
                        aria-label="Supprimer"
                        title="Supprimer (sera redemandée à la prochaine formation)"
                        disabled={isPending}
                        onClick={async () => (await askConfirm('Supprimer cette autorisation ? Elle sera redemandée à la prochaine formation.')) && run(() => deleteAuthorization(a.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history && history.length > 0 && (
        <details className="trace-history" style={{ marginTop: 12 }}>
          <summary><History size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Historique (traçabilité) · {history.length} action{history.length > 1 ? 's' : ''}</summary>
          <ul className="trace-list">
            {history.map((h) => (
              <li key={h.id}>
                <span className="trace-when">{frDateTime(h.created_at)}</span>{' '}
                <strong>{TRACE_ENTITY_LABEL[h.entity] || h.entity}</strong> · {TRACE_ACTION_LABEL[h.action] || h.action}
                {h.detail ? ` · ${h.detail}` : ''}
                <span className="hint">
                  {' '}— {traceActor(h)}{h.channel ? ` ${TRACE_CHANNEL_LABEL[h.channel]}` : ''}
                  {deviceOf(h.user_agent) ? ` · ${deviceOf(h.user_agent)}` : ''}
                  {h.signature_hash ? ` · empreinte ${h.signature_hash.slice(0, 10)}…` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
