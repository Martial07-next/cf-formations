'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { updateRole, resetUserPassword, deleteUserAccess } from '@/app/administration/actions';
import { ROLE_LABELS, ROLE_OPTIONS, type Role } from '@/lib/roles';

type Row = { id: string; full_name: string; role: string; created_at: string; email?: string | null };

export function AdminUsersTable({ rows, currentUserId }: { rows: Row[]; currentUserId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Une erreur est survenue.');
      else if (success) setNotice(success);
    });
  }

  function handleReset(u: Row) {
    if (!confirm(`Générer un nouveau mot de passe pour ${u.full_name} ?`)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await resetUserPassword(u.id);
      if (res.ok) setNotice(`Nouveau mot de passe de ${u.full_name} : ${res.password} (à lui transmettre, il ne sera plus affiché).`);
      else setError(res.error);
    });
  }

  function handleDelete(u: Row) {
    if (!confirm(`Supprimer l’accès de ${u.full_name} ? Il ne pourra plus se connecter. Sa fiche formateur éventuelle est conservée.`)) return;
    run(() => deleteUserAccess(u.id), `Accès de ${u.full_name} supprimé.`);
  }

  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>E-mail</th>
              <th>Type d’accès</th>
              <th>Créé le</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const self = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td>{u.full_name} {self && <em className="hint">(vous)</em>}</td>
                  <td>{u.email || <span className="hint">-</span>}</td>
                  <td>
                    <select
                      className="input"
                      aria-label={`Type d’accès de ${u.full_name}`}
                      value={u.role}
                      onChange={(e) => run(() => updateRole(u.id, e.target.value as Role))}
                      disabled={isPending || self}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="row-actions">
                    {!self && (
                      <>
                        <button className="small" onClick={() => handleReset(u)} disabled={isPending} title="Générer un nouveau mot de passe">
                          <KeyRound size={14} aria-hidden /> Mot de passe
                        </button>
                        <button
                          className="danger small icon"
                          onClick={() => handleDelete(u)}
                          disabled={isPending}
                          aria-label={`Supprimer l’accès de ${u.full_name}`}
                          title="Supprimer l’accès"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
