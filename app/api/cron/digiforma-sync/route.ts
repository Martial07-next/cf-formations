import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { runDigiformaSync } from '@/lib/digiforma-sync';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function GET(request: NextRequest) {
  // Cette route utilise la clé service_role (contourne le RLS) : elle DOIT être
  // protégée. Vercel Cron envoie "Authorization: Bearer <CRON_SECRET>".
  // Sans CRON_SECRET configuré, la route refuse tout appel.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET non configuré.' }, { status: 503 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (!sameSecret(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const result = await runDigiformaSync(adminClient);
  revalidatePath('/');
  revalidatePath('/sessions');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
