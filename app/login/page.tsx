import { login } from './actions';

export const metadata = { title: 'Connexion · CF PLANNING' };

/** Fond animé : bulles vertes et jaunes granuleuses qui dérivent et fusionnent. */
function Backdrop() {
  return (
    <div className="auth-bg" aria-hidden>
      <svg className="auth-defs" width="0" height="0">
        <defs>
          {/* Fusion des bulles (effet « goo ») */}
          <filter id="auth-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="28" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          {/* Grain */}
          <filter id="auth-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>
      <div className="auth-blobs">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
        <span className="blob b5" />
        <span className="blob b6" />
      </div>
      <svg className="auth-grain" width="100%" height="100%" preserveAspectRatio="none">
        <rect width="100%" height="100%" filter="url(#auth-grain)" />
      </svg>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="auth">
      <Backdrop />
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
