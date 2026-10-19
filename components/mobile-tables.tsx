'use client';

import { useEffect } from 'react';

/**
 * Téléphone : les tableaux s'affichent en cartes (une ligne = une carte).
 * Chaque cellule reçoit le titre de sa colonne (data-label), affiché devant
 * la valeur. Les tableaux en grille (émargement, mensuel, droits) défilent.
 */
export function MobileTables() {
  useEffect(() => {
    let frame = 0;
    const label = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>('table.data').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        if (!heads.length) return;
        table.querySelectorAll('tbody tr').forEach((tr) => {
          let i = 0;
          for (const cell of Array.from(tr.children) as HTMLTableCellElement[]) {
            const text = cell.colSpan > 1 ? '' : heads[i] || '';
            if (cell.getAttribute('data-label') !== text) cell.setAttribute('data-label', text);
            i += cell.colSpan || 1;
          }
        });
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(label);
    };
    // Après le démarrage de la page (React ne doit pas trouver d'attribut inattendu).
    const observer = new MutationObserver(schedule);
    const start = () => {
      label();
      observer.observe(document.body, { childList: true, subtree: true });
    };
    const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
    const timer = idle ? idle(start, { timeout: 1500 }) : window.setTimeout(start, 400);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (idle) (window as any).cancelIdleCallback?.(timer);
      else clearTimeout(timer);
    };
  }, []);
  return null;
}
