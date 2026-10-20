import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setNewPassword } from '@/app/acces/actions';
import { AuthBackdrop } from '@/components/auth-backdrop';

export const metadata = { title: 'Nouveau mot de passe · CF PLANNING' };

/** Après le lien « mot de passe oublié » : choix du nouveau mot de passe. */
export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?vue=oubli&error=' + encodeURIComponent('Lien expiré : refais la demande.'));
  return (
    <main className="auth">
      <AuthBackdrop />
      <div className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="auth-logo" width={200} height={32} />
        <p className="auth-kicker">PLANNING · FORMATIONS</p>
        <h1>Nouveau mot de passe</h1>
        <p className="auth-hint" style={{ textAlign: 'left', marginBottom: 14 }}>Compte : {user.email}</p>
        {error && <div role="alert" className="alert alert-error">{error}</div>}
        <form className="auth-form" action={setNewPassword}>
          <label>
            Nouveau mot de passe
            <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="8 caractères minimum" />
          </label>
          <label>
            Confirmer
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div className="auth-actions">
            <button type="submit" className="primary">Enregistrer et me connecter</button>
          </div>
        </form>
      </div>
    </main>
  );
}
