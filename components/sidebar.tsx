import Link from 'next/link';
import { logout } from '@/app/login/actions';

const links = [
  { href: '/', label: 'Planning' },
  { href: '/sessions', label: 'Sessions' },
  { href: '/formateurs', label: 'Formateurs' },
  { href: '/stagiaires', label: 'Stagiaires' },
  { href: '/salles', label: 'Salles' },
  { href: '/modeles', label: 'Modèles' },
  { href: '/administration', label: 'Administration' },
];

export function Sidebar({
  active,
  profile,
}: {
  active: string;
  profile: { full_name: string; role: string } | null;
}) {
  const initials = (profile?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside>
      <div className="brand">
        <span>CF</span> RÉSEAU
      </div>
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={l.href === active ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="profile">
        {initials}
        <br />
        <small>{profile?.role === 'admin' ? 'Administrateur' : 'Formateur'}</small>
        <form action={logout}>
          <button className="logout" type="submit">Se déconnecter</button>
        </form>
      </div>
    </aside>
  );
}
