'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { safeUrl, missingTable } from '@/lib/links';

function readTemplate(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const maxRaw = get('max_trainees');
  return {
    title: get('title'),
    folder_id: get('folder_id') || null, // dossier ou sous-dossier de la formation
    // Saisie en heures + minutes (ex. 7 h 30), stockée en heures décimales.
    duration_hours: Math.max(0, Number.parseInt(get('duration_h') || '0', 10) || 0) + (Number.parseInt(get('duration_min') || '0', 10) || 0) / 60,
    max_trainees: maxRaw ? Number(maxRaw) : null,
    description: get('description') || null,
  };
}

/** Modules (JSON du formulaire) et formateurs habilités. */
function readExtras(formData: FormData) {
  let modules: { name: string; duration_hours: number }[] = [];
  try {
    const raw = JSON.parse(String(formData.get('modules_json') || '[]'));
    if (Array.isArray(raw)) {
      modules = raw
        .map((m: any) => ({ name: String(m?.name || '').trim().slice(0, 80), duration_hours: Number(m?.duration_hours) }))
        .filter((m) => m.name && m.duration_hours > 0)
        .slice(0, 30);
    }
  } catch {
    /* champ absent ou invalide : pas de modules */
  }
  const trainerIds = [...new Set(formData.getAll('trainer_ids').map(String).filter(Boolean))];
  return { modules, trainerIds };
}

async function saveExtras(supabase: Awaited<ReturnType<typeof createClient>>, templateId: string, formData: FormData) {
  const { modules, trainerIds } = readExtras(formData);
  const del1 = await supabase.from('template_modules').delete().eq('template_id', templateId);
  if (del1.error) return del1.error.message;
  if (modules.length) {
    const { error } = await supabase
      .from('template_modules')
      .insert(modules.map((m, position) => ({ ...m, position, template_id: templateId })));
    if (error) return error.message;
  }
  const del2 = await supabase.from('template_trainers').delete().eq('template_id', templateId);
  if (del2.error) return del2.error.message;
  if (trainerIds.length) {
    const { error } = await supabase.from('template_trainers').insert(trainerIds.map((trainer_id) => ({ template_id: templateId, trainer_id })));
    if (error) return error.message;
  }
  return null;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Liens de la formation (supports de cours, documents…) : remplace la liste enregistrée. */
async function saveLinks(supabase: Client, templateId: string, formData: FormData): Promise<string | null> {
  if (!formData.has('links_json')) return null;
  let raw: any[] = [];
  try {
    raw = JSON.parse(String(formData.get('links_json') || '[]'));
  } catch {
    return 'Liste de liens illisible.';
  }
  if (!Array.isArray(raw)) raw = [];
  const links: { label: string; url: string }[] = [];
  for (const l of raw.slice(0, 40)) {
    const label = String(l?.label || '').trim().slice(0, 120);
    const url = safeUrl(String(l?.url || ''));
    if (!label && !String(l?.url || '').trim()) continue;
    if (!url) return `Lien « ${label || l?.url} » : adresse invalide (elle doit commencer par https://).`;
    links.push({ label: label || new URL(url).hostname, url });
  }
  const del = await supabase.from('template_links').delete().eq('template_id', templateId);
  if (del.error) return links.length ? missingTable(del.error.message) : null;
  if (links.length) {
    const { error } = await supabase
      .from('template_links')
      .insert(links.map((l, position) => ({ ...l, position, template_id: templateId })));
    if (error) return missingTable(error.message);
  }
  return null;
}

/** Libellé « Dossier › Sous-dossier » d'un dossier (conservé dans templates.category pour l'affichage et la recherche). */
async function folderPath(supabase: Client, folderId: string | null): Promise<string | null> {
  if (!folderId) return null;
  const { data: f } = await supabase.from('template_folders').select('name, parent_id').eq('id', folderId).maybeSingle();
  if (!f) return null;
  if (!f.parent_id) return f.name;
  const { data: p } = await supabase.from('template_folders').select('name').eq('id', f.parent_id).maybeSingle();
  return p ? `${p.name} › ${f.name}` : f.name;
}

/** Dernière position + 1 dans un dossier. */
async function nextPosition(supabase: Client, table: 'templates' | 'template_folders', column: 'folder_id' | 'parent_id', id: string | null) {
  let q = supabase.from(table).select('position').order('position', { ascending: false }).limit(1);
  q = id ? q.eq(column, id) : q.is(column, null);
  const { data } = await q;
  return ((data?.[0] as any)?.position ?? -1) + 1;
}

function refresh() {
  revalidatePath('/modeles');
  revalidatePath('/');
}

export async function createTemplate(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et durée (supérieure à 0) requis.' };
  const supabase = await createClient();
  const position = await nextPosition(supabase, 'templates', 'folder_id', t.folder_id);
  const { data, error } = await supabase
    .from('templates')
    .insert({ ...t, category: await folderPath(supabase, t.folder_id), position })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  const extraError = await saveExtras(supabase, data.id, formData);
  const linkError = await saveLinks(supabase, data.id, formData);
  refresh();
  if (extraError) return { ok: false, error: `Formation créée, mais modules/formateurs non enregistrés : ${extraError}` };
  if (linkError) return { ok: false, error: `Formation créée, mais liens non enregistrés : ${linkError}` };
  return { ok: true };
}

export async function updateTemplate(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const t = readTemplate(formData);
  if (!t.title || !(t.duration_hours > 0)) return { ok: false, error: 'Nom et durée (supérieure à 0) requis.' };
  const supabase = await createClient();
  const { data: before } = await supabase.from('templates').select('folder_id').eq('id', id).maybeSingle();
  const moved = (before?.folder_id ?? null) !== t.folder_id;
  const { error } = await supabase
    .from('templates')
    .update({
      ...t,
      category: await folderPath(supabase, t.folder_id),
      // Changement de dossier : la formation se place à la fin de son nouveau dossier.
      ...(moved ? { position: await nextPosition(supabase, 'templates', 'folder_id', t.folder_id) } : {}),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  const extraError = await saveExtras(supabase, id, formData);
  const linkError = await saveLinks(supabase, id, formData);
  refresh();
  if (extraError) return { ok: false, error: `Formation enregistrée, mais modules/formateurs non enregistrés : ${extraError}` };
  if (linkError) return { ok: false, error: `Formation enregistrée, mais liens non enregistrés : ${linkError}` };
  return { ok: true };
}

export async function deleteTemplate(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------
// Dossiers et sous-dossiers (un seul niveau de sous-dossier)
// ------------------------------------------------------------

type Result = { ok: true } | { ok: false; error: string };

export async function createFolder(name: string, parentId: string | null): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, error: 'Indique le nom du dossier.' };
  const supabase = await createClient();
  if (parentId) {
    const { data: parent } = await supabase.from('template_folders').select('parent_id').eq('id', parentId).maybeSingle();
    if (!parent) return { ok: false, error: 'Dossier parent introuvable.' };
    if (parent.parent_id) return { ok: false, error: 'Un sous-dossier ne peut pas contenir d’autre sous-dossier.' };
  }
  const position = await nextPosition(supabase, 'template_folders', 'parent_id', parentId);
  const { error } = await supabase.from('template_folders').insert({ name: clean, parent_id: parentId, position });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Met à jour le libellé « Dossier › Sous-dossier » des formations concernées. */
async function syncCategories(supabase: Client, folderId: string) {
  const { data: subs } = await supabase.from('template_folders').select('id').eq('parent_id', folderId);
  for (const id of [folderId, ...(subs || []).map((x: any) => x.id)]) {
    await supabase.from('templates').update({ category: await folderPath(supabase, id) }).eq('folder_id', id);
  }
}

export async function renameFolder(id: string, name: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false, error: 'Indique le nom du dossier.' };
  const supabase = await createClient();
  const { error } = await supabase.from('template_folders').update({ name: clean }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  await syncCategories(supabase, id);
  refresh();
  return { ok: true };
}

export async function deleteFolder(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const [{ count: subCount }, { count: tplCount }] = await Promise.all([
    supabase.from('template_folders').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    supabase.from('templates').select('id', { count: 'exact', head: true }).eq('folder_id', id),
  ]);
  if (subCount || tplCount) return { ok: false, error: 'Le dossier n’est pas vide : déplace ou supprime d’abord son contenu.' };
  const { error } = await supabase.from('template_folders').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Déplace un élément d'un cran (−1 = vers le haut, +1 = vers le bas) parmi ses voisins. */
async function moveAmong(
  supabase: Client,
  table: 'templates' | 'template_folders',
  column: 'folder_id' | 'parent_id',
  id: string,
  direction: -1 | 1
): Promise<Result> {
  const { data: item } = await supabase.from(table).select(`id, ${column}`).eq('id', id).maybeSingle();
  if (!item) return { ok: false, error: 'Élément introuvable.' };
  const parent = (item as any)[column] as string | null;
  let q = supabase.from(table).select('id, position').order('position').order(table === 'templates' ? 'title' : 'name');
  q = parent ? q.eq(column, parent) : q.is(column, null);
  const { data: siblings } = await q;
  const list = (siblings || []).map((x: any) => x.id as string);
  const i = list.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumérote proprement toute la liste (0, 1, 2…).
  for (let k = 0; k < list.length; k++) {
    const { error } = await supabase.from(table).update({ position: k }).eq('id', list[k]);
    if (error) return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true };
}

export async function moveFolder(id: string, direction: -1 | 1): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  return moveAmong(await createClient(), 'template_folders', 'parent_id', id, direction);
}

export async function moveTemplate(id: string, direction: -1 | 1): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  return moveAmong(await createClient(), 'templates', 'folder_id', id, direction);
}
