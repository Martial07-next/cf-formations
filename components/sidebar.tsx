import Link from 'next/link';
import {
  Zap,
  CalendarDays,
  ListChecks,
  GraduationCap,
  Users,
  DoorOpen,
  FileText,
  Settings,
  User,
  LogOut,
} from 'lucide-react';
import { logout } from '@/app/login/actions';
import { ROLE_LABELS, type Role } from '@/lib/roles';

const groups = [
  {
    label: 'Planning',
    links: [
      { href: '/', label: 'Planning', icon: CalendarDays },
      { href: '/sessions', label: 'Sessions', icon: ListChecks },
    ],
  },
  {
    label: 'Ressources',
    links: [
      { href: '/formateurs', label: 'Formateurs', icon: GraduationCap },
      { href: '/stagiaires', label: 'Stagiaires', icon: Users },
      { href: '/salles', label: 'Salles', icon: DoorOpen },
      { href: '/modeles', label: 'Modèles', icon: FileText },
    ],
  },
  {
    label: 'Administration',
    links: [{ href: '/administration', label: 'Administration', icon: Settings }],
  },
];

export function Sidebar({
  active,
  profile,
}: {
  active: string;
  profile: { full_name: string; role: string } | null;
}) {
  return (
    <aside>
      <div className="brand">
        <span className="brand-mark">
          <Zap size={18} fill="currentColor" />
        </span>
        <span className="brand-text">
          CF Réseau
          <small>FORMATIONS</small>
        </span>
      </div>

      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-group-label">{group.label}</p>
          <nav>
            {group.links.map((l) => {
              const Icon = l.icon;
              return (
                <Link key={l.href} href={l.href} className={l.href === active ? 'active' : ''}>
                  <Icon size={17} />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-footer">
        <Link href="/profil">
          <User size={17} />
          Mon profil
        </Link>
        <div className="profile-block">
          <strong>{profile?.full_name || '—'}</strong>
          <small>{profile?.role ? ROLE_LABELS[profile.role as Role] ?? profile.role : ''}</small>
          <form action={logout}>
            <button className="logout" type="submit">
              <LogOut size={14} />
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
