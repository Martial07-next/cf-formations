import { createAdminClient } from '@/lib/supabase/admin';
import { AUTH_SELECT, missingKinds, sessionKinds, type AuthKind, type Authorization } from '@/lib/autorisations';

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
  const kinds = sessionKinds((s as any).authorizations, tpl?.authorizations);
  const enrolled = (((s as any).session_trainees as any[]) || [])
    .filter((t) => t.status === 'validee')
    .map((t) => ({ id: t.trainee_id as string, t: Array.isArray(t.trainees) ? t.trainees[0] : t.trainees }));
  const auths = await loadAuthorizations(admin, enrolled.map((e) => e.id));
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
          imageRefused: lastImage ? !lastImage.accepted : false,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}
