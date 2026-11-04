/**
 * Prénom et nom d'un compte (migration 53). Nom complet affiché partout :
 * « Prénom NOM ». Sans prénom enregistré, le prénom est deviné dans le nom
 * complet (mot qui n'est pas en MAJUSCULES, sinon le premier mot).
 */
export function composeFullName(first: string, last: string): string {
  return [first.trim(), last.trim().toUpperCase()].filter(Boolean).join(' ');
}

export function firstNameOf(p: { first_name?: string | null; full_name?: string | null }): string {
  if (p.first_name?.trim()) return p.first_name.trim();
  const words = String(p.full_name || '').split(/\s+/).filter(Boolean);
  return words.find((w) => w !== w.toUpperCase()) || words[0] || '';
}

/** Prénom / nom pour pré-remplir un formulaire (enregistrés, sinon déduits du nom complet). */
export function splitName(p: { first_name?: string | null; last_name?: string | null; full_name?: string | null }): { first: string; last: string } {
  if (p.first_name || p.last_name) return { first: p.first_name || '', last: p.last_name || '' };
  const words = String(p.full_name || '').split(/\s+/).filter(Boolean);
  const upper = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w));
  if (upper.length && upper.length < words.length) return { first: words.filter((w) => !upper.includes(w)).join(' '), last: upper.join(' ') };
  return { first: words[0] || '', last: words.slice(1).join(' ') };
}
