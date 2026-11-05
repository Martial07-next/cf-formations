/**
 * Stagiaires Digiforma : comparaison de noms et stagiaires fictifs.
 * Les sessions Digiforma (GEIQ…) contiennent souvent des places nommées
 * « Apprenant A », « Stagiaire 1 », « Test »… : elles vont à la corbeille,
 * ne sont jamais importées et ne servent pas à reconnaître un parcours.
 */

export type DfPerson = { firstName?: string | null; lastName?: string | null; email?: string | null };

const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nom comparable : sans accents, minuscules, mots triés (« Léa MARTIN » = « MARTIN Lea »). */
export function nameKey(v: string) {
  return fold(v).split(/[\s\-_.]+/).filter(Boolean).sort().join(' ');
}

export const personName = (t: DfPerson) => `${t.firstName || ''} ${t.lastName || ''}`.replace(/\s+/g, ' ').trim();
export const personKey = (t: DfPerson) => nameKey(personName(t));

const GENERIC = /^(apprenant|apprenante|stagiaire|participant|participante|candidat|candidate|eleve|alternant|alternante|salarie|learner|trainee|student|test|essai|demo|xxx+|inconnu|inconnue|anonyme|a definir|a completer|nom|prenom|place|personne|client|tbd|na|n a|geiq|poec|cfa|groupe|group|session|entreprise)$/;

/** Stagiaire fictif : « Apprenant A », « Stagiaire 3 », « Test Test », « X X », sans vrai nom. */
export function isPlaceholder(t: DfPerson): boolean {
  const words = fold(personName(t)).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return true;
  // Que des mots génériques, des lettres seules ou des numéros.
  const meaningful = words.filter((w) => !GENERIC.test(w) && !/^[a-z]$/.test(w) && !/^\d+$/.test(w) && !/^(n|no|num|numero)\d*$/.test(w) && !/^\d+[a-z]?$/.test(w));
  if (!meaningful.length) return true;
  // « Apprenant Dupont » reste un vrai nom ; « Apprenant A » ou « Stagiaire 2 » non.
  if (words.some((w) => GENERIC.test(w)) && meaningful.length === 0) return true;
  return false;
}

/** Ensemble de personnes (e-mails + noms) pour compter les stagiaires en commun. */
export class People {
  emails = new Set<string>();
  names = new Set<string>();
  add(p: DfPerson & { full_name?: string | null; first_name?: string | null; last_name?: string | null }) {
    if (p.email) this.emails.add(String(p.email).trim().toLowerCase());
    for (const n of [p.full_name, `${p.first_name || p.firstName || ''} ${p.last_name || p.lastName || ''}`]) if (n && n.trim()) this.names.add(nameKey(n));
    return this;
  }
  has(p: DfPerson) {
    return Boolean((p.email && this.emails.has(p.email.trim().toLowerCase())) || this.names.has(personKey(p)));
  }
  count(list: DfPerson[]) {
    return list.filter((p) => this.has(p)).length;
  }
}
