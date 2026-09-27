import { NextRequest, NextResponse } from 'next/server';
import { runDigiformaSync } from '@/app/administration/integrations/sync-actions';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Vercel Cron ajoute automatiquement ce header avec CRON_SECRET — on vérifie
  // pour empêcher n'importe qui de déclencher la synchro en visitant l'URL.
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Pas de session utilisateur ici (appel serveur→serveur) : on utilise un
  // client service_role dédié qui contourne le RLS, au lieu du client normal.
  const adminClient = createAdminClient();
  const result = await runDigiformaSync(adminClient as any);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
