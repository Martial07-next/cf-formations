/**
 * Recherche de stagiaires : sans accents ni majuscules, nom et prénom dans
 * n'importe quel ordre, résultats classés par pertinence (nom exact, puis
 * nom qui commence par…, puis entreprise, puis e-mail).
 */

export const fold = (v: string | null | undefined) =>
  (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ');

const tokens = (v: string) => v.split(/[\s\-_.,;/()]+/).filter(Boolean);

type Searchable = { full_name: string; first_name?: string | null; last_name?: string | null; company?: string | null; email?: string | null };

/** Score de pertinence (0 = ne correspond pas). */
export function traineeScore(t: Searchable, query: string): number {
  const q = fold(query).trim();
  const words = tokens(q);
  if (!words.length) return 0;
  const name = fold([t.full_name, t.first_name, t.last_name].filter(Boolean).join(' '));
  const nameTokens = tokens(name);
  const company = fold(t.company);
  const companyTokens = tokens(company);
  const email = fold(t.email);
  let score = 0;
  for (const w of words) {
    let best = 0;
    if (nameTokens.includes(w)) best = 10;
    else if (nameTokens.some((x) => x.startsWith(w))) best = 7;
    else if (w.length >= 3 && name.includes(w)) best = 3;
    if (best < 5) {
      if (company === w || companyTokens.includes(w)) best = Math.max(best, 5);
      else if (companyTokens.some((x) => x.startsWith(w))) best = Math.max(best, 4);
      else if (w.length >= 3 && company.includes(w)) best = Math.max(best, 2);
    }
    if (!best && w.length >= 3 && email.includes(w)) best = 1;
    if (!best) return 0;
    score += best;
  }
  // Bonus : le nom complet correspond exactement (dans un sens ou dans l'autre).
  const full = tokens(fold(t.full_name)).join(' ');
  const rev = tokens(fold(t.full_name)).reverse().join(' ');
  const qj = words.join(' ');
  if (full === qj || rev === qj) score += 20;
  else if (full.startsWith(qj) || rev.startsWith(qj)) score += 8;
  return score;
}

/** Stagiaires correspondant à la recherche, les plus pertinents d'abord. */
export function searchTrainees<T extends Searchable>(list: T[], query: string, limit = Infinity): T[] {
  return list
    .map((t) => ({ t, s: traineeScore(t, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.t.full_name.localeCompare(b.t.full_name, 'fr'))
    .slice(0, limit)
    .map((x) => x.t);
}
