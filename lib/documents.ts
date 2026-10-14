/**
 * Documents à signer gérés par l'administrateur (Administration › Documents) :
 *  · documents intégrés (modèles fixes : droit à l'image, livrets, vêtements,
 *    matériel) : activables / désactivables ;
 *  · documents ajoutés (ex. règlement intérieur) : PDF déposé, signé en ligne
 *    par les stagiaires ou les salariés (une page de signature est ajoutée).
 */

export type Audience = 'stagiaire' | 'salarie';
export type Builtin = 'image' | 'livret' | 'vetements' | 'image_salarie' | 'materiel';

export type SignableDoc = {
  id: string;
  builtin: Builtin | null;
  audience: Audience;
  title: string;
  description: string | null;
  storage_path: string | null;
  version: number;
  scope: 'once' | 'session';
  active: boolean;
  position: number;
  updated_at: string;
};

export type DocSignature = {
  id: string;
  document_id: string;
  version: number;
  trainee_id: string | null;
  employee_id: string | null;
  session_id: string | null;
  signature: string;
  city: string | null;
  signed_at: string;
};

export const DOC_SELECT = 'id, builtin, audience, title, description, storage_path, version, scope, active, position, updated_at';
export const DOC_SIG_SELECT = 'id, document_id, version, trainee_id, employee_id, session_id, signature, city, signed_at';

export const AUDIENCE_LABEL: Record<Audience, string> = { stagiaire: 'Stagiaires', salarie: 'Salariés' };
export const SCOPE_LABEL = { once: 'Une seule fois', session: 'À chaque formation' } as const;

/** Document intégré actif ? (actif par défaut si la migration 28 n'est pas faite) */
export function builtinActive(docs: SignableDoc[] | null | undefined, key: Builtin): boolean {
  const d = (docs || []).find((x) => x.builtin === key);
  return d ? d.active : true;
}

/** Documents ajoutés, actifs et avec leur PDF, pour un public. */
export function customDocs(docs: SignableDoc[] | null | undefined, audience: Audience): SignableDoc[] {
  return (docs || [])
    .filter((d) => !d.builtin && d.audience === audience && d.active && d.storage_path)
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'fr'));
}

/** La signature vaut-elle pour ce document (version actuelle ; même session si « à chaque formation ») ? */
export function signatureFor(doc: SignableDoc, sigs: DocSignature[], sessionId?: string | null): DocSignature | null {
  return (
    sigs
      .filter((s) => s.document_id === doc.id && s.version === doc.version && (doc.scope === 'once' || !sessionId || s.session_id === sessionId))
      .sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0] || null
  );
}

export function missingDocs(docs: SignableDoc[], sigs: DocSignature[], sessionId?: string | null): SignableDoc[] {
  return docs.filter((d) => !signatureFor(d, sigs, sessionId));
}

/** Chemin de stockage d'un PDF déposé. */
export const docStoragePath = (id: string, version: number) => `documents/${id}/v${version}.pdf`;
export const validDocPath = (p: string) => /^documents\/[0-9a-f-]{36}\/v\d+\.pdf$/.test(p);
