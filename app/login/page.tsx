import { login, signup } from './actions';
import { Zap } from 'lucide-react';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand" style={{ padding: 0, marginBottom: 22 }}>
          <span className="brand-mark" style={{ color: '#0d3d24' }}>
            <Zap size={18} fill="currentColor" />
          </span>
          <span className="brand-text" style={{ color: 'var(--ink)' }}>
            CF Réseau
            <small style={{ color: 'var(--muted)' }}>FORMATIONS</small>
          </span>
        </div>
        <h1>Connexion</h1>

        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {message && <div role="status" className="alert">{message}</div>}

        <form className="auth-form">
          <label>
            Adresse e-mail
            <input name="email" type="email" required placeholder="prenom.nom@cf-reseau.fr" />
          </label>
          <label>
            Mot de passe
            <input name="password" type="password" required minLength={6} placeholder="••••••••" />
          </label>
          <label>
            Nom complet <small>(uniquement pour la création de compte)</small>
            <input name="full_name" type="text" placeholder="Camille Martin" />
          </label>
          <div className="auth-actions">
            <button formAction={login} className="primary">Se connecter</button>
            <button formAction={signup}>Créer un compte</button>
          </div>
        </form>
      </div>
    </main>
  );
}
