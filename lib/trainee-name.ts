export type TraineeName = { first_name: string | null; last_name: string };

/** Nom affiché : « Prénom Nom ». */
export function buildFullName(n: TraineeName): string {
  return [n.first_name?.trim(), n.last_name.trim()].filter(Boolean).join(' ');
}

/** Lit Prénom / Nom d'un formulaire. */
export function readTraineeName(formData: FormData): TraineeName {
  return {
    first_name: String(formData.get('first_name') || '').trim() || null,
    last_name: String(formData.get('last_name') || '').trim(),
  };
}

/**
 * Valeurs à afficher dans un formulaire pour un stagiaire existant : un
 * stagiaire saisi avant l'ajout du prénom n'a que son nom complet, qu'on
 * propose alors dans « Nom ».
 */
export function nameFields(t: { full_name: string; first_name?: string | null; last_name?: string | null }) {
  if (t.first_name || t.last_name) return { first_name: t.first_name || '', last_name: t.last_name || '' };
  return { first_name: '', last_name: t.full_name };
}
