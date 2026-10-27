'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  ChevronDown,
  Search,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { ROLE_LABELS, canManage, type Role } from '@/lib/roles';

type Profile = { full_name: string; role: string; trainer_id?: string | null; can_invoice?: boolean; can_dev?: boolean; pending_requests?: number; dev_open?: number } | null;
type NavLink = { href: string; label: string; icon: typeof CalendarDays };

type NavGroup = { id: string; label: string | null; links: NavLink[] };

/**
 * Menu par rôle, en groupes courts : l'essentiel toujours visible en haut,
 * le reste dans des groupes repliables (Suivi, Catalogue, Administration).
 * Les parcours POEC / personnalisés se créent et s'ouvrent depuis le tableau de bord.
 */
function groupsFor(profile: Profile): NavGroup[] {
  const role = profile?.role;
  const staff = canManage(role);
  const groups: NavGroup[] = [
    {
      id: 'main',
      label: null,
      links: [
        { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
        { href: '/', label: 'Planning', icon: CalendarDays },
        { href: '/sessions', label: 'Sessions', icon: ListChecks },
        ...(profile?.trainer_id ? [{ href: `/formateurs/${profile.trainer_id}`, label: 'Mon historique', icon: History }] : []),
      ],
    },
  ];

  const suivi: NavLink[] = [];
  if (role === 'referent') suivi.push({ href: '/equipe', label: 'Mon équipe', icon: UsersRound });
  if (staff) suivi.push({ href: '/equipe', label: 'Équipes & suivi', icon: UsersRound });
  if (staff) suivi.push({ href: '/suivi', label: 'Suivi interne', icon: ClipboardList });
  // Facturation : accès coché sur le compte (et lecture pour l'administrateur).
  if (profile?.can_invoice || role === 'admin') suivi.push({ href: '/facturation', label: 'Facturation', icon: Receipt });
  if (suivi.length) groups.push({ id: 'suivi', label: 'Suivi', links: suivi });

  if (staff) {
    groups.push({
      id: 'catalogue',
      label: 'Catalogue',
      links: [
        { href: '/modeles', label: 'Formations', icon: FolderOpen },
        { href: '/stagiaires', label: 'Stagiaires', icon: Users },
        // Formateurs et salles : administrateur seulement (inutiles au bureau).
        ...(role === 'admin' ? [{ href: '/formateurs', label: 'Formateurs', icon: GraduationCap }] : []),
        ...(role === 'admin' ? [{ href: '/salles', label: 'Salles', icon: DoorOpen }] : []),
      ],
    });
  }
  const admin: NavLink[] = [];
  if (role === 'admin') {
    admin.push({ href: '/administration', label: 'Administration', icon: Settings });
    admin.push({ href: '/salaries', label: 'Salariés', icon: IdCard });
  }
  // Remarques d'amélioration : accès dev et administrateur.
  if (profile?.can_dev || role === 'admin') admin.push({ href: '/ameliorations', label: 'Améliorations', icon: Lightbulb });
  if (admin.length) groups.push({ id: 'admin', label: role === 'admin' ? 'Administration' : 'Dev', links: admin });
  return groups;
}

/** Pages accessibles sans être dans le menu (ex. parcours, ouverts depuis le tableau de bord). */
const HIDDEN_ACTIVE: Record<string, string> = { '/poec': '/tableau-de-bord' };

const CLOSED_KEY = 'cf_nav_closed';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
}

/** Pastille rouge d'un lien (demandes d'accès, remarques dev). */
function badgeOf(href: string, profile: Profile): number {
  if (href === '/ameliorations') return profile?.dev_open || 0;
  if (href === '/administration') return profile?.pending_requests || 0;
  return 0;
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function NavContent({ active, profile, searchId }: { active: string; profile: Profile; searchId: string }) {
  const groups = groupsFor(profile);
  const total = groups.reduce((n, g) => n + g.links.length, 0);
  // Groupes repliés, mémorisés sur cet ordinateur ; celui de la page ouverte reste déplié.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setClosed(new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]')));
    } catch {}
  }, []);
  const toggle = (id: string) =>
    setClosed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  // Recherche « Aller à… » (Ctrl+K) : filtre toutes les pages du menu.
  const [query, setQuery] = useState('');
  const q = plain(query.trim());
  const shown = groups
    .map((g) => ({ ...g, links: q ? g.links.filter((l) => plain(l.label).includes(q)) : g.links }))
    .filter((g) => g.links.length);
  const router = useRouter();

  return (
    <>
      {total > 6 && (
        <label className="nav-search">
          <Search size={14} aria-hidden />
          <span className="sr-only">Aller à une page</span>
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aller à…"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
              if (e.key === 'Enter' && shown[0]?.links[0]) {
                router.push(shown[0].links[0].href);
                setQuery('');
                e.currentTarget.blur();
              }
            }}
          />
          <kbd>Ctrl K</kbd>
        </label>
      )}
      {shown.map((group) => {
        const hasActive = group.links.some((l) => l.href === active);
        const isClosed = !q && group.label !== null && closed.has(group.id) && !hasActive;
        const hidden = group.links.reduce((n, l) => n + badgeOf(l.href, profile), 0);
        return (
          <div className={`nav-group${isClosed ? ' closed' : ''}`} key={group.id}>
            {group.label && (
              <button type="button" className="nav-group-toggle" aria-expanded={!isClosed} onClick={() => toggle(group.id)}>
                <span>{group.label}</span>
                {isClosed && hidden > 0 && <span className="nav-badge">{hidden}</span>}
                <ChevronDown size={14} aria-hidden className="nav-chev" />
              </button>
            )}
            {!isClosed && (
              <nav aria-label={group.label || 'Principal'}>
                {group.links.map((l) => {
                  const Icon = l.icon;
                  const isActive = l.href === active;
                  const n = badgeOf(l.href, profile);
                  return (
                    <Link key={l.href} href={l.href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined} onClick={() => setQuery('')}>
                      <Icon size={17} aria-hidden />
                      {l.label}
                      {n > 0 && <span className="nav-badge">{n}</span>}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>
        );
      })}
      {q && !shown.length && <p className="nav-empty">Aucune page « {query} »</p>}

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
  if (!best) {
    for (const [h, to] of Object.entries(HIDDEN_ACTIVE)) if (pathname === h || pathname.startsWith(h + '/')) best = to;
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
  // Ctrl+K (Cmd+K sur Mac) : recherche « Aller à… » du menu.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const desktop = document.getElementById('nav-search-desktop');
        if (desktop && desktop.offsetParent) {
          e.preventDefault();
          desktop.focus();
        } else if (menuRef.current) {
          e.preventDefault();
          menuRef.current.open = true;
          window.setTimeout(() => document.getElementById('nav-search-mobile')?.focus(), 50);
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <NavContent active={active} profile={profile} searchId="nav-search-desktop" />
      </aside>

      <div className="mobile-bar">
        <Brand />
        <details ref={menuRef}>
          <summary aria-label="Ouvrir le menu">
            <Menu size={22} />
          </summary>
          <div className="mobile-menu">
            <NavContent active={active} profile={profile} searchId="nav-search-mobile" />
          </div>
        </details>
      </div>
    </>
  );
}
