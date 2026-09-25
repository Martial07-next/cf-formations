'use client';

import { useState, useTransition } from 'react';
import { updateRole } from '@/app/administration/actions';
import { ROLE_LABELS, type Role } from '@/lib/roles';

type Row = { id: string; full_name: string; role: string; created_at: string };

const ROLE_OPTIONS: Role[] = ['admin', 'responsable_formation', 'formateur', 'consultation'];

export function AdminUsersTable({ rows, currentUserId }: { rows: Row[]; currentUserId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(id: string, role: string) {
    startTransition(async () => {
      const result = await updateRole(id, role as Role);
      if (!result.ok) setError(result.error ?? 'Une erreur est survenue.');
    });
  }

  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <table className="data">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Rôle</th>
            <th>Inscrit le</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name} {u.id === currentUserId && <em>(vous)</em>}</td>
              <td>
                <select
                  value={u.role}
                  onChange={(e) => handleChange(u.id, e.target.value)}
                  disabled={isPending || u.id === currentUserId}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </td>
              <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
