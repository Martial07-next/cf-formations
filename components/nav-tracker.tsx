'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { currentUrl, recordVisit, saveScroll, takeRestore } from '@/lib/nav-history';

/** Note chaque page visitée et sa position de défilement (bouton « Retour »). */
export function NavTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${pathname}?${search.toString()}`;

  useEffect(() => {
    const url = currentUrl();
    recordVisit(url);
    // Retour : la page revient à l'endroit où on l'avait laissée.
    const y = takeRestore(url);
    if (y != null) {
      let tries = 0;
      const go = () => {
        window.scrollTo(0, y);
        if (Math.abs(window.scrollY - y) > 4 && tries++ < 20) setTimeout(go, 100);
      };
      requestAnimationFrame(go);
    }
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        saveScroll(url, window.scrollY);
      }, 150);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (t) clearTimeout(t);
      saveScroll(url, window.scrollY);
    };
  }, [key]);

  return null;
}
