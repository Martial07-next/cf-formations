import Link from 'next/link';
import {
  Zap,
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
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { ROLE_LABELS, canManage, type Role } from '@/lib/roles';

type Profile = { full_name: string; role: string; trainer_id?: string | null } | null;
type NavLink = { href: string; label: string; icon: typeof CalendarDays };

function groupsFor(profile: Profile): { label: string; links: NavLink[] }[] {
  const role = profile?.role;
  const groups: { label: string; links: NavLink[] }[] = [
    {
      label: 'Planning',
      links: [
        { href: '/', label: 'Planning', icon: CalendarDays },
        { href: '/sessions', label: 'Sessions', icon: ListChecks },
      ],
    },
  ];

  const suivi: NavLink[] = [];
  if (profile?.trainer_id) suivi.push({ href: `/formateurs/${profile.trainer_id}`, label: 'Mon historique', icon: History });
  if (role === 'referent') suivi.push({ href: '/equipe', label: 'Mon équipe', icon: UsersRound });
  if (role === 'admin') suivi.push({ href: '/equipe', label: 'Équipes & suivi', icon: UsersRound });
  if (suivi.length) groups.push({ label: 'Suivi', links: suivi });

  if (canManage(role)) {
    groups.push({
      label: 'Ressources',
      links: [
        { href: '/formateurs', label: 'Formateurs', icon: GraduationCap },
        { href: '/stagiaires', label: 'Stagiaires', icon: Users },
        { href: '/salles', label: 'Salles', icon: DoorOpen },
        { href: '/modeles', label: 'Formations', icon: FolderOpen },
      ],
    });
  }
  if (role === 'admin') {
    groups.push({ label: 'Bureau administratif', links: [{ href: '/administration', label: 'Administration', icon: Settings }] });
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
    <Link href="/" className="brand">
      <span className="brand-mark">
        <Zap size={18} fill="currentColor" aria-hidden />
      </span>
      <span className="brand-text">
        CF Réseaux
        <small>FORMATIONS</small>
      </span>
    </Link>
  );
}

export function Sidebar({ active, profile }: { active: string; profile: Profile }) {
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <NavContent active={active} profile={profile} />
      </aside>

      <div className="mobile-bar">
        <Brand />
        <details>
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
