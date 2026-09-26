'use client';

import { useState, useTransition } from 'react';

type Field = {
  name: string;
  label: string;
  type?: string;
  step?: string;
  required?: boolean;
  options?: { value: string; label: string }[]; // pour type "select"
};
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
  onUpdate,
  emptyLabel,
  statusField,
}: {
  isAdmin: boolean;
  title: string;
  columns: Column[];
  fields: Field[];
  rows: Record<string, any>[];
  onCreate: (fd: FormData) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  /** Si fourni, chaque ligne devient modifiable via un bouton "Modifier" (édition en ligne). */
  onUpdate?: (id: string, fd: FormData) => Promise<ActionResult>;
  emptyLabel: string;
  /** Colonne "statut" modifiable directement en liste, sans passer par le mode édition. */
  statusField?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    onChange: (id: string, value: string) => Promise<ActionResult>;
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function handleStatusChange(id: string, value: string) {
    if (!statusField) return;
    startTransition(async () => {
      const result = await statusField.onChange(id, value);
      if (!result.ok) setError(result.error || 'Modification impossible.');
    });
  }

  function handleUpdate(id: string, formData: FormData) {
    if (!onUpdate) return;
    setError(null);
    startTransition(async () => {
      const result = await onUpdate(id, formData);
      if (!result.ok) setError(result.error || 'Modification impossible.');
      else setEditingId(null);
    });
  }

  const editableFields = fields.filter((f) => columns.some((c) => c.key === f.name));

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <h2>Ajouter — {title}</h2>
          {error && <div role="alert" className="alert alert-error">{error}</div>}
          <form action={handleCreate}>
            <div className="form-row">
              {fields.map((f) =>
                f.type === 'select' ? (
                  <label key={f.name}>
                    {f.label}
                    <select name={f.name} required={f.required} defaultValue={f.options?.[0]?.value}>
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={f.name}>
                    {f.label}
                    <input name={f.name} type={f.type || 'text'} step={f.step} required={f.required} />
                  </label>
                )
              )}
            </div>
            <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Ajout…' : 'Ajouter'}</button>
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
              {statusField && <th>{statusField.label}</th>}
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id}>
                  {isEditing ? (
                    <td colSpan={columns.length} style={{ padding: 10 }}>
                      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
                      <form
                        action={(fd) => handleUpdate(row.id, fd)}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}
                      >
                        {editableFields.map((f) =>
                          f.type === 'select' ? (
                            <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                              {f.label}
                              <select name={f.name} defaultValue={row[f.name] ?? f.options?.[0]?.value}>
                                {(f.options || []).map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                              {f.label}
                              <input name={f.name} type={f.type || 'text'} step={f.step} defaultValue={row[f.name] ?? ''} required={f.required} />
                            </label>
                          )
                        )}
                        <div className="row-actions">
                          <button type="submit" className="primary" disabled={isPending}>{isPending ? '…' : 'Enregistrer'}</button>
                          <button type="button" onClick={() => setEditingId(null)} disabled={isPending}>Annuler</button>
                        </div>
                      </form>
                    </td>
                  ) : (
                    <>
                      {columns.map((c) => (
                        <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                      ))}
                    </>
                  )}

                  {!isEditing && statusField && (
                    <td>
                      {isAdmin ? (
                        <select
                          value={row[statusField.key]}
                          onChange={(e) => handleStatusChange(row.id, e.target.value)}
                          disabled={isPending}
                        >
                          {statusField.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`badge ${row[statusField.key]}`}>
                          {statusField.options.find((o) => o.value === row[statusField.key])?.label || row[statusField.key]}
                        </span>
                      )}
                    </td>
                  )}
                  {!isEditing && isAdmin && (
                    <td className="row-actions">
                      {onUpdate && (
                        <button onClick={() => setEditingId(row.id)} disabled={isPending}>Modifier</button>
                      )}
                      <button className="danger" onClick={() => handleDelete(row.id)} disabled={isPending}>
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
