import { NextResponse } from 'next/server';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { loadTodoItems } from '@/lib/todo-items';

export const dynamic = 'force-dynamic';

/** Compteur du menu « À faire » (équipe). */
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) return NextResponse.json({ count: 0, urgent: 0 });
  const supabase = await createClient();
  const items = await loadTodoItems(supabase as any, profile, new URL(req.url).origin);
  return NextResponse.json({ count: items.length, urgent: items.filter((i) => i.urgency >= 3).length }, { headers: { 'Cache-Control': 'private, no-store' } });
}
