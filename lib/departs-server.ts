import { createAdminClient } from '@/lib/supabase/admin';
import { validAutorToken } from '@/lib/autorisations-server';
import { departureAllowed } from '@/lib/departs';

/** Page publique du départ anticipé : session du jeton (QR code), stagiaires validés. */
export type DepartContext =
  | { ok: true; sessionId: string; title: string; formationTitle: string; allowed: boolean; trainees: { id: string; name: string }[] }
  | { ok: false; error: string };

export async function loadDepartContext(token: string): Promise<DepartContext> {
  if (!validAutorToken(token)) return { ok: false, error: 'Lien invalide.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Service momentanément indisponible.' };
  }
  const { data: s } = await admin
    .from('sessions')
    .select('id, title, template_id, session_trainees(status, trainee_id, trainees(full_name, first_name, last_name))')
    .eq('autor_token', token)
    .maybeSingle();
  if (!s) return { ok: false, error: 'Ce QR code n’est plus valide. Demande le nouveau QR code au formateur.' };
  let tpl: any = null;
  if ((s as any).template_id) {
    const { data, error } = await admin.from('templates').select('title, early_departure').eq('id', (s as any).template_id).maybeSingle();
    tpl = error ? (await admin.from('templates').select('title').eq('id', (s as any).template_id).maybeSingle()).data : data;
  }
  const formationTitle = (tpl?.title as string) || (s as any).title;
  const trainees = (((s as any).session_trainees as any[]) || [])
    .filter((t) => t.status === 'validee')
    .map((t) => {
      const p = Array.isArray(t.trainees) ? t.trainees[0] : t.trainees;
      const name = p?.last_name ? `${String(p.last_name).toUpperCase()} ${p.first_name || ''}`.trim() : p?.full_name || 'Stagiaire';
      return { id: t.trainee_id as string, name };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return {
    ok: true,
    sessionId: (s as any).id,
    title: (s as any).title,
    formationTitle,
    allowed: departureAllowed(tpl?.early_departure, formationTitle),
    trainees,
  };
}
