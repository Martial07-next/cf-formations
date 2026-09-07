'use client';

import { useState, useTransition } from 'react';
import { updateSessionStatus, deleteSession } from '@/app/sessions/actions';

type Row = {
  id: string;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  rooms: { name: string } | { name: string }[] | null;
  trainers: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SessionsTable({ isAdmin, rows }: { isAdmin: boolean; rows: Row[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateSessionStatus(id, status);
      if (!result.ok) setError(result.error ?? 'Une erreur est survenue.');
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSession(id);
      if (!result.ok) setError(result.error ?? 'Une erreur est survenue.');
    });
  }

  if (rows.length === 0) return <p className="empty">Aucune session sur cette période.</p>;

  return (
    <>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      <table className="data">
        <thead>
          <tr>
            <th>Titre</th>
            <th>Salle</th>
            <th>Formateur</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Statut</th>
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.title}</td>
              <td>{one(s.rooms)?.name || '—'}</td>
              <td>{one(s.trainers)?.full_name || '—'}</td>
              <td>{fmt(s.start_at)}</td>
              <td>{fmt(s.end_at)}</td>
              <td>
                {isAdmin ? (
                  <select value={s.status} onChange={(e) => handleStatus(s.id, e.target.value)} disabled={isPending}>
                    <option value="brouillon">Brouillon</option>
                    <option value="planifiee">Planifiée</option>
                    <option value="confirmee">Confirmée</option>
                  </select>
                ) : (
                  <span className={`badge ${s.status}`}>{s.status}</span>
                )}
              </td>
              {isAdmin && (
                <td className="row-actions">
                  <button className="danger" onClick={() => handleDelete(s.id)} disabled={isPending}>
                    Supprimer
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
