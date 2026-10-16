import type { Metadata } from 'next';
import './globals.css';
import { getCurrentProfile } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';

export const metadata: Metadata = { title: 'CF Réseaux · Formations', description: 'Gestion des plannings de formation' };
export default async function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  // Compte sans accès (créé hors de l'administration, ou suspendu) : aucune page de l'application.
  const profile = await getCurrentProfile().catch(() => null);
  if (profile?.role === 'aucun') {
    return (
      <html lang="fr">
        <body>
          <main className="login-page">
            <section className="panel" style={{ maxWidth: 460, margin: '12vh auto', textAlign: 'center' }}>
              <h1 style={{ fontSize: 22 }}>Accès en attente</h1>
              <p>Ton compte n’a pas encore d’accès à la plateforme. Demande à l’administrateur de CF Réseaux de t’en donner un.</p>
              <form action={logout}>
                <button type="submit">Se déconnecter</button>
              </form>
            </section>
          </main>
        </body>
      </html>
    );
  }
  return <html lang="fr"><body>{children}</body></html>;
}
