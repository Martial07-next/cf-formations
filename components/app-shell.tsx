'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { NavProgress } from '@/components/nav-progress';

type Profile = { full_name: string; role: string; trainer_id?: string | null; can_invoice?: boolean } | null;

/** Pages ouvertes sans compte (connexion, liens QR / signatures). */
const PUBLIC = ['/login', '/emargement/', '/convention/', '/france-travail/', '/autorisations/', '/salarie/'];

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
    </div>
  );
}
