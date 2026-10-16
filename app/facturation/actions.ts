'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 30 (supabase/migration_phase30.sql) dans Supabase.';
const ONLY_BILLING = 'Seul le compte Facturation peut faire cette action.';

async function requireBilling() {
  const p = await getCurrentProfile();
  return p?.can_invoice ? p : null;
}

function refresh(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/facturation');
  revalidatePath('/');
}

/** Ajoute une facture (nom donné dans Digiforma, entreprise) à la session. */
export async function addInvoice(sessionId: string, input: { label: string; company: string }): Promise<Result> {
  if (!(await requireBilling())) return { ok: false, error: ONLY_BILLING };
  const label = String(input.label || '').trim().slice(0, 120);
  if (!label) return { ok: false, error: 'Indique le nom de la facture.' };
  const supabase = await createClient();
  const { error } = await supabase.from('session_invoices').insert({
    session_id: sessionId,
    label,
    company: String(input.company || '').trim().slice(0, 160) || null,
  });
  if (error) return { ok: false, error: MIGRATION };
  refresh(sessionId);
  return { ok: true };
}

export async function deleteInvoice(sessionId: string, id: string): Promise<Result> {
  if (!(await requireBilling())) return { ok: false, error: ONLY_BILLING };
  const supabase = await createClient();
  const { error } = await supabase.from('session_invoices').delete().eq('id', id).eq('session_id', sessionId);
  if (error) return { ok: false, error: error.message };
  refresh(sessionId);
  return { ok: true };
}

/** « Facturation faite » : au moins une facture nommée ; complète le dossier de la session. */
export async function setBillingDone(sessionId: string, done: boolean, note?: string): Promise<Result> {
  const me = await requireBilling();
  if (!me) return { ok: false, error: ONLY_BILLING };
  const supabase = await createClient();
  if (done) {
    const { count } = await supabase.from('session_invoices').select('id', { count: 'exact', head: true }).eq('session_id', sessionId);
    if (!count) return { ok: false, error: 'Ajoute d’abord le nom de la facture.' };
  }
  const { error } = await supabase
    .from('sessions')
    .update({
      billing_done: done,
      billing_done_at: done ? new Date().toISOString() : null,
      billing_done_by: done ? me.id : null,
      ...(note !== undefined ? { billing_note: note.trim().slice(0, 400) || null } : {}),
    })
    .eq('id', sessionId);
  if (error) return { ok: false, error: /facturation|Facturation/.test(error.message) ? error.message : MIGRATION };
  refresh(sessionId);
  return { ok: true };
}

/** Administrateur : donne ou retire l'accès Facturation à un compte. */
export async function setBillingAccess(userId: string, enabled: boolean): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ can_invoice: enabled }).eq('id', userId);
  if (error) return { ok: false, error: MIGRATION };
  revalidatePath('/administration');
  return { ok: true };
}
