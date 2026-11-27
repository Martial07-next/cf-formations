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
  ListTodo,
  ShieldCheck,
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
type NavLink = { href: string; label: string; icon: typeof CalendarDays; desc?: string };

type NavGroup = { id: string; label: string | null; links: NavLink[] };

/**
 * Menu rangé par ce qu'on vient faire :
 *  · en haut, le quotidien (tableau de bord, À faire, planning) ;
 *  · Formations : sessions, stagiaires, parcours ;
 *  · Suivi : facturation, relances, équipe, traçabilité ;
 *  · Réglages (replié par défaut) : catalogue, formateurs, salles, salariés, administration.
 * Chaque lien a une courte explication (survol).
 */
function groupsFor(profile: Profile): NavGroup[] {
  const role = profile?.role;
  const staff = canManage(role);
  const isAdmin = role === 'admin';
  const groups: NavGroup[] = [
    {
      id: 'main',
      label: null,
      links: [
        { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard, desc: 'Ma journée et ce qui arrive' },
        ...(staff ? [{ href: '/a-faire', label: 'À faire', icon: ListTodo, desc: 'Tout ce qui attend le bureau, du plus urgent au moins urgent' }] : []),
        { href: '/', label: 'Planning', icon: CalendarDays, desc: 'Les formations semaine par semaine, salle par salle' },
        ...(!staff ? [{ href: '/sessions', label: 'Sessions', icon: ListChecks, desc: 'Liste de toutes les sessions' }] : []),
        ...(profile?.trainer_id ? [{ href: `/formateurs/${profile.trainer_id}`, label: 'Mon historique', icon: History, desc: 'Mes formations passées et à venir' }] : []),
      ],
    },
  ];

  if (staff) {
    groups.push({
      id: 'formations',
      label: 'Formations',
      links: [
        { href: '/sessions', label: 'Sessions', icon: ListChecks, desc: 'Liste de toutes les sessions, avec recherche et filtres' },
        { href: '/stagiaires', label: 'Stagiaires', icon: Users, desc: 'Fiches stagiaires : formations, autorisations, prêts' },
        { href: '/poec', label: 'Parcours', icon: Route, desc: 'Parcours POEC et personnalisés' },
      ],
    });
  }

  const suivi: NavLink[] = [];
  // Facturation : accès coché sur le compte (et lecture pour l'administrateur).
  if (profile?.can_invoice || isAdmin) suivi.push({ href: '/facturation', label: 'Facturation', icon: Receipt, desc: 'Sessions terminées à facturer' });
  if (staff) suivi.push({ href: '/suivi', label: 'Relances', icon: ClipboardList, desc: 'Stagiaires en attente à relancer, sessions suivies par chacun' });
  if (role === 'referent') suivi.push({ href: '/equipe', label: 'Mon équipe', icon: UsersRound, desc: 'Les formateurs de mon équipe' });
  if (staff) suivi.push({ href: '/equipe', label: 'Formateurs & équipes', icon: UsersRound, desc: 'Charge et suivi des formateurs' });
  if (staff) suivi.push({ href: '/tracabilite', label: 'Traçabilité', icon: ShieldCheck, desc: 'Prêts, droits à l’image et journal des signatures' });
  if (suivi.length) groups.push({ id: 'suivi', label: 'Suivi', links: suivi });

  const settings: NavLink[] = [];
  if (staff) settings.push({ href: '/modeles', label: 'Catalogue des formations', icon: FolderOpen, desc: 'Formations proposées : durée, documents, réglages' });
  if (isAdmin) {
    settings.push({ href: '/formateurs', label: 'Formateurs', icon: GraduationCap, desc: 'Coordonnées, habilitations, disponibilités' });
    settings.push({ href: '/salles', label: 'Salles', icon: DoorOpen, desc: 'Salles et lieux de formation' });
    settings.push({ href: '/salaries', label: 'Salariés', icon: IdCard, desc: 'Salariés CF Réseaux : matériel, droit à l’image' });
    settings.push({ href: '/administration', label: 'Administration', icon: Settings, desc: 'Comptes, paramètres, intégrations' });
  }
  // Remarques d'amélioration : accès dev et administrateur.
  if (profile?.can_dev || isAdmin) settings.push({ href: '/ameliorations', label: 'Améliorations', icon: Lightbulb, desc: 'Remarques et idées pour la plateforme' });
  if (settings.length) groups.push({ id: 'reglages', label: isAdmin || staff ? 'Réglages' : 'Dev', links: settings });
  return groups;
}

/** Pages accessibles sans être dans le menu (ex. parcours, ouverts depuis le tableau de bord). */
const HIDDEN_ACTIVE: Record<string, string> = {};

const CLOSED_KEY = 'cf_nav_closed_v2';
/** Groupes repliés au premier affichage (avant tout choix mémorisé). */
const DEFAULT_CLOSED = ['reglages'];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
}

/** Pastille rouge d'un lien (demandes d'accès, remarques dev). */
function badgeOf(href: string, profile: Profile, todo = 0): number {
  if (href === '/a-faire') return todo;
  if (href === '/ameliorations') return profile?.dev_open || 0;
  if (href === '/administration') return profile?.pending_requests || 0;
  return 0;
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Compteur « À faire » : lu au chargement puis toutes les 5 minutes (gardé 2 minutes dans l'onglet). */
function useTodoCount(enabled: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = async (force = false) => {
      try {
        const cached = JSON.parse(sessionStorage.getItem('cf_todo') || 'null');
        if (!force && cached && Date.now() - cached.at < 120000) return setN(cached.count);
        const r = await fetch('/api/a-faire', { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        sessionStorage.setItem('cf_todo', JSON.stringify({ at: Date.now(), count: j.count || 0 }));
        setN(j.count || 0);
      } catch {}
    };
    load();
    const t = setInterval(() => load(true), 300000);
    const fromPage = () => {
      try {
        const c = Number(localStorage.getItem('cf_todo_count') || 0);
        sessionStorage.setItem('cf_todo', JSON.stringify({ at: Date.now(), count: c }));
        setN(c);
      } catch {}
    };
    window.addEventListener('cf:todo-count', fromPage);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('cf:todo-count', fromPage);
    };
  }, [enabled]);
  return n;
}

function NavContent({ active, profile, searchId }: { active: string; profile: Profile; searchId: string }) {
  const todo = useTodoCount(canManage(profile?.role as Role));
  const groups = groupsFor(profile);
  const total = groups.reduce((n, g) => n + g.links.length, 0);
  // Groupes repliés, mémorisés sur cet ordinateur ; celui de la page ouverte reste déplié.
  const [closed, setClosed] = useState<Set<string>>(new Set(DEFAULT_CLOSED));
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CLOSED_KEY);
      setClosed(new Set(saved ? JSON.parse(saved) : DEFAULT_CLOSED));
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
    .map((g) => ({ ...g, links: q ? g.links.filter((l) => plain(`${l.label} ${l.desc || ''}`).includes(q)) : g.links }))
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
        const hidden = group.links.reduce((n, l) => n + badgeOf(l.href, profile, todo), 0);
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
                  const n = badgeOf(l.href, profile, todo);
                  return (
                    <Link key={l.href} href={l.href} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined} title={l.desc} onClick={() => setQuery('')}>
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
