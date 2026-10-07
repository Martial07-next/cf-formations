'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

type Field = {
  name: string;
  label: string;
  type?: string;
  step?: string;
  required?: boolean;
  options?: { value: string; label: string }[]; // pour type "select"
  /** Champ proposé seulement à la création (ex. statut, modifiable directement en liste). */
  createOnly?: boolean;
  /** Champ proposé seulement en modification (ex. couleur attribuée automatiquement à la création). */
  editOnly?: boolean;
  placeholder?: string;
  list?: string; // id d'une <datalist> de suggestions
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
  searchKeys,
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
  /** Champs texte utilisés par la recherche (affiche une barre de recherche si fourni). */
  searchKeys?: string[];
}) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await onCreate(formData);
      if (!result.ok) setError(result.error || 'Une erreur est survenue.');
      else {
        setAddOpen(false);
        setNotice('Ajouté.');
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer définitivement cet élément ?')) return;
    setError(null);
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

  const editableFields = fields.filter((f) => !f.createOnly);
  const q = query.trim().toLowerCase();
  const visibleRows =
    q && searchKeys
      ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)))
      : rows;

  function renderInput(f: Field, defaultValue?: any) {
    if (f.type === 'select') {
      return (
        <select name={f.name} required={f.required} defaultValue={defaultValue ?? f.options?.[0]?.value}>
          {(f.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return <textarea name={f.name} rows={2} required={f.required} defaultValue={defaultValue ?? ''} placeholder={f.placeholder} />;
    }
    return (
      <input
        name={f.name}
        type={f.type || 'text'}
        step={f.step}
        required={f.required}
        defaultValue={defaultValue ?? (f.type === 'color' ? undefined : '')}
        placeholder={f.placeholder}
        list={f.list}
        min={f.type === 'number' ? 0 : undefined}
      />
    );
  }

  return (
    <>
      {notice && !error && <div role="status" className="alert alert-success">{notice}</div>}
      {error && !editingId && <div role="alert" className="alert alert-error">{error}</div>}
      {(isAdmin || searchKeys) && (
        <div className="panel-head">
          {searchKeys ? (
            <label className="search">
              <Search size={15} aria-hidden />
              <span className="sr-only">Rechercher</span>
              <input placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          ) : <span />}
          {isAdmin && <button className={addOpen ? '' : 'primary'} onClick={() => { setAddOpen((v) => !v); setNotice(null); }} aria-expanded={addOpen}>
            <Plus size={16} aria-hidden /> {addOpen ? 'Fermer' : `Ajouter ${title}`}
          </button>}
        </div>
      )}
      {isAdmin && addOpen && (
        <div className="panel">
          <h2>Ajouter {title}</h2>
          <form action={handleCreate}>
            <div className="form-row">
              {fields.filter((f) => !f.editOnly).map((f) => (
                <label key={f.name}>
                  {f.label}
                  {renderInput(f)}
                </label>
              ))}
            </div>
            <button type="submit" className="primary" disabled={isPending}>{isPending ? 'Ajout…' : 'Enregistrer'}</button>
          </form>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <p className="empty">{rows.length === 0 ? emptyLabel : 'Aucun résultat.'}</p>
      ) : (
        <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {statusField && <th>{statusField.label}</th>}
              {isAdmin && <th><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id}>
                  {isEditing ? (
                    <td colSpan={columns.length + (statusField ? 1 : 0) + 1} style={{ padding: 14, background: 'var(--surface-2)' }}>
                      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
                      <form
                        action={(fd) => handleUpdate(row.id, fd)}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'end' }}
                      >
                        {editableFields.map((f) => (
                          <label key={f.name} className="field">
                            {f.label}
                            {renderInput(f, row[f.name])}
                          </label>
                        ))}
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
                          className="input"
                          aria-label={statusField.label}
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
                        <button className="small" onClick={() => { setError(null); setEditingId(row.id); }} disabled={isPending}>
                          <Pencil size={14} aria-hidden /> Modifier
                        </button>
                      )}
                      <button className="danger small icon" onClick={() => handleDelete(row.id)} disabled={isPending} aria-label="Supprimer" title="Supprimer">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}
