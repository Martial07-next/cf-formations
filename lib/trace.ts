/**
 * Registre de traçabilité (migration 79) : droits à l'image, prêts de
 * vêtements / baudriers, livrets, documents signés, matériel des salariés.
 * Partie commune (libellés), utilisable côté client.
 */

export type TraceEntity = 'image' | 'livret' | 'pret' | 'document' | 'salarie_image' | 'salarie_materiel';
export type TraceChannel = 'tablette' | 'qr' | 'lien' | 'bureau';

export type TraceRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  entity: TraceEntity;
  action: string;
  record_id: string | null;
  trainee_id: string | null;
  employee_id: string | null;
  session_id: string | null;
  person_name: string | null;
  channel: TraceChannel | null;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  signature_hash: string | null;
};

export const TRACE_ENTITY_LABEL: Record<TraceEntity, string> = {
  image: 'Droit à l’image',
  livret: 'Remise des livrets',
  pret: 'Prêt (vêtements / baudriers)',
  document: 'Document signé',
  salarie_image: 'Droit à l’image (salarié)',
  salarie_materiel: 'Matériel (salarié)',
};

export const TRACE_ACTION_LABEL: Record<string, string> = {
  cree: 'Créé',
  prete: 'Prêt enregistré',
  signe: 'Signé',
  accord: 'Accord donné',
  refus: 'Refus',
  retire: 'Accord retiré',
  restitue: 'Restitué',
  restitue_incomplet: 'Restitué (incomplet)',
  annule_retour: 'Retour annulé',
  qr: 'QR code de signature créé',
  demande: 'Signature demandée',
  supprime: 'Supprimé',
};

export const TRACE_CHANNEL_LABEL: Record<TraceChannel, string> = {
  tablette: 'sur la tablette',
  qr: 'par QR code (téléphone)',
  lien: 'par lien personnel',
  bureau: 'par le bureau',
};

/** Qui a fait l'action : un compte de l'équipe, sinon la personne elle-même (signature sans compte). */
export function traceActor(r: Pick<TraceRow, 'actor_name' | 'person_name' | 'action'>) {
  if (r.actor_name) return r.actor_name;
  return r.person_name ? `${r.person_name} (signature)` : 'Signature sans compte';
}

/** Appareil lisible depuis le user-agent (« iPhone · Safari »). */
export function deviceOf(ua: string | null | undefined) {
  const u = String(ua || '');
  if (!u) return '';
  const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : '';
  const br = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ');
}

/** Droit à l'image utilisable : accordé et pas retiré depuis. */
export function imageAllowed(a: { accepted: boolean; data?: any } | null | undefined) {
  return Boolean(a && a.accepted && !a.data?.revoked_at);
}
