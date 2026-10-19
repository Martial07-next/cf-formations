'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** Fine barre de progression en haut de l'écran pendant un changement de page. */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<number | undefined>(undefined);

  // Nouvelle page affichée : la barre se termine.
  useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 320);
  }, [pathname, search]);

  useEffect(() => {
    const start = () => {
      window.clearTimeout(timer.current);
      setState('loading');
      // Filet de sécurité : jamais bloquée.
      timer.current = window.setTimeout(() => setState('idle'), 12000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    const onNav = () => start();
    document.addEventListener('click', onClick, true);
    window.addEventListener('cf:navigate', onNav);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('cf:navigate', onNav);
    };
  }, []);

  return <div className={`nav-progress ${state}`} aria-hidden />;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
