/**
 * Autorisations stagiaire dématérialisées. Chacune est signée une fois et
 * rangée dans la fiche du stagiaire : sur ses formations suivantes, il n'a
 * plus rien à remplir. (Les vêtements TST sont des prêts au cas par cas :
 * voir lib/vetements.ts.)
 */

export type AuthKind = 'image' | 'livret';

export type AuthData = {
  address?: string;
  company?: string;
  memoformat?: boolean;
  livret_pv?: boolean;
  autres?: string;
};

export type Authorization = {
  id: string;
  trainee_id: string;
  kind: AuthKind;
  data: AuthData;
  accepted: boolean;
  signature: string | null;
  city: string | null;
  signed_at: string;
  session_id: string | null;
  collected_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
};

export const AUTH_SELECT = 'id, trainee_id, kind, data, accepted, signature, city, signed_at, session_id, collected_by, returned_at, returned_by';

export const AUTH_KINDS: {
  kind: AuthKind;
  label: string;
  short: string;
  /** Texte d'aide pour le stagiaire. */
  intro: string;
  /** Peut être restitué (vêtements, livrets prêtés). */
  returnable: boolean;
  template: string;
}[] = [
  {
    kind: 'image',
    label: 'Autorisation de droit à l’image',
    short: 'Droit à l’image',
    intro: 'Photos et vidéos réalisées pendant la formation (site, réseaux sociaux…). Tu peux accepter ou refuser.',
    returnable: false,
    template: '/templates/autorisation-image.pdf',
  },
  {
    kind: 'livret',
    label: 'Attestation de remise des livrets de formation',
    short: 'Remise des livrets',
    intro: 'Les documents pédagogiques remis au début de la formation.',
    returnable: true,
    template: '/templates/remise-livrets.pdf',
  },
];

export const AUTH_KIND = Object.fromEntries(AUTH_KINDS.map((k) => [k.kind, k])) as Record<AuthKind, (typeof AUTH_KINDS)[number]>;

export function isAuthKind(v: string): v is AuthKind {
  return v === 'image' || v === 'livret';
}

/** Autorisations demandées sur une session : celles de la session, sinon celles de la formation. */
export function sessionKinds(sessionKindsValue: string[] | null | undefined, templateKinds: string[] | null | undefined): AuthKind[] {
  const list = sessionKindsValue ?? templateKinds ?? ['image'];
  return AUTH_KINDS.map((k) => k.kind).filter((k) => list.includes(k));
}

/** Autorisation encore valable pour ce stagiaire : la dernière signée. */
export function currentAuth(list: Authorization[], kind: AuthKind): Authorization | null {
  const mine = list.filter((a) => a.kind === kind).sort((a, b) => b.signed_at.localeCompare(a.signed_at));
  const last = mine[0] || null;
  return last;
}

/** Ce qu'il reste à remplir pour un stagiaire sur une session. */
export function missingKinds(kinds: AuthKind[], list: Authorization[]): AuthKind[] {
  return kinds.filter((k) => !currentAuth(list, k));
}

export function validAuthData(kind: AuthKind, raw: any): AuthData {
  const s = (v: unknown, n = 300) => String(v ?? '').trim().slice(0, n);
  if (kind === 'image') return { address: s(raw?.address) };
  return { company: s(raw?.company), memoformat: !!raw?.memoformat, livret_pv: !!raw?.livret_pv, autres: s(raw?.autres) };
}

/** Champs manquants avant signature. */
export function authMissing(kind: AuthKind, d: AuthData, accepted = true): string[] {
  if (kind === 'image') return d.address ? [] : ['adresse'];
  void accepted;
  return d.memoformat || d.livret_pv || d.autres ? [] : ['au moins un document reçu'];
}

export const frDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');
