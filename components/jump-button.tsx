'use client';

/**
 * Bouton d'accès direct à une partie de la fiche (ex. « Modifier la session ») :
 * déplie le bloc replié qui la contient puis y fait défiler la page.
 */
export function JumpButton({ target, className = 'btn small', children }: { target: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.getElementById(target);
        if (!el) return;
        const fold = el.closest('details');
        if (fold) fold.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const field = el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea');
        window.setTimeout(() => field?.focus({ preventScroll: true }), 400);
      }}
    >
      {children}
    </button>
  );
}
