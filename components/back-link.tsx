'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { markBack, previousPage } from '@/lib/nav-history';

const LABELS: [RegExp, string][] = [
  [/^\/(\?|$)/, 'Retour au planning'],
  [/^\/tableau-de-bord/, 'Retour au tableau de bord'],
  [/^\/a-faire/, 'Retour à « À faire »'],
  [/^\/sessions(\?|$)/, 'Retour aux sessions'],
  [/^\/stagiaires\/[^/?]+/, 'Retour au stagiaire'],
  [/^\/stagiaires/, 'Retour aux stagiaires'],
  [/^\/facturation/, 'Retour à la facturation'],
  [/^\/suivi/, 'Retour aux relances'],
  [/^\/tracabilite/, 'Retour à la traçabilité'],
  [/^\/poec/, 'Retour au parcours'],
  [/^\/formateurs/, 'Retour au formateur'],
  [/^\/equipe/, 'Retour à l’équipe'],
];

/**
 * Bouton « Retour » : revient à la page d'où l'on vient (planning à la bonne
 * semaine, liste filtrée…) à la même position, sinon à la page indiquée.
 */
export function BackLink({ fallback = '/', label, className = 'back-link' }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => setPrev(previousPage()?.url || null), []);
  const auto = prev ? LABELS.find(([re]) => re.test(prev))?.[1] : null;

  return (
    <a
      href={prev || fallback}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        const p = previousPage();
        if (!p) return router.push(fallback);
        markBack(p.index);
        router.push(p.url, { scroll: false });
      }}
    >
      <ArrowLeft size={14} aria-hidden /> {auto || label || 'Retour'}
    </a>
  );
}
