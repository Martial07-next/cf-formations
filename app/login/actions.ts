'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { normalizeEmail, verifyTurnstile } from '@/lib/turnstile';

export async function login(formData: FormData) {
  const rawSuite = String(formData.get('suite') || '');
  const keep = rawSuite ? `&suite=${encodeURIComponent(rawSuite)}` : '';
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (!(await verifyTurnstile(formData, ip))) {
    redirect(`/login?error=${encodeURIComponent('Vérification anti-robot non validée : réessaie.')}${keep}`);
  }
  const supabase = await createClient();
  // « pnom » → pnom@cf-reseaux.fr
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') || '');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /invalid login credentials/i.test(error.message) ? 'Identifiant ou mot de passe incorrect.' : error.message;
    redirect(`/login?error=${encodeURIComponent(msg)}${keep}`);
  }

  revalidatePath('/', 'layout');
  // Retour à la page demandée avant la connexion (chemin interne uniquement).
  const suite = String(formData.get('suite') || '');
  redirect(/^\/(?!\/)[^\s\\]*$/.test(suite) && !suite.startsWith('/login') ? suite : '/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
