'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { validDocPath, docStoragePath, type Audience } from '@/lib/documents';

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 28 (supabase/migration_phase28.sql) dans Supabase.';

function refresh() {
  revalidatePath('/administration/documents');
  revalidatePath('/salaries');
}

type DocInput = { title: string; description: string; audience: Audience; scope: 'once' | 'session'; active: boolean };

function clean(d: DocInput) {
  const title = String(d.title || '').trim().slice(0, 160);
  if (!title) return { ok: false as const, error: 'Indique le titre du document.' };
  return {
    ok: true as const,
    value: {
      title,
      description: String(d.description || '').trim().slice(0, 600) || null,
      audience: d.audience === 'salarie' ? 'salarie' : 'stagiaire',
      scope: d.scope === 'session' ? 'session' : 'once',
      active: d.active !== false,
    },
  };
}

/** Nouveau document : le PDF a déjà été déposé (documents/{id}/v1.pdf). */
export async function createDocument(id: string, input: DocInput, storagePath: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  if (!validDocPath(storagePath) || !storagePath.includes(id)) return { ok: false, error: 'Fichier invalide.' };
  const c = clean(input);
  if (!c.ok) return c;
  const supabase = await createClient();
  const { error } = await supabase.from('signable_documents').insert({ id, ...c.value, storage_path: storagePath, version: 1 });
  if (error) return { ok: false, error: MIGRATION };
  refresh();
  return { ok: true };
}

/** Titre, description, public, fréquence, activation (documents intégrés : description et activation). */
export async function updateDocument(id: string, input: DocInput): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: doc } = await supabase.from('signable_documents').select('builtin').eq('id', id).maybeSingle();
  if (!doc) return { ok: false, error: 'Document introuvable.' };
  const c = clean(input);
  if (!c.ok) return c;
  const patch = doc.builtin
    ? { description: c.value.description, active: c.value.active, title: c.value.title }
    : c.value;
  const { error } = await supabase.from('signable_documents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/**
 * Nouveau PDF pour un document ajouté. « À re-signer » : nouvelle version,
 * les signatures précédentes ne comptent plus et chacun signe à nouveau.
 */
export async function replaceDocumentFile(id: string, storagePath: string, resign: boolean): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  if (!validDocPath(storagePath) || !storagePath.includes(id)) return { ok: false, error: 'Fichier invalide.' };
  const supabase = await createClient();
  const { data: doc } = await supabase.from('signable_documents').select('builtin, version, storage_path').eq('id', id).maybeSingle();
  if (!doc || doc.builtin) return { ok: false, error: 'Le modèle d’un document intégré ne se remplace pas.' };
  const { error } = await supabase
    .from('signable_documents')
    .update({ storage_path: storagePath, version: resign ? doc.version + 1 : doc.version, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Supprime un document ajouté (et ses signatures). Les documents intégrés se désactivent. */
export async function deleteDocument(id: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: doc } = await supabase.from('signable_documents').select('builtin').eq('id', id).maybeSingle();
  if (!doc) return { ok: false, error: 'Document introuvable.' };
  if (doc.builtin) return { ok: false, error: 'Un document intégré ne se supprime pas : désactive-le.' };
  const { error } = await supabase.from('signable_documents').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  const { data: files } = await supabase.storage.from('dossiers').list(`documents/${id}`);
  if (files?.length) await supabase.storage.from('dossiers').remove(files.map((f: any) => `documents/${id}/${f.name}`));
  refresh();
  return { ok: true };
}

/** Lien temporaire vers le PDF d'un document (lecture, ou PDF signé). */
export async function documentFileUrl(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from('signable_documents').select('storage_path').eq('id', id).maybeSingle();
  if (!doc?.storage_path) return { ok: false, error: 'Aucun PDF pour ce document.' };
  const { data, error } = await supabase.storage.from('dossiers').createSignedUrl(doc.storage_path, 600);
  if (error || !data) return { ok: false, error: 'Lien indisponible.' };
  return { ok: true, url: data.signedUrl };
}

/** Supprime une signature (elle sera redemandée). */
export async function deleteDocSignature(id: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase.from('document_signatures').delete().eq('id', id).select('trainee_id, session_id').maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data?.trainee_id) revalidatePath(`/stagiaires/${data.trainee_id}`);
  if (data?.session_id) revalidatePath(`/sessions/${data.session_id}`);
  refresh();
  return { ok: true };
}

/** PDF d'une version précise d'un document (celle qui a été signée). */
export async function docVersionUrl(id: string, version: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return FORBIDDEN;
  const { data, error } = await supabase.storage.from('dossiers').createSignedUrl(docStoragePath(id, version), 600);
  if (error || !data) return { ok: false, error: 'PDF de cette version introuvable.' };
  return { ok: true, url: data.signedUrl };
}
