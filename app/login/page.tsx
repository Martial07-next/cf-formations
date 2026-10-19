import { login } from './actions';
import { AuthBackdrop } from '@/components/auth-backdrop';

export const metadata = { title: 'Connexion · CF PLANNING' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="auth">
      <AuthBackdrop />
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="auth-logo" width={200} height={32} />
        <p className="auth-kicker">PLANNING · FORMATIONS</p>
        <h1>Connexion</h1>

        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {message && <div role="status" className="alert">{message}</div>}

        <form className="auth-form">
          <label>
            Adresse e-mail
            <input name="email" type="email" required autoComplete="email" placeholder="prenom.nom@cf-reseau.fr" />
          </label>
          <label>
            Mot de passe
            <input name="password" type="password" required minLength={6} autoComplete="current-password" placeholder="••••••••" />
          </label>
          <div className="auth-actions">
            <button formAction={login} className="primary">Se connecter</button>
          </div>
          <p className="auth-hint">Pas encore d’accès ? Demande-le au bureau administratif.</p>
        </form>
      </div>
    </main>
  );
}
