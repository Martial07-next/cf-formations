'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { safeUrl, missingTable } from '@/lib/links';

type Result = { ok: true } | { ok: false; error: string };

function readLink(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  return {
    category: get('category').slice(0, 80) || 'Documents utiles',
    label: get('label').slice(0, 120),
    url: safeUrl(get('url')),
    description: get('description').slice(0, 300) || null,
  };
}

export async function createUsefulLink(formData: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const l = readLink(formData);
  if (!l.label) return { ok: false, error: 'Donne un nom au lien.' };
  if (!l.url) return { ok: false, error: 'Adresse invalide : colle un lien commençant par https://' };
  const supabase = await createClient();
  const { data: last } = await supabase.from('useful_links').select('position').order('position', { ascending: false }).limit(1);
  const { error } = await supabase.from('useful_links').insert({ ...l, position: ((last?.[0] as any)?.position ?? -1) + 1 });
  if (error) return { ok: false, error: missingTable(error.message) };
  revalidatePath('/');
  return { ok: true };
}

export async function updateUsefulLink(id: string, formData: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const l = readLink(formData);
  if (!l.label) return { ok: false, error: 'Donne un nom au lien.' };
  if (!l.url) return { ok: false, error: 'Adresse invalide : colle un lien commençant par https://' };
  const supabase = await createClient();
  const { error } = await supabase.from('useful_links').update(l).eq('id', id);
  if (error) return { ok: false, error: missingTable(error.message) };
  revalidatePath('/');
  return { ok: true };
}

export async function deleteUsefulLink(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('useful_links').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}
