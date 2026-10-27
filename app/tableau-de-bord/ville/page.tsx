import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { parisToday } from '@/lib/paris-time';
import { loadCityState } from '@/lib/city/load';
import { CityApp } from '@/components/city/city-app';

export const metadata = { title: 'CF Réseaux City 3D · CF PLANNING' };

/**
 * CF Réseaux City 3D : mode facultatif du tableau de bord. La 3D n'est
 * téléchargée qu'ici (chargement différé), le tableau de bord classique
 * n'embarque rien de plus.
 */
export default async function CityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role === 'aucun') redirect('/tableau-de-bord');
  const today = parisToday();
  const supabase = await createClient();
  const state = await loadCityState(supabase, today, profile as any);
  return <CityApp initial={state} today={today} />;
}
