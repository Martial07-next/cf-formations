'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * Bouton « Retour » présent sur toutes les pages : revient à la page
 * précédente du site, sinon à la page indiquée (accueil par défaut).
 */
export function BackLink({ fallback = '/', label = 'Retour', className = 'back-link' }: { fallback?: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        const fromSite = typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin);
        if (fromSite && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ArrowLeft size={14} aria-hidden /> {label}
    </a>
  );
}
