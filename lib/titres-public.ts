import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Page publique de dépôt du titre d'habilitation (QR code) : jeton secret de
 * la session, valable jusqu'à 30 jours après la fin. Le stagiaire ne voit que
 * les noms des inscrits validés et s'il a déjà déposé un fichier.
 */
export type TitleContext =
  | { ok: false; error: string }
  | { ok: true; title: string; period: string; trainer: string | null; trainees: { id: string; name: string; files: number }[] };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const fr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export async function loadTitleContext(token: string): Promise<TitleContext> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'Lien invalide.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Service indisponible : configuration du serveur incomplète.' };
  }
  const { data: s } = await admin.from('sessions').select('id, title, start_at, end_at, trainers(full_name)').eq('title_token', token).maybeSingle();
  if (!s || Date.now() > new Date(s.end_at).getTime() + 30 * 86400000) {
    return { ok: false, error: 'Ce QR code n’est plus valable. Demande au formateur de l’afficher à nouveau.' };
  }
  const [{ data: links }, { data: files }] = await Promise.all([
    admin.from('session_trainees').select('trainee_id, trainees(full_name, first_name, last_name)').eq('session_id', s.id).eq('status', 'validee'),
    admin.from('habilitation_titles').select('trainee_id').eq('session_id', s.id),
  ]);
  const count: Record<string, number> = {};
  for (const f of (files as any[]) || []) count[f.trainee_id] = (count[f.trainee_id] || 0) + 1;
  const trainees = ((links as any[]) || [])
    .map((l) => {
      const t: any = one(l.trainees);
      const name = t?.last_name ? `${(t.last_name as string).toUpperCase()} ${t.first_name || ''}`.trim() : t?.full_name || '';
      return { id: l.trainee_id as string, name, files: count[l.trainee_id] || 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const period = s.start_at.slice(0, 10) === s.end_at.slice(0, 10) ? `Le ${fr(s.start_at)}` : `Du ${fr(s.start_at)} au ${fr(s.end_at)}`;
  return { ok: true, title: s.title, period, trainer: (one((s as any).trainers) as any)?.full_name ?? null, trainees };
}
