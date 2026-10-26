export type LinkItem = { id: string; label: string; url: string };
export type UsefulLink = LinkItem & { category: string; description: string | null; position: number };

/** Rubriques proposées pour les liens utiles (texte libre possible). */
export const LINK_CATEGORIES = [
  'Plateforme de congés',
  'Attestations de fin de formation',
  'Supports de cours',
  'Autorisations à imprimer',
  'Documents utiles',
];

/**
 * Lien sûr : http(s) uniquement (« www.site.fr » devient « https://www.site.fr »).
 * Renvoie null pour une adresse invalide ou dangereuse (javascript:, data:…).
 */
export function safeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Fichier déposé dans les supports de cours (bucket privé « supports »,
 * migration 41), servi par la route /supports/… réservée aux comptes de l'équipe.
 */
export const SUPPORT_BUCKET = 'supports';
export const SUPPORT_PREFIX = '/supports/';
export const isSupportFile = (url: string) => url.startsWith(SUPPORT_PREFIX);
/** Adresse d'un fichier déposé, sinon null (contrôle strict du chemin). */
export function supportFileUrl(raw: string): string | null {
  const v = raw.trim();
  return /^\/supports\/[0-9a-f-]{36}\/[^/\\]{1,180}$/i.test(v) && !v.includes('..') ? v : null;
}
/** Chemin dans le bucket « supports » d'un fichier déposé. */
export const supportStoragePath = (url: string) => decodeURIComponent(url.slice(SUPPORT_PREFIX.length));
/** Nom du fichier (sans le dossier). */
export const supportFileName = (url: string) => decodeURIComponent(url.split('/').pop() || '');

/** Nom de domaine affiché sous un lien (ou « Fichier PDF » pour un fichier déposé). */
export function linkHost(url: string) {
  if (isSupportFile(url)) {
    const ext = supportFileName(url).split('.').pop();
    return ext ? `Fichier ${ext.toUpperCase()}` : 'Fichier';
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Message clair si la migration 15 n'a pas encore été exécutée. */
export function missingTable(message: string) {
  return /template_links|useful_links|schema cache|does not exist/i.test(message)
    ? 'Exécute d’abord la migration 15 (supabase/migration_phase15.sql) dans Supabase.'
    : message;
}
