'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  ListChecks,
  GraduationCap,
  Users,
  DoorOpen,
  FolderOpen,
  Settings,
  User,
  LogOut,
  UsersRound,
  History,
  Menu,
  Route,
  ClipboardList,
  IdCard,
  Receipt,
  Lightbulb,
  LayoutDashboard,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { ROLE_LABELS, canManage, type Role } from '@/lib/roles';

type Profile = { full_name: string; role: string; trainer_id?: string | null; can_invoice?: boolean; can_dev?: boolean; pending_requests?: number; dev_open?: number } | null;
type NavLink = { href: string; label: string; icon: typeof CalendarDays };

function groupsFor(profile: Profile): { label: string; links: NavLink[] }[] {
  const role = profile?.role;
  const groups: { label: string; links: NavLink[] }[] = [
    {
      label: 'Planning',
      links: [
        { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
        { href: '/', label: 'Planning', icon: CalendarDays },
        { href: '/sessions', label: 'Sessions', icon: ListChecks },
      ],
    },
  ];
  if (canManage(role)) groups[0].links.push({ href: '/poec', label: 'Parcours POEC', icon: Route });

  const suivi: NavLink[] = [];
  if (profile?.trainer_id) suivi.push({ href: `/formateurs/${profile.trainer_id}`, label: 'Mon historique', icon: History });
  if (role === 'referent') suivi.push({ href: '/equipe', label: 'Mon équipe', icon: UsersRound });
  if (role === 'admin' || role === 'bureau') suivi.push({ href: '/suivi', label: 'Suivi interne', icon: ClipboardList });
  // Facturation : accès coché sur le compte (et lecture pour l'administrateur).
  if (profile?.can_invoice || role === 'admin') suivi.push({ href: '/facturation', label: 'Facturation', icon: Receipt });
  if (role === 'admin' || role === 'bureau') suivi.push({ href: '/equipe', label: 'Équipes & suivi', icon: UsersRound });
  if (suivi.length) groups.push({ label: 'Suivi', links: suivi });

  if (canManage(role)) {
    groups.push({
      label: 'Ressources',
      links: [
        // Formateurs et salles : administrateur seulement (inutiles au bureau).
        ...(role === 'admin' ? [{ href: '/formateurs', label: 'Formateurs', icon: GraduationCap }] : []),
        { href: '/stagiaires', label: 'Stagiaires', icon: Users },
        ...(role === 'admin' ? [{ href: '/salles', label: 'Salles', icon: DoorOpen }] : []),
        { href: '/modeles', label: 'Formations', icon: FolderOpen },
      ],
    });
  }
  if (role === 'admin') {
    groups.push({
      label: 'Bureau administratif',
      links: [
        { href: '/administration', label: 'Administration', icon: Settings },
        { href: '/salaries', label: 'Salariés', icon: IdCard },
      ],
    });
  }
  // Remarques d'amélioration : accès dev et administrateur.
  if (profile?.can_dev || role === 'admin') {
    groups.push({ label: 'Dev', links: [{ href: '/ameliorations', label: 'Améliorations', icon: Lightbulb }] });
  }
  return groups;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
}

function NavContent({ active, profile }: { active: string; profile: Profile }) {
  return (
    <>
      {groupsFor(profile).map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-group-label">{group.label}</p>
          <nav aria-label={group.label}>
            {group.links.map((l) => {
              const Icon = l.icon;
              const isActive = l.href === active;
              return (
                <Link key={l.href} href={l.href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
                  <Icon size={17} aria-hidden />
                  {l.label}
                  {l.href === '/ameliorations' && (profile?.dev_open || 0) > 0 && (
                    <span className="nav-badge" title="Remarques à traiter">{profile!.dev_open}</span>
                  )}
                  {l.href === '/administration' && (profile?.pending_requests || 0) > 0 && (
                    <span className="nav-badge" title="Demandes en attente">{profile!.pending_requests}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-footer">
        <Link href="/profil" aria-current={active === '/profil' ? 'page' : undefined}>
          <User size={17} aria-hidden />
          Mon profil
        </Link>
        <div className="profile-block">
          <span className="avatar" aria-hidden>{initials(profile?.full_name || '')}</span>
          <span className="profile-meta">
            <strong>{profile?.full_name || '-'}</strong>
            <small>{profile?.role ? ROLE_LABELS[profile.role as Role] ?? profile.role : ''}</small>
          </span>
          <form action={logout}>
            <button className="logout" type="submit" aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="CF Réseaux · Formations, accueil">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-cf-reseaux.svg" alt="CF Réseaux" className="brand-logo" width={180} height={29} />
      <small className="brand-sub">FORMATIONS</small>
    </Link>
  );
}

/** Lien actif : le plus long qui correspond à l'adresse (ex. /sessions/… → Sessions). */
function activeHref(pathname: string, profile: Profile) {
  const hrefs = [...groupsFor(profile).flatMap((g) => g.links.map((l) => l.href)), '/profil'];
  let best = '';
  for (const h of hrefs) {
    const match = h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(h + '/');
    if (match && h.length > best.length) best = h;
  }
  return best;
}

/**
 * Menu de l'application, affiché une seule fois (mise en page commune) :
 * il reste en place d'une page à l'autre, sans clignoter.
 */
export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const active = activeHref(pathname, profile);
  const menuRef = useRef<HTMLDetailsElement>(null);
  // Téléphone : le menu se referme après avoir choisi une page.
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <NavContent active={active} profile={profile} />
      </aside>

      <div className="mobile-bar">
        <Brand />
        <details ref={menuRef}>
          <summary aria-label="Ouvrir le menu">
            <Menu size={22} />
          </summary>
          <div className="mobile-menu">
            <NavContent active={active} profile={profile} />
          </div>
        </details>
      </div>
    </>
  );
}
