/** Parcours POEC : types et règles partagés (pages, actions, PDF). */

export type PoecProgram = {
  id: string;
  title: string;
  reference: string | null;
  start_date: string;
  end_date: string;
  objectives: string | null;
  recruiter: string | null;
  ft_agency: string | null;
  ft_advisor: string | null;
  ft_email: string | null;
  ft_token: string | null;
  pedagogical_tutor: string | null;
  notes: string | null;
  /** POEC (France Travail) ou parcours personnalisé (migration 43, « poec » par défaut). */
  kind?: ProgramKind | null;
};

export type ProgramKind = 'poec' | 'personnalise';
export const PROGRAM_KIND_LABEL: Record<ProgramKind, string> = { poec: 'POEC', personnalise: 'Parcours personnalisé' };
export const isCustomProgram = (p: { kind?: string | null } | null | undefined) => p?.kind === 'personnalise';

export type PoecPeriod = { id: string; program_id: string; label: string; start_date: string; end_date: string };

export type Convention = {
  id: string;
  program_id: string;
  period_id: string;
  trainee_id: string;
  company_name: string | null;
  company_address: string | null;
  company_rep: string | null;
  company_rep_role: string | null;
  company_email: string | null;
  company_tutor: string | null;
  company_tutor_contact: string | null;
  missions: string | null;
  trainee_address: string | null;
  pedagogical_tutor: string | null;
  company_token: string;
  trainee_token: string;
  cf_signature: string | null;
  cf_signer: string | null;
  cf_signed_at: string | null;
  company_signature: string | null;
  company_signer: string | null;
  company_signer_role: string | null;
  company_city: string | null;
  company_signed_at: string | null;
  trainee_signature: string | null;
  trainee_city: string | null;
  trainee_signed_at: string | null;
  ft_signature: string | null;
  ft_signer: string | null;
  ft_signed_at: string | null;
};

/** Champs remplis par l'entreprise d'accueil. */
export const COMPANY_FIELDS = [
  { key: 'company_name', label: 'Raison sociale', required: true },
  { key: 'company_address', label: 'Adresse', required: true, multiline: true },
  { key: 'company_rep', label: 'Représentée par (nom)', required: true },
  { key: 'company_rep_role', label: 'Fonction', required: true },
  { key: 'company_email', label: 'E-mail de contact', required: false },
  { key: 'company_tutor', label: 'Tuteur au sein de l’entreprise', required: true },
  { key: 'company_tutor_contact', label: 'Téléphone / e-mail du tuteur', required: false },
  { key: 'missions', label: 'Missions prévues pour le stagiaire', required: false, multiline: true },
] as const;

export type CompanyField = (typeof COMPANY_FIELDS)[number]['key'];

export const CONVENTION_SELECT =
  'id, program_id, period_id, trainee_id, company_name, company_address, company_rep, company_rep_role, company_email, company_tutor, company_tutor_contact, missions, trainee_address, pedagogical_tutor, company_token, trainee_token, cf_signature, cf_signer, cf_signed_at, company_signature, company_signer, company_signer_role, company_city, company_signed_at, trainee_signature, trainee_city, trainee_signed_at, ft_signature, ft_signer, ft_signed_at';

/** Informations de l'entreprise manquantes avant sa signature. */
export function missingCompany(c: Partial<Convention>): string[] {
  return COMPANY_FIELDS.filter((f) => f.required && !String((c as any)[f.key] || '').trim()).map((f) => f.label);
}

export type ConventionStatus = 'a_remplir' | 'a_signer' | 'signee' | 'validee_ft';

/**
 * Avancement d'une convention :
 *  · à remplir : l'entreprise n'a pas encore donné ses informations ;
 *  · à signer : il manque au moins une signature (CF Réseaux, entreprise, stagiaire) ;
 *  · signée : les trois parties ont signé ; validée FT : France Travail aussi.
 */
export function conventionStatus(c: Partial<Convention>): ConventionStatus {
  if (c.cf_signed_at && c.company_signed_at && c.trainee_signed_at) return c.ft_signed_at ? 'validee_ft' : 'signee';
  if (missingCompany(c).length) return 'a_remplir';
  return 'a_signer';
}

export const CONVENTION_STATUS_LABEL: Record<ConventionStatus, string> = {
  a_remplir: 'Entreprise à compléter',
  a_signer: 'Signatures en cours',
  signee: 'Signée (3 parties)',
  validee_ft: 'Signée + France Travail',
};

/** Les signatures de la convention, dans l'ordre du document. */
export function signatureSteps(c: Partial<Convention>) {
  return [
    { key: 'cf', label: 'CF Réseaux', done: Boolean(c.cf_signed_at) },
    { key: 'company', label: 'Entreprise', done: Boolean(c.company_signed_at) },
    { key: 'trainee', label: 'Stagiaire', done: Boolean(c.trainee_signed_at) },
    { key: 'ft', label: 'France Travail', done: Boolean(c.ft_signed_at) },
  ];
}

/** Une signature déjà posée bloque la modification du contenu (sauf réinitialisation par le bureau). */
export function anySigned(c: Partial<Convention>) {
  return Boolean(c.cf_signed_at || c.company_signed_at || c.trainee_signed_at || c.ft_signed_at);
}

/** Jeton aléatoire pour les liens publics (entreprise, stagiaire, France Travail). */
export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function validToken(t: string) {
  return /^[a-f0-9]{48}$/.test(t);
}

/** « 12/05/2026 » */
export function frShort(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Semaines (lundi) couvertes par une période, pour la frise du programme. */
export function mondaysBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso + 'T00:00:00Z');
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - ((day + 6) % 7));
  const out: string[] = [];
  for (let d = start; d.toISOString().slice(0, 10) <= endIso; d = new Date(d.getTime() + 7 * 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Couleur des parcours POEC sur le planning. */
export const POEC_COLOR = '#0f766e';
