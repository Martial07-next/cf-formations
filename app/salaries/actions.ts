'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireManager, FORBIDDEN } from '@/lib/auth';
import { validSignature } from '@/lib/emargement';
import { cleanMaterial, validEmployeeToken, EMPLOYEE_DOC_SELECT, type EmployeeDoc } from '@/lib/salaries';

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
  if (!(await requireManager())) return FORBIDDEN;
  const e = readEmployee(fd);
  if (!e.full_name) return { ok: false, error: 'Indique le nom du salarié.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('employees').insert({ ...e, token: token() }).select('id').single();
  if (error) return { ok: false, error: MIGRATION };
  await supabase.from('employee_documents').insert({ employee_id: data.id, kind: 'image' });
  const material = cleanMaterial(Object.fromEntries(fd.entries()));
  if (Object.keys(material).length) await supabase.from('employee_documents').insert({ employee_id: data.id, kind: 'materiel', data: material });
  refresh();
  return { ok: true };
}

export async function updateEmployee(id: string, fd: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const e = readEmployee(fd);
  if (!e.full_name) return { ok: false, error: 'Indique le nom du salarié.' };
  const supabase = await createClient();
  const { error } = await supabase.from('employees').update({ ...e, active: fd.get('active') !== 'off' }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteEmployee(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Matériel remis : préparé par le bureau, signé ensuite par le salarié. */
export async function addMaterial(employeeId: string, fd: FormData): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const material = cleanMaterial(Object.fromEntries(fd.entries()));
  if (!Object.keys(material).length) return { ok: false, error: 'Coche au moins un équipement.' };
  const supabase = await createClient();
  const { error } = await supabase.from('employee_documents').insert({ employee_id: employeeId, kind: 'materiel', data: material });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Redemande le droit à l'image (ex. après un refus, ou changement d'avis). */
export async function requestImage(employeeId: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { data: pending } = await supabase.from('employee_documents').select('id').eq('employee_id', employeeId).eq('kind', 'image').is('signed_at', null);
  if (pending?.length) return { ok: false, error: 'Un droit à l’image est déjà en attente de signature.' };
  const { error } = await supabase.from('employee_documents').insert({ employee_id: employeeId, kind: 'image' });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Départ : matériel restitué, avec la signature du salarié (le cachet CF Réseaux est ajouté au PDF). */
export async function recordReturn(docId: string, signature: string): Promise<Result> {
  const profile = await requireManager();
  if (!profile) return FORBIDDEN;
  if (!validSignature(signature)) return { ok: false, error: 'Le salarié doit signer la restitution.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('employee_documents')
    .update({ returned_at: new Date().toISOString(), return_signature: signature, returned_by: profile.id })
    .eq('id', docId)
    .eq('kind', 'materiel');
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteEmployeeDoc(docId: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('employee_documents').delete().eq('id', docId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function renewEmployeeLink(id: string): Promise<Result> {
  if (!(await requireManager())) return FORBIDDEN;
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
  if (!pending.length) return { ok: false, error: 'Aucun document à signer.' };
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
  await admin.from('employees').update({ address }).eq('id', emp.id);
  revalidatePath(`/salarie/${link}`);
  refresh();
  return { ok: true };
}
