import type { Metadata, Viewport } from 'next';
import './globals.css';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';
import { MobileTables } from '@/components/mobile-tables';
import { AppShell } from '@/components/app-shell';
import { workedHolidays } from '@/lib/holidays';

export const metadata: Metadata = {
  title: 'CF PLANNING',
  applicationName: 'CF PLANNING',
  description: 'Gestion des plannings de formation',
  appleWebApp: { capable: true, title: 'CF PLANNING', statusBarStyle: 'black-translucent' },
};
// Téléphones et tablettes : largeur de l'appareil, zones sûres (encoche), barre de couleur.
// minimumScale : impossible de dézoomer en dessous de la taille normale (le zoom avant reste possible).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, minimumScale: 1, viewportFit: 'cover', themeColor: '#17241B' };
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
  // Administrateur : nombre de demandes en attente (accès, mots de passe), affiché dans le menu.
  let pendingRequests = 0;
  if (profile?.role === 'admin') {
    const supabase = await createClient();
    const { count } = await supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'en_attente');
    pendingRequests = count ?? 0;
  }
  // Remarques d'amélioration à traiter (accès dev, migration 42) : compteur du menu.
  let devOpen = 0;
  if (profile && (profile.role === 'admin' || profile.can_dev)) {
    const supabase = await createClient();
    const { count } = await supabase.from('dev_feedback').select('id', { count: 'exact', head: true }).in('status', ['a_faire', 'en_cours']);
    devOpen = count ?? 0;
  }
  const shellProfile = profile
    ? {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        trainer_id: profile.trainer_id,
        can_invoice: profile.can_invoice,
        can_dev: profile.can_dev,
        pending_requests: pendingRequests,
        dev_open: devOpen,
        must_change_password: profile.must_change_password,
        worked_holidays: workedHolidays(),
      }
    : null;
  return (
    <html lang="fr">
      <body>
        <AppShell profile={shellProfile}>{children}</AppShell>
        <MobileTables />
      </body>
    </html>
  );
}
