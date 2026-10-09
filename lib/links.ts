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

/** Nom de domaine affiché sous un lien. */
export function linkHost(url: string) {
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
