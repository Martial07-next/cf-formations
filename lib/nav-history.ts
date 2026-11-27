/**
 * Historique de navigation interne (sessionStorage) : sert au bouton « Retour »
 * pour revenir exactement à la page d'avant (planning à la bonne semaine,
 * liste filtrée…) avec sa position de défilement.
 */

const KEY = 'cf_nav_stack';
const SCROLL = 'cf_nav_scroll';
const RESTORE = 'cf_nav_restore';
const MAX = 40;

const read = (k: string): any => {
  try {
    return JSON.parse(sessionStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export const currentUrl = () => window.location.pathname + window.location.search;
const pathOf = (url: string) => url.split('?')[0].split('#')[0];

export function navStack(): string[] {
  const s = read(KEY);
  return Array.isArray(s) ? s : [];
}

/** Page affichée : ajoutée à la pile (retour navigateur : la pile recule). */
export function recordVisit(url: string) {
  const stack = navStack();
  if (stack[stack.length - 1] === url) return;
  if (stack[stack.length - 2] === url) {
    stack.pop();
    write(KEY, stack);
    return;
  }
  // Même page, autres paramètres (onglet, jour…) : on remplace au lieu d'empiler.
  if (stack.length && pathOf(stack[stack.length - 1]) === pathOf(url)) stack[stack.length - 1] = url;
  else stack.push(url);
  write(KEY, stack.slice(-MAX));
}

export function saveScroll(url: string, y: number) {
  const m = read(SCROLL) || {};
  m[url] = y;
  const keys = Object.keys(m);
  if (keys.length > MAX) delete m[keys[0]];
  write(SCROLL, m);
}

/** Après un retour : position de défilement à remettre (une seule fois). */
export function takeRestore(url: string): number | null {
  const r = read(RESTORE);
  if (!r || r.url !== url) return null;
  try {
    sessionStorage.removeItem(RESTORE);
  } catch {}
  const y = (read(SCROLL) || {})[url];
  return typeof y === 'number' ? y : null;
}

/** Page précédente d'une autre adresse que la page actuelle (null : aucune). */
export function previousPage(): { url: string; index: number } | null {
  const stack = navStack();
  const here = pathOf(currentUrl());
  for (let i = stack.length - 1; i >= 0; i--) {
    if (pathOf(stack[i]) !== here) return { url: stack[i], index: i };
  }
  return null;
}

/** Prépare le retour vers `index` de la pile : la pile est coupée, le défilement sera remis. */
export function markBack(index: number) {
  const stack = navStack();
  const url = stack[index];
  write(KEY, stack.slice(0, index + 1));
  write(RESTORE, { url });
}
