'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { KINDS, PRIORITIES, STATUSES, type Feedback } from '@/lib/dev-feedback';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
const MIGRATION = 'Exécute d’abord la migration 42 (supabase/migration_phase42.sql) dans Supabase.';
const FORBIDDEN = { ok: false as const, error: 'Réservé aux comptes avec l’accès dev et à l’administrateur.' };

async function devOrAdmin() {
  const p = await getCurrentProfile();
  if (!p || p.role === 'aucun') return null;
  return p.role === 'admin' || p.can_dev ? p : null;
}
const err = (m: string) => ({ ok: false as const, error: /dev_feedback|schema cache|does not exist/i.test(m) ? MIGRATION : m });

/** Remarques (toutes, ou celles d'une page), avec auteurs et réponses. */
export async function listFeedback(path?: string): Promise<Result<{ items: Feedback[] }>> {
  if (!(await devOrAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  let q = supabase
    .from('dev_feedback')
    .select('*, author:profiles!dev_feedback_created_by_fkey(full_name), dev_feedback_replies(id, body, created_by, created_at, author:profiles!dev_feedback_replies_created_by_fkey(full_name))')
    .order('created_at', { ascending: false })
    .limit(500);
  if (path) q = q.eq('path', path);
  const { data, error } = await q;
  if (error) return err(error.message);
  const items = ((data as any[]) || []).map((r) => ({
    ...r,
    author: r.author?.full_name ?? null,
    replies: ((r.dev_feedback_replies as any[]) || [])
      .map((x) => ({ id: x.id, body: x.body, created_by: x.created_by, created_at: x.created_at, author: x.author?.full_name ?? null }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    dev_feedback_replies: undefined,
  })) as Feedback[];
  return { ok: true, items };
}

export async function createFeedback(input: {
  path: string;
  page_title?: string | null;
  selector?: string | null;
  rel_x?: number | null;
  rel_y?: number | null;
  page_x?: number | null;
  page_y?: number | null;
  viewport_w?: number | null;
  kind: string;
  priority: string;
  body: string;
}): Promise<Result<{ id: string }>> {
  const me = await devOrAdmin();
  if (!me) return FORBIDDEN;
  const body = String(input.body || '').trim().slice(0, 4000);
  if (!body) return { ok: false, error: 'Décris la modification à apporter.' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('dev_feedback')
    .insert({
      path: String(input.path || '/').slice(0, 300),
      page_title: input.page_title ? String(input.page_title).slice(0, 200) : null,
      selector: input.selector ? String(input.selector).slice(0, 1000) : null,
      rel_x: num(input.rel_x),
      rel_y: num(input.rel_y),
      page_x: num(input.page_x),
      page_y: num(input.page_y),
      viewport_w: num(input.viewport_w),
      kind: (KINDS as string[]).includes(input.kind) ? input.kind : 'amelioration',
      priority: (PRIORITIES as string[]).includes(input.priority) ? input.priority : 'normale',
      body,
      created_by: me.id,
    })
    .select('id')
    .single();
  if (error) return err(error.message);
  revalidatePath('/ameliorations');
  return { ok: true, id: data.id };
}

/** Statut / priorité (administrateur) ; texte et type (auteur tant que « à faire »). */
export async function updateFeedback(id: string, patch: { status?: string; priority?: string; kind?: string; body?: string }): Promise<Result> {
  const me = await devOrAdmin();
  if (!me) return FORBIDDEN;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) {
    if (me.role !== 'admin') return { ok: false, error: 'Seul l’administrateur change le statut.' };
    if (!(STATUSES as string[]).includes(patch.status)) return { ok: false, error: 'Statut inconnu.' };
    row.status = patch.status;
    const done = patch.status === 'fait' || patch.status === 'refuse';
    row.resolved_at = done ? new Date().toISOString() : null;
    row.resolved_by = done ? me.id : null;
  }
  if (patch.priority !== undefined && (PRIORITIES as string[]).includes(patch.priority)) row.priority = patch.priority;
  if (patch.kind !== undefined && (KINDS as string[]).includes(patch.kind)) row.kind = patch.kind;
  if (patch.body !== undefined) {
    const b = String(patch.body).trim().slice(0, 4000);
    if (!b) return { ok: false, error: 'Le texte ne peut pas être vide.' };
    row.body = b;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('dev_feedback').update(row).eq('id', id).select('id');
  if (error) return err(error.message);
  if (!data?.length) return { ok: false, error: 'Modification impossible (déjà prise en charge par l’administrateur).' };
  revalidatePath('/ameliorations');
  return { ok: true };
}

export async function deleteFeedback(id: string): Promise<Result> {
  if (!(await devOrAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data, error } = await supabase.from('dev_feedback').delete().eq('id', id).select('id');
  if (error) return err(error.message);
  if (!data?.length) return { ok: false, error: 'Suppression impossible (déjà prise en charge par l’administrateur).' };
  revalidatePath('/ameliorations');
  return { ok: true };
}

export async function addReply(feedbackId: string, body: string): Promise<Result> {
  const me = await devOrAdmin();
  if (!me) return FORBIDDEN;
  const b = String(body || '').trim().slice(0, 4000);
  if (!b) return { ok: false, error: 'Message vide.' };
  const supabase = await createClient();
  const { error } = await supabase.from('dev_feedback_replies').insert({ feedback_id: feedbackId, body: b, created_by: me.id });
  if (error) return err(error.message);
  await supabase.from('dev_feedback').update({ updated_at: new Date().toISOString() }).eq('id', feedbackId);
  revalidatePath('/ameliorations');
  return { ok: true };
}
