'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { PURGE_CONFIRM_PHRASE as CONFIRM_PHRASE } from '@/lib/purge';


const CATEGORIES = ['sessions', 'stagiaires', 'formateurs', 'formations', 'salles'] as const;
type Category = (typeof CATEGORIES)[number];

export type PurgeResult = { ok: true; summary: string } | { ok: false; error: string };

/**
 * Efface les données de la plateforme (administrateur uniquement).
 * Garde-fous : rôle admin vérifié côté serveur, phrase de confirmation et
 * mot de passe de l'administrateur. Les comptes utilisateurs, les paramètres
 * et la salle virtuelle « À affecter » ne sont jamais supprimés.
 */
export async function purgeData(formData: FormData): Promise<PurgeResult> {
  const admin = await requireAdmin();
  if (!admin) return FORBIDDEN;

  if (String(formData.get('confirm') || '').trim() !== CONFIRM_PHRASE) {
    return { ok: false, error: `Recopie exactement « ${CONFIRM_PHRASE} » pour confirmer.` };
  }
  const selected = CATEGORIES.filter((c) => formData.get(c) === 'on');
  if (selected.length === 0) return { ok: false, error: 'Coche au moins une catégorie à supprimer.' };

  const supabase = await createClient();

  // Vérifie le mot de passe de l'administrateur avant une action irréversible.
  const password = String(formData.get('password') || '');
  if (!password || !admin.email) return { ok: false, error: 'Saisis ton mot de passe.' };
  const { error: authError } = await supabase.auth.signInWithPassword({ email: admin.email, password });
  if (authError) return { ok: false, error: 'Mot de passe incorrect.' };

  const done: string[] = [];
  const del = async (label: string, run: () => PromiseLike<{ error: any; count: number | null }>) => {
    const { error, count } = await run();
    if (error) throw new Error(`${label} : ${error.message}`);
    done.push(`${count ?? 0} ${label}`);
  };

  try {
    // Ordre : les sessions d'abord (inscriptions et horaires suivent en cascade).
    if (selected.includes('sessions' as Category)) {
      await del('session(s)', () => supabase.from('sessions').delete({ count: 'exact' }).not('id', 'is', null));
    }
    if (selected.includes('stagiaires' as Category)) {
      await del('stagiaire(s)', () => supabase.from('trainees').delete({ count: 'exact' }).not('id', 'is', null));
    }
    if (selected.includes('formateurs' as Category)) {
      await del('formateur(s)', () => supabase.from('trainers').delete({ count: 'exact' }).not('id', 'is', null));
    }
    if (selected.includes('formations' as Category)) {
      await del('formation(s)', () => supabase.from('templates').delete({ count: 'exact' }).not('id', 'is', null));
    }
    if (selected.includes('salles' as Category)) {
      await del('salle(s)', () => supabase.from('rooms').delete({ count: 'exact' }).eq('is_holding', false));
    }
  } catch (e: any) {
    revalidatePath('/', 'layout');
    return { ok: false, error: `Suppression interrompue : ${e.message}. Déjà supprimé : ${done.join(', ') || 'rien'}.` };
  }

  revalidatePath('/', 'layout');
  return { ok: true, summary: `Supprimé : ${done.join(', ')}.` };
}
