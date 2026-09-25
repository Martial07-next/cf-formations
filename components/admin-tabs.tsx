import Link from 'next/link';

const tabs = [
  { href: '/administration', label: 'Utilisateurs' },
  { href: '/administration/parametres', label: 'Paramètres généraux' },
  { href: '/administration/integrations', label: 'Intégrations' },
];

export function AdminTabs({ active }: { active: string }) {
  return (
    <div className="admin-tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? 'active' : ''}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function AdminResourceLinks() {
  const items = [
    { href: '/formateurs', label: 'Formateurs', desc: 'Coordonnées, spécialités, disponibilité, statut.' },
    { href: '/salles', label: 'Salles', desc: 'Capacité, équipements, localisation, disponibilité.' },
    { href: '/modeles', label: 'Formations', desc: 'Catalogue des formations : référence, catégorie, durée.' },
  ];
  return (
    <div className="admin-cards">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="admin-card">
          <strong>{it.label}</strong>
          <span>{it.desc}</span>
        </Link>
      ))}
    </div>
  );
}
