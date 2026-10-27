import { NextResponse } from 'next/server';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { loadCityState } from '@/lib/city/load';

/** État de CF Réseaux City pour une date (lecture seule, droits du compte connecté). */
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role === 'aucun') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const date = new URL(req.url).searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Date invalide' }, { status: 400 });
  const supabase = await createClient();
  const state = await loadCityState(supabase, date, profile as any);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
