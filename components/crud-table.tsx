'use client';

import { useState, useTransition } from 'react';

type Field = { name: string; label: string; type?: string; step?: string; required?: boolean };
type Column = { key: string; label: string; render?: (row: any) => React.ReactNode };
type ActionResult = { ok: boolean; error?: string };

export function CrudTable({
  isAdmin,
  title,
  columns,
  fields,
  rows,
  onCreate,
  onDelete,
  emptyLabel,
}: {
  isAdmin: boolean;
  title: string;
  columns: Column[];
  fields: Field[];
  rows: Record<string, any>[];
  onCreate: (fd: FormData) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  emptyLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await onCreate(formData);
      if (!result.ok) setError(result.error || 'Une erreur est survenue.');
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await onDelete(id);
      if (!result.ok) setError(result.error || 'Suppression impossible.');
    });
  }

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <h2>Ajouter — {title}</h2>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <form action={handleCreate}>
            <div className="form-row">
              {fields.map((f) => (
                <label key={f.name}>
                  {f.label}
                  <input name={f.name} type={f.type || 'text'} step={f.step} required={f.required} />
                </label>
              ))}
            </div>
            <button type="submit" disabled={isPending}>{isPending ? 'Ajout…' : 'Ajouter'}</button>
          </form>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">{emptyLabel}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                ))}
                {isAdmin && (
                  <td className="row-actions">
                    <button className="danger" onClick={() => handleDelete(row.id)} disabled={isPending}>
                      Supprimer
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
