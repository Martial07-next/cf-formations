import Link from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';

export type DashItem = {
  href: string;
  title: string;
  meta?: string;
  badge?: { text: string; tone: 'ok' | 'warn' | 'todo' | 'info' | 'urgent' };
  color?: string | null;
};

/** Bloc du tableau de bord : titre, compteur, liste cliquable (8 lignes au plus) ou message « à jour ». */
export function DashCard({
  icon,
  title,
  items,
  empty,
  tone,
  hint,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  items: DashItem[];
  empty: string;
  tone?: 'warn' | 'urgent' | 'dark';
  hint?: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className={`dash-card${tone ? ` tone-${tone}` : ''}`}>
      <h2>
        <span className="dash-card-icon">{icon}</span>
        {title}
        {items.length > 0 && <span className="dash-card-count">{items.length}</span>}
      </h2>
      {hint && <p className="hint dash-card-hint">{hint}</p>}
      {items.length === 0 ? (
        empty && <p className="dash-empty"><CheckCircle2 size={15} aria-hidden /> {empty}</p>
      ) : (
        <ul className="dash-list">
          {items.slice(0, 8).map((i) => (
            <li key={i.href + i.title}>
              <Link href={i.href}>
                {i.color && <span className="swatch" style={{ background: i.color }} aria-hidden />}
                <span className="dash-item-main">
                  <strong>{i.title}</strong>
                  {i.meta && <small>{i.meta}</small>}
                </span>
                {i.badge && <span className={`dash-badge ${i.badge.tone}`}>{i.badge.text}</span>}
                <ChevronRight size={15} aria-hidden className="dash-go" />
              </Link>
            </li>
          ))}
          {items.length > 8 && <li className="hint dash-more">+ {items.length - 8} autre{items.length - 8 > 1 ? 's' : ''}</li>}
        </ul>
      )}
      {footer && <div className="dash-card-foot">{footer}</div>}
    </section>
  );
}
