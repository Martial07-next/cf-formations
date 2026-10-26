import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncCongesAndLog } from '@/lib/conges-sync';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function same(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Synchronisation quotidienne des congés (Vercel Cron, protégée par CRON_SECRET). */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET non configuré.' }, { status: 503 });
  if (!same(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await syncCongesAndLog(createAdminClient());
  revalidatePath('/');
  revalidatePath('/equipe');
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
