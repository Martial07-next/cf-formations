'use client';

import { useState, useTransition } from 'react';
import { updateOwnName, updateOwnPassword, type ActionResult } from '@/app/profil/actions';

export function NameForm({ fullName }: { fullName: string }) {
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const result: ActionResult = await updateOwnName(formData);
      setMsg(result.ok ? { text: 'Nom mis à jour.', error: false } : { text: result.error, error: true });
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 460 }}>
      <h2>Informations</h2>
      {msg && <div role="alert" className={`alert ${msg.error ? 'alert-error' : 'alert-success'}`}>{msg.text}</div>}
      <form action={handle}>
        <div className="form-row">
          <label>
            Nom complet
            <input name="full_name" defaultValue={fullName} required />
          </label>
        </div>
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}

export function PasswordForm() {
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handle(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const result: ActionResult = await updateOwnPassword(formData);
      if (result.ok) {
        setMsg({ text: 'Mot de passe mis à jour.', error: false });
        (document.getElementById('password-form') as HTMLFormElement)?.reset();
      } else {
        setMsg({ text: result.error, error: true });
      }
    });
  }

  return (
    <div className="panel" style={{ maxWidth: 460 }}>
      <h2>Sécurité</h2>
      {msg && <div role="alert" className={`alert ${msg.error ? 'alert-error' : 'alert-success'}`}>{msg.text}</div>}
      <form id="password-form" action={handle}>
        <div className="form-row">
          <label>
            Mot de passe actuel
            <input name="current_password" type="password" required autoComplete="current-password" />
          </label>
        </div>
        <div className="form-row">
          <label>
            Nouveau mot de passe
            <input name="new_password" type="password" required minLength={6} autoComplete="new-password" />
          </label>
          <label>
            Confirmer
            <input name="confirm_password" type="password" required minLength={6} autoComplete="new-password" />
          </label>
        </div>
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? 'Mise à jour…' : 'Changer le mot de passe'}
        </button>
      </form>
    </div>
  );
}
