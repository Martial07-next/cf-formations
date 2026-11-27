import Link from 'next/link';
import { CalendarDays, Sparkles } from 'lucide-react';

/** Onglets du planning (bureau) : planning réel / prévisionnel. */
export function PlanningTabs({ active }: { active: 'planning' | 'previsionnel' }) {
  return (
    <nav className="planning-tabs" aria-label="Planning">
      <Link href="/" className={active === 'planning' ? 'on' : ''} aria-current={active === 'planning' ? 'page' : undefined}>
        <CalendarDays size={15} aria-hidden /> Planning
      </Link>
      <Link href="/?vue=previsionnel" className={active === 'previsionnel' ? 'on' : ''} aria-current={active === 'previsionnel' ? 'page' : undefined}>
        <Sparkles size={15} aria-hidden /> Prévisionnel
        <span className="planning-tabs-ai">IA</span>
      </Link>
    </nav>
  );
}
