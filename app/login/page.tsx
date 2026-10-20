import Link from 'next/link';
import { login } from './actions';
import { forgotPassword, requestAccess } from '@/app/acces/actions';
import { AuthBackdrop } from '@/components/auth-backdrop';

export const metadata = { title: 'Connexion · CF PLANNING' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; vue?: string }>;
}) {
  const { error, message, vue } = await searchParams;
  const view = vue === 'oubli' || vue === 'demande' ? vue : 'connexion';

  return (
    <main className="auth">
      <AuthBackdrop />
      <div className="auth-card" key={view}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="auth-logo" width={200} height={32} />
        <p className="auth-kicker">PLANNING · FORMATIONS</p>
        <h1>{view === 'oubli' ? 'Mot de passe oublié' : view === 'demande' ? 'Demander un accès' : 'Connexion'}</h1>

        {error && <div role="alert" className="alert alert-error">{error}</div>}
        {message && <div role="status" className="alert alert-success">{message}</div>}

        {view === 'connexion' && (
          <form className="auth-form">
            <label>
              Adresse e-mail
              <input name="email" type="email" required autoComplete="email" placeholder="prenom.nom@cf-reseaux.fr" />
            </label>
            <label>
              <span className="auth-label-row">
                Mot de passe
                <Link href="/login?vue=oubli" className="auth-link">Mot de passe oublié ?</Link>
              </span>
              <input name="password" type="password" required minLength={6} autoComplete="current-password" placeholder="••••••••" />
            </label>
            <div className="auth-actions">
              <button formAction={login} className="primary">Se connecter</button>
            </div>
            <p className="auth-hint">
              Pas encore d’accès ? <Link href="/login?vue=demande" className="auth-link">Faire une demande</Link>
            </p>
          </form>
        )}

        {view === 'oubli' && (
          <form className="auth-form" action={forgotPassword}>
            <p className="auth-intro">Indique l’e-mail de ton compte : tu recevras un lien pour choisir un nouveau mot de passe. L’administrateur est aussi prévenu et peut t’en donner un.</p>
            <label>
              Adresse e-mail
              <input name="email" type="email" required autoComplete="email" placeholder="prenom.nom@cf-reseaux.fr" />
            </label>
            <div className="auth-actions">
              <button type="submit" className="primary">Recevoir le lien</button>
            </div>
            <p className="auth-hint"><Link href="/login" className="auth-link">← Retour à la connexion</Link></p>
          </form>
        )}

        {view === 'demande' && (
          <form className="auth-form" action={requestAccess}>
            <p className="auth-intro">Ta demande est envoyée à l’administrateur, qui l’accepte ou la refuse. Une fois acceptée, il te transmet tes identifiants.</p>
            <label>
              Nom et prénom
              <input name="full_name" required maxLength={120} autoComplete="name" placeholder="DUPONT Jean" />
            </label>
            <label>
              Adresse e-mail
              <input name="email" type="email" required autoComplete="email" placeholder="prenom.nom@cf-reseaux.fr" />
            </label>
            <label>
              Je suis
              <select name="role_wanted" defaultValue="formateur">
                <option value="formateur">Formateur</option>
                <option value="referent">Référent cadre</option>
                <option value="bureau">Bureau administratif</option>
                <option value="consultation">Autre (consultation)</option>
              </select>
            </label>
            <label>
              Message <small>(facultatif)</small>
              <textarea name="message" rows={3} maxLength={600} placeholder="Ex. formateur habilitation électrique depuis septembre" />
            </label>
            {/* Piège à robots : champ invisible. */}
            <input name="website" tabIndex={-1} autoComplete="off" className="auth-trap" aria-hidden />
            <div className="auth-actions">
              <button type="submit" className="primary">Envoyer la demande</button>
            </div>
            <p className="auth-hint"><Link href="/login" className="auth-link">← Retour à la connexion</Link></p>
          </form>
        )}
      </div>
    </main>
  );
}
