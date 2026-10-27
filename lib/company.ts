/**
 * Rapprochement des noms d'entreprise (formations INTRA) : majuscules,
 * accents, ponctuation et forme juridique ne comptent pas, et un nom contenu
 * dans l'autre suffit (« ENEDIS » = « Enedis Lille » = « ENEDIS SA »).
 */
const LEGAL = /\b(sas|sasu|sarl|eurl|sa|sca|snc|sci|scop|gie|ets|etablissements?|groupe|societe|ste)\b/g;

export function companyKey(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = companyKey(a);
  const y = companyKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Nom contenu dans l'autre, par mots entiers (« edf » ne correspond pas à « fedf »), 3 lettres minimum.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && ` ${long} `.includes(` ${short} `);
}
