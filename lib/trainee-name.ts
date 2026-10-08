export type TraineeName = { first_name: string | null; last_name: string };

/** Nom affiché : « Prénom Nom ». */
export function buildFullName(n: TraineeName): string {
  return [n.first_name?.trim(), n.last_name.trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ');
}

/** Message affiché quand la base refuse un doublon (index trainees_name_key). */
export function duplicateMessage(fullName: string) {
  return `« ${fullName} » existe déjà dans les stagiaires : un même stagiaire ne peut pas être enregistré deux fois.`;
}

export function isDuplicateError(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === '23505' || /trainees_name_key/.test(error.message || ''));
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
