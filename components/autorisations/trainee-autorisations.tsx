'use client';

import { useTransition, useState } from 'react';
import { CheckCircle2, Ban, Undo2, Trash2, PackageCheck } from 'lucide-react';
import { markReturned, deleteAuthorization } from '@/app/autorisations/actions';
import { AuthPdfButton } from '@/components/autorisations/session-autorisations';
import { AUTH_KIND, AUTH_KINDS, currentAuth, frDateTime, type Authorization } from '@/lib/autorisations';

/** Fiche stagiaire : ses autorisations signées (valables pour toutes ses formations). */
export function TraineeAutorisations({
  traineeName,
  auths,
  sessionTitles,
  canManage,
  cachet,
}: {
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
          return (
            <span key={k.kind} className={`autor-chip${cur ? (cur.accepted ? ' ok' : ' refus') : ''}`}>
              {cur ? (cur.accepted ? <CheckCircle2 size={14} aria-hidden /> : <Ban size={14} aria-hidden />) : null}
              {k.short} : {cur ? (cur.accepted ? `signé le ${frDateTime(cur.signed_at)}` : 'refusé') : 'non signé'}
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
                    {canManage && (
                      <button
                        type="button"
                        className="small icon ghost"
                        aria-label="Supprimer"
                        title="Supprimer (sera redemandée à la prochaine formation)"
                        disabled={isPending}
                        onClick={() => confirm('Supprimer cette autorisation ? Elle sera redemandée à la prochaine formation.') && run(() => deleteAuthorization(a.id))}
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
    </section>
  );
}
