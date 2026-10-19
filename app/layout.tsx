import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getCurrentProfile } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';
import { MobileTables } from '@/components/mobile-tables';

export const metadata: Metadata = {
  title: 'CF Réseaux · Formations',
  description: 'Gestion des plannings de formation',
  appleWebApp: { capable: true, title: 'CF Formations', statusBarStyle: 'black-translucent' },
};
// Téléphones et tablettes : largeur de l'appareil, zones sûres (encoche), barre de couleur.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#17241B' };
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
  return (
    <html lang="fr">
      <body>
        {children}
        <MobileTables />
      </body>
    </html>
  );
}
