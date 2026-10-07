import type { TraineeName } from '@/lib/trainee-name';

export type NameOrder = 'nom_prenom' | 'prenom_nom';

/**
 * Lit une liste de stagiaires collée depuis Excel/Word/un e-mail :
 * une personne par ligne, colonnes séparées par tabulation, « ; » ou « , »
 * (ex. « DUPONT⇥Jean »), ou bien « DUPONT Jean » sur une seule colonne.
 * Une 3e colonne contenant un « @ » est lue comme e-mail. Pas d'entreprise requise.
 */
export function parseNameList(text: string, order: NameOrder): { name: TraineeName; email: string | null; line: number }[] {
  const out: { name: TraineeName; email: string | null; line: number }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let cols = line.split(/\t|;|,/).map((c) => c.trim()).filter(Boolean);
    // Ligne d'en-tête (« Nom ⇥ Prénom ») ignorée.
    if (i === 0 && cols.every((c) => /^(nom|pr[ée]nom|e-?mail|mail|name|first ?name|last ?name)$/i.test(c))) return;

    const email = cols.find((c) => c.includes('@')) || null;
    cols = cols.filter((c) => c !== email);
    if (cols.length === 1) {
      // « DUPONT Jean » ou « Jean Dupont » : on coupe au premier espace selon l'ordre choisi.
      const parts = cols[0].split(/\s+/);
      if (parts.length > 1) cols = order === 'nom_prenom' ? [parts[0], parts.slice(1).join(' ')] : [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
    }
    const [a, b] = cols;
    const name: TraineeName =
      cols.length < 2
        ? { first_name: null, last_name: a || '' }
        : order === 'nom_prenom'
          ? { last_name: a, first_name: b }
          : { first_name: a, last_name: b };
    if (name.last_name) out.push({ name, email, line: i + 1 });
  });
  return out;
}
