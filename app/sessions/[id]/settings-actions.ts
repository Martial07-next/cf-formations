'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { loadTemplateForEdit } from '@/lib/template-edit';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 62 (supabase/migration_phase62.sql) dans Supabase.';

/**
 * Roue crantée de la fiche session : paramètres propres à la session.
 *  · déjà personnalisée → sa formation propre ;
 *  · formation du catalogue → copie (modules, formateurs, supports, documents, options) ;
 *  · sans formation → formation vierge au nom et à la durée de la session.
 * La copie n'apparaît pas dans le catalogue ; le catalogue n'est jamais modifié.
 */
export async function ensureSessionSettings(sessionId: string): Promise<Result<{ template: any }>> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: session } = await supabase.from('sessions').select('id, title, template_id, start_at, end_at').eq('id', sessionId).maybeSingle();
  if (!session) return { ok: false, error: 'Session introuvable.' };
  const probe = await supabase.from('templates').select('session_only').limit(1);
  if (probe.error) return { ok: false, error: MIGRATION };

  if ((session as any).template_id) {
    const { data: cur } = await supabase.from('templates').select('*').eq('id', (session as any).template_id).maybeSingle();
    if (cur && (cur as any).session_only) {
      const t = await loadTemplateForEdit(supabase, (cur as any).id);
      return t ? { ok: true, template: t } : { ok: false, error: 'Paramètres introuvables.' };
    }
    if (cur) {
      // Copie de la formation du catalogue, propre à cette session.
      const { id: _id, created_at: _c, position: _p, folder_id: _f, category: _cat, ...rest } = cur as any;
      const { data: copy, error } = await supabase.from('templates').insert({ ...rest, session_only: true, folder_id: null, category: null }).select('id').single();
      if (error || !copy) return { ok: false, error: error?.message || 'Copie impossible.' };
      const newId = (copy as any).id;
      const src = (cur as any).id;
      const [{ data: mods }, { data: trs }, { data: lks }, { data: dcs }] = await Promise.all([
        supabase.from('template_modules').select('name, duration_hours, position').eq('template_id', src),
        supabase.from('template_trainers').select('trainer_id').eq('template_id', src),
        supabase.from('template_links').select('label, url, position').eq('template_id', src),
        supabase.from('dossier_documents').select('*').eq('template_id', src),
      ]);
      if (mods?.length) await supabase.from('template_modules').insert((mods as any[]).map((m) => ({ ...m, template_id: newId })));
      if (trs?.length) await supabase.from('template_trainers').insert((trs as any[]).map((x) => ({ ...x, template_id: newId })));
      if (lks?.length) await supabase.from('template_links').insert((lks as any[]).map((x) => ({ ...x, template_id: newId })));
      if (dcs?.length) await supabase.from('dossier_documents').insert((dcs as any[]).map(({ id: _i, created_at: _ca, ...d }) => ({ ...d, template_id: newId })));
      await supabase.from('sessions').update({ template_id: newId }).eq('id', sessionId);
      revalidatePath(`/sessions/${sessionId}`);
      return { ok: true, template: await loadTemplateForEdit(supabase, newId) };
    }
  }

  // Sans formation : formation vierge au nom de la session (durée : 7 h par jour ouvré, modifiable).
  const days = Math.max(1, Math.round((new Date((session as any).end_at.slice(0, 10)).getTime() - new Date((session as any).start_at.slice(0, 10)).getTime()) / 86400000) + 1);
  const { data: created, error } = await supabase
    .from('templates')
    .insert({ title: (session as any).title, duration_hours: Math.min(days, 5 * Math.ceil(days / 7)) * 7, session_only: true })
    .select('id')
    .single();
  if (error || !created) return { ok: false, error: error?.message || 'Création impossible.' };
  await supabase.from('sessions').update({ template_id: (created as any).id }).eq('id', sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, template: await loadTemplateForEdit(supabase, (created as any).id) };
}
