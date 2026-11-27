'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logTrace } from '@/lib/trace-server';
import { requireAdmin, FORBIDDEN } from '@/lib/auth';
import { validSignature } from '@/lib/emargement';
import { cleanMaterial, validEmployeeToken, EMPLOYEE_DOC_SELECT, type EmployeeDoc } from '@/lib/salaries';
import { builtinActive, customDocs, missingDocs } from '@/lib/documents';
import { loadDocs, loadDocSignatures } from '@/lib/documents-server';

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = 'Exécute d’abord la migration 25 (supabase/migration_phase25.sql) dans Supabase.';
const token = () => randomBytes(24).toString('base64url');
const txt = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? '').trim().slice(0, max) || null;

function refresh() {
  revalidatePath('/salaries');
  revalidatePath('/profil');
}

function readEmployee(fd: FormData) {
  return {
    full_name: txt(fd, 'full_name', 120),
    email: txt(fd, 'email', 200),
    job: txt(fd, 'job', 120),
    profile_id: txt(fd, 'profile_id', 40),
  };
}

/** Nouveau salarié : son droit à l'image est préparé d'office (à signer). */
export async function createEmployee(fd: FormData): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const e = readEmployee(fd);
  if (!e.full_name) return { ok: false, error: 'Indique le nom du salarié.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('employees').insert({ ...e, token: token() }).select('id').single();
  if (error) return { ok: false, error: MIGRATION };
  // Documents intégrés désactivés par l'administrateur : non demandés.
  const docs = await loadDocs(supabase as any);
  if (builtinActive(docs, 'image_salarie')) await supabase.from('employee_documents').insert({ employee_id: data.id, kind: 'image' });
  const material = cleanMaterial(Object.fromEntries(fd.entries()));
  if (Object.keys(material).length && builtinActive(docs, 'materiel')) await supabase.from('employee_documents').insert({ employee_id: data.id, kind: 'materiel', data: material });
  refresh();
  return { ok: true };
}

export async function updateEmployee(id: string, fd: FormData): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const e = readEmployee(fd);
  if (!e.full_name) return { ok: false, error: 'Indique le nom du salarié.' };
  const supabase = await createClient();
  const { error } = await supabase.from('employees').update({ ...e, active: fd.get('active') !== 'off' }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteEmployee(id: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: gone } = await supabase.from('employees').select('full_name').eq('id', id).maybeSingle();
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logTrace({ entity: 'salarie_materiel', action: 'supprime', personName: gone?.full_name || null, detail: 'Salarié supprimé avec ses documents', channel: 'bureau' });
  refresh();
  return { ok: true };
}

/** Matériel remis : préparé par le bureau, signé ensuite par le salarié. */
export async function addMaterial(employeeId: string, fd: FormData): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const material = cleanMaterial(Object.fromEntries(fd.entries()));
  if (!Object.keys(material).length) return { ok: false, error: 'Coche au moins un équipement.' };
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from('employee_documents').insert({ employee_id: employeeId, kind: 'materiel', data: material }).select('id').single();
  if (error) return { ok: false, error: error.message };
  await logTrace({ entity: 'salarie_materiel', action: 'cree', recordId: doc.id, employeeId, channel: 'bureau', detail: Object.entries(material).map(([k, v]) => `${k} : ${v}`).join(', '), snapshot: material as any });
  refresh();
  return { ok: true };
}

/** Redemande le droit à l'image (ex. après un refus, ou changement d'avis). */
export async function requestImage(employeeId: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: pending } = await supabase.from('employee_documents').select('id').eq('employee_id', employeeId).eq('kind', 'image').is('signed_at', null);
  if (pending?.length) return { ok: false, error: 'Un droit à l’image est déjà en attente de signature.' };
  const { error } = await supabase.from('employee_documents').insert({ employee_id: employeeId, kind: 'image' });
  if (error) return { ok: false, error: error.message };
  await logTrace({ entity: 'salarie_image', action: 'demande', employeeId, channel: 'bureau' });
  refresh();
  return { ok: true };
}

/** Départ : matériel restitué, avec la signature du salarié (le cachet CF Réseaux est ajouté au PDF). */
export async function recordReturn(docId: string, signature: string): Promise<Result> {
  const profile = await requireAdmin();
  if (!profile) return FORBIDDEN;
  if (!validSignature(signature)) return { ok: false, error: 'Le salarié doit signer la restitution.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('employee_documents')
    .update({ returned_at: new Date().toISOString(), return_signature: signature, returned_by: profile.id })
    .eq('id', docId)
    .eq('kind', 'materiel');
  if (error) return { ok: false, error: error.message };
  const { data: d } = await supabase.from('employee_documents').select('employee_id').eq('id', docId).maybeSingle();
  await logTrace({ entity: 'salarie_materiel', action: 'restitue', recordId: docId, employeeId: d?.employee_id || null, channel: 'tablette', signature });
  refresh();
  return { ok: true };
}

export async function deleteEmployeeDoc(docId: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: d } = await supabase.from('employee_documents').select('employee_id, kind, accepted, signed_at, data, returned_at').eq('id', docId).maybeSingle();
  const { error } = await supabase.from('employee_documents').delete().eq('id', docId);
  if (error) return { ok: false, error: error.message };
  if (d) await logTrace({ entity: d.kind === 'image' ? 'salarie_image' : 'salarie_materiel', action: 'supprime', recordId: docId, employeeId: d.employee_id, channel: 'bureau', detail: d.signed_at ? `signé le ${String(d.signed_at).slice(0, 10).split('-').reverse().join('/')}` : 'non signé', snapshot: d as any });
  refresh();
  return { ok: true };
}

export async function renewEmployeeLink(id: string): Promise<Result> {
  if (!(await requireAdmin())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('employees').update({ token: token() }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Le salarié signe tous ses documents en attente (lien personnel, sans compte). */
export async function signEmployeeDocs(
  link: string,
  payload: { address: string; city: string; imageAccepted: boolean | null; signature: string }
): Promise<Result> {
  if (!validEmployeeToken(link)) return { ok: false, error: 'Lien invalide.' };
  if (!validSignature(payload.signature)) return { ok: false, error: 'Signe dans le cadre avant de valider.' };
  const address = String(payload.address || '').trim().slice(0, 300);
  const city = String(payload.city || '').trim().slice(0, 120);
  if (!address) return { ok: false, error: 'Indique ton adresse.' };
  if (!city) return { ok: false, error: 'Indique la ville (« Fait à »).' };
  const admin = createAdminClient();
  const { data: emp } = await admin.from('employees').select('id').eq('token', link).eq('active', true).maybeSingle();
  if (!emp) return { ok: false, error: 'Ce lien n’est plus valide.' };
  const { data: pendingRows } = await admin.from('employee_documents').select(EMPLOYEE_DOC_SELECT).eq('employee_id', emp.id).is('signed_at', null);
  const pending = (pendingRows as EmployeeDoc[]) || [];
  // Documents ajoutés par l'administrateur (ex. règlement intérieur) encore à signer.
  const custom = missingDocs(customDocs(await loadDocs(admin as any), 'salarie'), await loadDocSignatures(admin as any, 'employee_id', [emp.id]));
  if (!pending.length && !custom.length) return { ok: false, error: 'Aucun document à signer.' };
  if (pending.some((d) => d.kind === 'image') && payload.imageAccepted === null) return { ok: false, error: 'Droit à l’image : choisis « J’autorise » ou « Je n’autorise pas ».' };
  const now = new Date().toISOString();
  for (const d of pending) {
    await admin
      .from('employee_documents')
      .update({
        data: { ...(d.data || {}), address },
        accepted: d.kind === 'image' ? payload.imageAccepted !== false : true,
        signature: payload.signature,
        city,
        signed_at: now,
      })
      .eq('id', d.id)
      .is('signed_at', null);
  }
  if (custom.length) {
    const { error } = await admin.from('document_signatures').insert(
      custom.map((d) => ({ document_id: d.id, version: d.version, employee_id: emp.id, signature: payload.signature, city, collected_by: null }))
    );
    if (error) return { ok: false, error: 'Enregistrement impossible, réessaie.' };
  }
  await admin.from('employees').update({ address }).eq('id', emp.id);
  const base = { anonymous: true, employeeId: emp.id, channel: 'lien' as const, signature: payload.signature };
  await logTrace([
    ...pending.map((d) => ({
      ...base,
      entity: (d.kind === 'image' ? 'salarie_image' : 'salarie_materiel') as 'salarie_image' | 'salarie_materiel',
      action: d.kind === 'image' ? (payload.imageAccepted !== false ? 'accord' : 'refus') : 'signe',
      recordId: d.id,
      detail: `fait à ${city}`,
    })),
    ...custom.map((d) => ({ ...base, entity: 'document' as const, action: 'signe', recordId: d.id, detail: `${d.title} (version ${d.version}) · fait à ${city}` })),
  ]);
  revalidatePath(`/salarie/${link}`);
  refresh();
  return { ok: true };
}
