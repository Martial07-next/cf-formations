'use client';

import { Suspense, useEffect } from 'react';
import { DevLayer } from '@/components/dev/dev-layer';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { NavProgress } from '@/components/nav-progress';
import { FirstPasswordGate } from '@/components/first-password';

type Profile = { id?: string; full_name: string; role: string; trainer_id?: string | null; can_invoice?: boolean; can_dev?: boolean; pending_requests?: number; dev_open?: number; must_change_password?: boolean } | null;

/** Pages ouvertes sans compte (connexion, liens QR / signatures). */
const PUBLIC = ['/login', '/emargement/', '/convention/', '/france-travail/', '/autorisations/', '/salarie/', '/titre/', '/auth/', '/mot-de-passe'];

/** Mise en page commune : le menu reste affiché pendant la navigation, seul le contenu change. */
export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'));
  // Juste après la connexion, la mise en page peut dater d'avant : on la recharge une fois.
  useEffect(() => {
    if (!profile && !isPublic) router.refresh();
  }, [profile, isPublic, router]);

  if (isPublic || !profile) return <>{children}<NavProgress /></>;
  return (
    <div className="app-shell">
      <Sidebar profile={profile} />
      <div className="app-main">{children}</div>
      <NavProgress />
      {/* Mot de passe temporaire : à remplacer avant d'utiliser la plateforme. */}
      {profile.must_change_password && <FirstPasswordGate name={profile.full_name} />}
      {/* Remarques d'amélioration : comptes avec l'accès dev et administrateur. */}
      {profile.id && (profile.role === 'admin' || profile.can_dev) && (
        <Suspense fallback={null}>
          <DevLayer me={{ id: profile.id, role: profile.role, can_dev: Boolean(profile.can_dev) }} />
        </Suspense>
      )}
    </div>
  );
}
