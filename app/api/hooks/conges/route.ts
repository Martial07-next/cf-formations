import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleLeaveEvent } from '@/lib/leave-sync';

export const dynamic = 'force-dynamic';

function same(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Reçoit les congés validés de la plateforme de congés (Supabase Database
 * Webhook). Protégé par CONGES_WEBHOOK_SECRET, envoyé dans l'en-tête
 * « Authorization: Bearer <secret> ». Sans secret configuré, tout est refusé.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CONGES_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CONGES_WEBHOOK_SECRET non configuré.' }, { status: 503 });
  if (!same(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const result = await handleLeaveEvent(supabase, payload);
  await supabase
    .from('app_settings')
    .update({ absences_last_sync: new Date().toISOString(), absences_last_log: `${result.action} : ${result.detail}` })
    .eq('id', true);

  revalidatePath('/');
  revalidatePath('/equipe');
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
