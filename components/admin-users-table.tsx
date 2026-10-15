'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { KeyRound, Trash2, Pencil, X } from 'lucide-react';
import { updateRole, resetUserPassword, deleteUserAccess, updateUserAccess } from '@/app/administration/actions';
import { setBillingAccess } from '@/app/facturation/actions';
import { ROLE_LABELS, ROLE_OPTIONS, type Role } from '@/lib/roles';

type Row = { id: string; full_name: string; role: string; created_at: string; email?: string | null; can_invoice?: boolean | null };

/** Fenêtre « Modifier l'accès » : nom prénom, e-mail, mot de passe. */
function EditAccess({ user, self, onClose, onDone }: { user: Row; self: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'keep' | 'type' | 'generate'>('keep');
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-label={`Modifier l’accès de ${user.full_name}`}>
      <div className="modal-head">
        <h2>Modifier l’accès</h2>
        <button className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <form
        className="modal-body"
        style={{ paddingBottom: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await updateUserAccess(user.id, {
              full_name: String(fd.get('full_name') || ''),
              email: String(fd.get('email') || ''),
              password: mode === 'type' ? String(fd.get('password') || '') : '',
              generate: mode === 'generate',
            });
            if (!res.ok) return setError(res.error);
            onDone(res.password ? `Accès de ${fd.get('full_name')} modifié. Nouveau mot de passe : ${res.password} (à lui transmettre, il ne sera plus affiché).` : 'Accès modifié.');
          });
        }}
      >
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <div className="form-row">
          <label>Nom prénom<input name="full_name" required defaultValue={user.full_name} /></label>
          <label>E-mail (identifiant de connexion)<input type="email" name="email" required defaultValue={user.email || ''} /></label>
        </div>
        {!self && (
          <div className="field" style={{ marginBottom: 12 }}>
            Mot de passe
            <div className="status-choice">
              <label><input type="radio" name="pwmode" checked={mode === 'keep'} onChange={() => setMode('keep')} /> Ne pas changer</label>
              <label><input type="radio" name="pwmode" checked={mode === 'type'} onChange={() => setMode('type')} /> Choisir</label>
              <label><input type="radio" name="pwmode" checked={mode === 'generate'} onChange={() => setMode('generate')} /> Générer</label>
            </div>
            {mode === 'type' && <input name="password" type="text" minLength={8} required placeholder="8 caractères minimum" autoComplete="new-password" />}
          </div>
        )}
        <div className="form-actions"><button type="submit" className="primary" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </form>
    </dialog>
  );
}

export function AdminUsersTable({ rows, currentUserId }: { rows: Row[]; currentUserId: string }) {
  const [editing, setEditing] = useState<Row | null>(null);
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
              <th>Nom prénom</th>
              <th>E-mail</th>
              <th>Type d’accès</th>
              {rows.some((r) => r.can_invoice != null) && <th title="Seul un compte coché peut nommer les factures et cocher « Facturation faite »">Facturation</th>}
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
                  {rows.some((r) => r.can_invoice != null) && (
                    <td>
                      <label className="check-line" title="Accès Facturation">
                        <input
                          type="checkbox"
                          checked={Boolean(u.can_invoice)}
                          disabled={isPending}
                          aria-label={`Accès Facturation pour ${u.full_name}`}
                          onChange={(e) => run(() => setBillingAccess(u.id, e.target.checked), e.target.checked ? `${u.full_name} a maintenant l’accès Facturation.` : `Accès Facturation retiré à ${u.full_name}.`)}
                        />
                        <span className="hint">{u.can_invoice ? 'Oui' : 'Non'}</span>
                      </label>
                    </td>
                  )}
                  <td>{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="row-actions">
                    <button className="small" onClick={() => { setNotice(null); setEditing(u); }} disabled={isPending} title="Nom, e-mail, mot de passe">
                      <Pencil size={14} aria-hidden /> Modifier
                    </button>
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
      {editing && (
        <EditAccess
          user={editing}
          self={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onDone={(msg) => { setEditing(null); setError(null); setNotice(msg); }}
        />
      )}
    </>
  );
}
