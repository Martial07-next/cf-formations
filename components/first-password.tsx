'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { setFirstPassword } from '@/app/profil/actions';
import { logout } from '@/app/login/actions';

/**
 * Première connexion : le mot de passe temporaire doit être remplacé avant
 * d'utiliser la plateforme. Fenêtre bloquante ; une fois enregistré, on reste
 * connecté et on arrive directement sur la page demandée.
 */
export function FirstPasswordGate({ name }: { name: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rules = [
    { ok: password.length >= 8, label: '8 caractères minimum' },
    { ok: /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password), label: 'Au moins une lettre et un chiffre' },
    { ok: password.length > 0 && password === confirm, label: 'Les deux saisies sont identiques' },
  ];
  const ready = rules.every((r) => r.ok);

  return (
    <div className="first-pw" role="dialog" aria-modal="true" aria-labelledby="first-pw-title">
      <form
        className="first-pw-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          setError(null);
          start(async () => {
            const res = await setFirstPassword(password, confirm);
            if (!res.ok) return setError(res.error);
            router.refresh();
          });
        }}
      >
        <span className="first-pw-icon" aria-hidden><KeyRound size={22} /></span>
        <h2 id="first-pw-title">Bienvenue {name.split(' ')[0]} !</h2>
        <p className="hint">Tu t’es connecté avec un mot de passe temporaire. Choisis ton mot de passe personnel pour accéder à la plateforme.</p>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <label>
          Nouveau mot de passe
          <span className="first-pw-input">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus required />
            <button type="button" className="icon ghost" onClick={() => setShow(!show)} aria-label={show ? 'Masquer' : 'Afficher'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <label>
          Confirmer
          <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        <ul className="first-pw-rules">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? 'ok' : ''}>{r.label}</li>
          ))}
        </ul>
        <button type="submit" className="primary" disabled={!ready || pending}>
          {pending ? <Loader2 size={15} className="spin" aria-hidden /> : null} Enregistrer et accéder à la plateforme
        </button>
        <button type="button" className="link first-pw-out" onClick={() => logout()}>Se déconnecter</button>
      </form>
    </div>
  );
}
