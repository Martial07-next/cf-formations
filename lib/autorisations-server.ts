import { createAdminClient } from '@/lib/supabase/admin';
import { AUTH_SELECT, missingKinds, sessionKinds, type AuthKind, type Authorization } from '@/lib/autorisations';
import { builtinActive, customDocs, missingDocs } from '@/lib/documents';
import { loadDocs, loadDocSignatures, docUrls } from '@/lib/documents-server';

/**
 * Page publique des autorisations (QR code de la session) : lecture côté
 * serveur avec la clé service_role, après contrôle du jeton.
 */

export type AutorTrainee = {
  id: string;
  name: string;
  company: string | null;
  address: string | null;
  missing: AuthKind[];
  /** Documents ajoutés par l'administrateur (ex. règlement intérieur) à signer. */
  docs: { id: string; title: string; description: string | null; version: number; url: string | null }[];
  /** Vêtements TST prêtés sur cette session, pas encore signés. */
  loans: { id: string; vestes: number; pantalons: number }[];
  /** Droit à l'image refusé (à savoir pour les photos). */
  imageRefused: boolean;
};

export type AutorContext =
  | { ok: true; sessionId: string; title: string; kinds: AuthKind[]; trainees: AutorTrainee[] }
  | { ok: false; error: string };

export function validAutorToken(t: string) {
  return /^[A-Za-z0-9_-]{24,64}$/.test(t);
}

/** Autorisations déjà signées par un ensemble de stagiaires (toutes formations confondues). */
export async function loadAuthorizations(client: { from: (t: string) => any }, traineeIds: string[]): Promise<Authorization[]> {
  if (!traineeIds.length) return [];
  const out: Authorization[] = [];
  for (let i = 0; i < traineeIds.length; i += 200) {
    const { data, error } = await client.from('trainee_authorizations').select(AUTH_SELECT).in('trainee_id', traineeIds.slice(i, i + 200));
    if (error) return [];
    out.push(...((data as Authorization[]) || []));
  }
  return out;
}

export async function loadAutorContext(token: string): Promise<AutorContext> {
  if (!validAutorToken(token)) return { ok: false, error: 'Lien invalide.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Service momentanément indisponible.' };
  }
  const { data: s } = await admin
    .from('sessions')
    .select('id, title, authorizations, templates(authorizations), session_trainees(status, trainee_id, trainees(full_name, company, address))')
    .eq('autor_token', token)
    .maybeSingle();
  if (!s) return { ok: false, error: 'Ce QR code n’est plus valide. Demande le nouveau QR code au formateur.' };
  const tpl = Array.isArray((s as any).templates) ? (s as any).templates[0] : (s as any).templates;
  const allDocs = await loadDocs(admin);
  const kinds = sessionKinds((s as any).authorizations, tpl?.authorizations).filter((k) => builtinActive(allDocs, k));
  const customs = customDocs(allDocs, 'stagiaire');
  const enrolled = (((s as any).session_trainees as any[]) || [])
    .filter((t) => t.status === 'validee')
    .map((t) => ({ id: t.trainee_id as string, t: Array.isArray(t.trainees) ? t.trainees[0] : t.trainees }));
  const auths = await loadAuthorizations(admin, enrolled.map((e) => e.id));
  const [docSigs, urls] = await Promise.all([
    loadDocSignatures(admin, 'trainee_id', enrolled.map((e) => e.id)),
    customs.length ? docUrls(admin, customs) : Promise.resolve({} as Record<string, string>),
  ]);
  // Prêts de vêtements à signer (migration 27) ; ignorés si la table manque.
  const { data: loanRows } = await admin.from('clothing_loans').select('id, trainee_id, vestes, pantalons').eq('session_id', (s as any).id).is('signed_at', null);
  return {
    ok: true,
    sessionId: (s as any).id,
    title: (s as any).title,
    kinds,
    trainees: enrolled
      .map((e) => {
        const mine = auths.filter((a) => a.trainee_id === e.id);
        const lastImage = mine.filter((a) => a.kind === 'image').sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0];
        return {
          id: e.id,
          name: e.t?.full_name || 'Stagiaire',
          company: e.t?.company || null,
          address: e.t?.address || null,
          missing: missingKinds(kinds, mine),
          docs: missingDocs(customs, docSigs.filter((x) => x.trainee_id === e.id), (s as any).id).map((d) => ({
            id: d.id, title: d.title, description: d.description, version: d.version, url: urls[d.id] || null,
          })),
          loans: ((loanRows as any[]) || []).filter((l) => l.trainee_id === e.id).map((l) => ({ id: l.id, vestes: l.vestes, pantalons: l.pantalons })),
          imageRefused: lastImage ? !lastImage.accepted : false,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}
