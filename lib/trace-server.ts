import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/supabase/server';
import type { TraceChannel, TraceEntity } from '@/lib/trace';

export type TraceInput = {
  entity: TraceEntity;
  action: string;
  recordId?: string | null;
  traineeId?: string | null;
  employeeId?: string | null;
  sessionId?: string | null;
  personName?: string | null;
  channel?: TraceChannel | null;
  detail?: string | null;
  /** Signature (data URL) : seule son empreinte SHA-256 est gardée dans le journal. */
  signature?: string | null;
  /** État de la ligne : les images de signature sont retirées. */
  snapshot?: Record<string, unknown> | null;
  /** Action faite sans compte (page QR / lien) : pas d'auteur de l'équipe. */
  anonymous?: boolean;
};

const strip = (o: Record<string, unknown> | null | undefined) => {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (/signature|token/i.test(k)) out[k] = v ? '[présente]' : null;
    else out[k] = v;
  }
  return out;
};

export const signatureHash = (sig: string | null | undefined) => (sig ? createHash('sha256').update(sig).digest('hex') : null);

/**
 * Note une action dans le registre de traçabilité (migration 79). Ne bloque
 * jamais l'action : sans la migration, rien n'est noté.
 */
export async function logTrace(input: TraceInput | TraceInput[]) {
  const list = Array.isArray(input) ? input : [input];
  if (!list.length) return;
  try {
    const h = await headers();
    const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim().slice(0, 60) || null;
    const ua = (h.get('user-agent') || '').slice(0, 300) || null;
    const profile = list.every((x) => x.anonymous) ? null : await getCurrentProfile();
    const admin = createAdminClient();
    let names = new Map<string, string>();
    const tids = [...new Set(list.filter((x) => x.traineeId && !x.personName).map((x) => x.traineeId as string))];
    if (tids.length) {
      const { data } = await admin.from('trainees').select('id, full_name').in('id', tids);
      names = new Map(((data as any[]) || []).map((t) => [t.id, t.full_name]));
    }
    const eids = [...new Set(list.filter((x) => x.employeeId && !x.personName).map((x) => x.employeeId as string))];
    if (eids.length) {
      const { data } = await admin.from('employees').select('id, full_name').in('id', eids);
      for (const e of (data as any[]) || []) names.set(e.id, e.full_name);
    }
    await admin.from('trace_log').insert(
      list.map((x) => ({
        actor_id: x.anonymous ? null : profile?.id || null,
        actor_name: x.anonymous ? null : (profile as any)?.full_name || null,
        entity: x.entity,
        action: x.action,
        record_id: x.recordId || null,
        trainee_id: x.traineeId || null,
        employee_id: x.employeeId || null,
        session_id: x.sessionId || null,
        person_name: x.personName || names.get(x.traineeId || x.employeeId || '') || null,
        channel: x.channel || null,
        detail: x.detail ? String(x.detail).slice(0, 500) : null,
        ip,
        user_agent: ua,
        signature_hash: signatureHash(x.signature),
        snapshot: strip(x.snapshot),
      }))
    );
  } catch {
    // Registre indisponible (migration 79 absente) : l'action reste valable.
  }
}
