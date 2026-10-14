import { createAdminClient } from '@/lib/supabase/admin';
import { CONVENTION_SELECT, validToken, type Convention, type PoecPeriod } from '@/lib/poec';
import type { Legal } from '@/lib/pdf-brand';

/**
 * Accès public (sans compte) aux conventions POEC : l'entreprise d'accueil, le
 * stagiaire et France Travail ouvrent un lien personnel. Le serveur lit les
 * données avec la clé service_role, après avoir vérifié le jeton du lien.
 * Les jetons des autres parties ne sont jamais renvoyés au navigateur.
 */

export type Party = 'company' | 'trainee';

export type Director = { name: string; title: string };

export type PublicConvention = {
  party: Party;
  convention: Convention;
  traineeName: string;
  period: PoecPeriod;
  programTitle: string;
  director: Director;
  legal: Legal;
};

export async function loadSettings(admin: ReturnType<typeof createAdminClient>): Promise<{ director: Director; legal: Legal }> {
  const { data } = await admin.from('app_settings').select('*').limit(1).maybeSingle();
  const s = (data as any) || {};
  return {
    director: { name: s.director_name || 'Madame Aurélie Lancelle', title: s.director_title || 'Directrice de CF Réseaux' },
    legal: { siret: s.siret || null, nda: s.nda || null, city: s.signature_city || 'Cuincy' },
  };
}

/** Masque les jetons et, pour le stagiaire, les données de contact de l'entreprise inutiles. */
export function stripTokens(c: Convention): Convention {
  return { ...c, company_token: '', trainee_token: '' };
}

export async function loadConventionByToken(token: string): Promise<{ ok: true; value: PublicConvention } | { ok: false; error: string }> {
  if (!validToken(token)) return { ok: false, error: 'Lien invalide.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Service momentanément indisponible.' };
  }
  const { data, error } = await admin
    .from('poec_conventions')
    .select(CONVENTION_SELECT)
    .or(`company_token.eq.${token},trainee_token.eq.${token}`)
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'Ce lien n’est plus valide. Demande un nouveau lien à CF Réseaux.' };
  const c = data as unknown as Convention;
  const party: Party = c.company_token === token ? 'company' : 'trainee';
  const [{ data: trainee }, { data: period }, { data: program }, settings] = await Promise.all([
    admin.from('trainees').select('full_name').eq('id', c.trainee_id).maybeSingle(),
    admin.from('poec_periods').select('id, program_id, label, start_date, end_date').eq('id', c.period_id).maybeSingle(),
    admin.from('poec_programs').select('title').eq('id', c.program_id).maybeSingle(),
    loadSettings(admin),
  ]);
  if (!period) return { ok: false, error: 'Période de stage introuvable.' };
  return {
    ok: true,
    value: {
      party,
      convention: stripTokens(c),
      traineeName: (trainee as any)?.full_name || 'Stagiaire',
      period: period as PoecPeriod,
      programTitle: (program as any)?.title || 'POEC',
      ...settings,
    },
  };
}
