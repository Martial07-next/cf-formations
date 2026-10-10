import { createAdminClient } from '@/lib/supabase/admin';
import { sessionSlots, currentSlot, expectedOn, type Slot } from '@/lib/dossier';

/**
 * Émargement public (QR code) : tout passe par le serveur avec la clé
 * service_role, limité à UNE session (jeton secret) et à la demi-journée en
 * cours. Le stagiaire ne voit que les prénoms / noms des inscrits.
 */
export type SigningContext =
  | { ok: false; error: string }
  | {
      ok: true;
      sessionId: string;
      title: string;
      room: string | null;
      trainer: string | null;
      slot: Slot | null;
      nextSlot: Slot | null;
      trainees: { id: string; name: string; signed: boolean }[];
    };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function loadSigningContext(token: string): Promise<SigningContext> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, error: 'Lien d’émargement invalide.' };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: 'Émargement indisponible : configuration du serveur incomplète.' };
  }
  const { data: s } = await admin
    .from('sessions')
    .select('id, title, start_at, end_at, rooms(name), trainers(full_name)')
    .eq('sign_token', token)
    .maybeSingle();
  if (!s) return { ok: false, error: 'Ce QR code n’est plus valable. Demande au formateur de l’afficher à nouveau.' };

  const [{ data: days }, { data: links }, { data: modules }, { data: tm }] = await Promise.all([
    admin.from('session_days').select('day, start_time, end_time').eq('session_id', s.id),
    admin.from('session_trainees').select('trainee_id, status, trainees(full_name, first_name, last_name)').eq('session_id', s.id).eq('status', 'validee'),
    admin.from('session_modules').select('id, start_day, end_day').eq('session_id', s.id),
    admin.from('session_trainee_modules').select('trainee_id, module_id').eq('session_id', s.id),
  ]);
  const slots = sessionSlots(s.start_at, s.end_at, (days as any) || []);
  const slot = currentSlot(slots);
  const now = new Date().toISOString().slice(0, 10);
  const nextSlot = slot ? null : slots.find((x) => x.day >= now) || null;

  const traineeModules: Record<string, string[]> = {};
  for (const l of (tm as any[]) || []) (traineeModules[l.trainee_id] ||= []).push(l.module_id);
  const all = ((links as any[]) || []).map((l) => {
    const t: any = one(l.trainees);
    const name = t?.last_name ? `${(t.last_name as string).toUpperCase()} ${t.first_name || ''}`.trim() : t?.full_name || '';
    return { id: l.trainee_id as string, name };
  });
  let trainees: { id: string; name: string; signed: boolean }[] = [];
  if (slot) {
    const expected = new Set(expectedOn(slot.day, all.map((t) => t.id), (modules as any) || [], traineeModules));
    const { data: sigs } = await admin
      .from('attendance_signatures')
      .select('trainee_id')
      .eq('session_id', s.id)
      .eq('signer', 'stagiaire')
      .eq('day', slot.day)
      .eq('half', slot.half);
    const done = new Set(((sigs as any[]) || []).map((x) => x.trainee_id));
    trainees = all
      .filter((t) => expected.has(t.id))
      .map((t) => ({ ...t, signed: done.has(t.id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }
  return {
    ok: true,
    sessionId: s.id,
    title: s.title,
    room: (one((s as any).rooms) as any)?.name ?? null,
    trainer: (one((s as any).trainers) as any)?.full_name ?? null,
    slot,
    nextSlot,
    trainees,
  };
}

/** Signature valide : image PNG en data URL, de taille raisonnable. */
export function validSignature(v: string) {
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length > 200 && v.length < 300_000;
}
