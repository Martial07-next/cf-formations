'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { validSignature } from '@/lib/emargement';
import { COMPANY_FIELDS, CONVENTION_SELECT, missingCompany, validToken, type Convention } from '@/lib/poec';

export type PublicResult = { ok: true } | { ok: false; error: string };

const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max) || null;

async function byToken(token: string, party: 'company' | 'trainee') {
  if (!validToken(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('poec_conventions')
    .select(CONVENTION_SELECT)
    .eq(party === 'company' ? 'company_token' : 'trainee_token', token)
    .maybeSingle();
  return data ? { admin, c: data as unknown as Convention } : null;
}

function refresh(c: Convention, token: string) {
  revalidatePath(`/poec/${c.program_id}`);
  revalidatePath(`/convention/${token}`);
}

/** L'entreprise d'accueil complète ses informations (enregistrement sans signer). */
export async function saveCompanyInfo(token: string, values: Record<string, string>): Promise<PublicResult> {
  const found = await byToken(token, 'company');
  if (!found) return { ok: false, error: 'Lien invalide.' };
  if (found.c.company_signed_at) return { ok: false, error: 'La convention est déjà signée par l’entreprise.' };
  const patch = Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, clip(values[f.key], f.key === 'missions' ? 3000 : 400)]));
  const { error } = await found.admin
    .from('poec_conventions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', found.c.id);
  if (error) return { ok: false, error: 'Enregistrement impossible, réessaie.' };
  refresh(found.c, token);
  return { ok: true };
}

export async function signAsCompany(
  token: string,
  values: Record<string, string>,
  sign: { signer: string; role: string; city: string; signature: string }
): Promise<PublicResult> {
  const saved = await saveCompanyInfo(token, values);
  if (!saved.ok) return saved;
  const found = await byToken(token, 'company');
  if (!found) return { ok: false, error: 'Lien invalide.' };
  const missing = missingCompany(found.c);
  if (missing.length) return { ok: false, error: `À compléter avant de signer : ${missing.join(', ')}.` };
  if (!clip(sign.signer, 120) || !clip(sign.city, 120)) return { ok: false, error: 'Indique le nom du signataire et la ville (« Fait à »).' };
  if (!validSignature(sign.signature)) return { ok: false, error: 'Signe dans le cadre avant de valider.' };
  const { error } = await found.admin
    .from('poec_conventions')
    .update({
      company_signer: clip(sign.signer, 120),
      company_signer_role: clip(sign.role, 120),
      company_city: clip(sign.city, 120),
      company_signature: sign.signature,
      company_signed_at: new Date().toISOString(),
    })
    .eq('id', found.c.id)
    .is('company_signed_at', null);
  if (error) return { ok: false, error: 'Signature impossible, réessaie.' };
  refresh(found.c, token);
  return { ok: true };
}

export async function signAsTrainee(token: string, sign: { address: string; city: string; signature: string }): Promise<PublicResult> {
  const found = await byToken(token, 'trainee');
  if (!found) return { ok: false, error: 'Lien invalide.' };
  if (found.c.trainee_signed_at) return { ok: false, error: 'Tu as déjà signé cette convention.' };
  const address = clip(sign.address, 400);
  if (!address) return { ok: false, error: 'Indique ton adresse.' };
  if (!clip(sign.city, 120)) return { ok: false, error: 'Indique la ville (« Fait à »).' };
  if (!validSignature(sign.signature)) return { ok: false, error: 'Signe dans le cadre avant de valider.' };
  const { error } = await found.admin
    .from('poec_conventions')
    .update({
      trainee_address: address,
      trainee_city: clip(sign.city, 120),
      trainee_signature: sign.signature,
      trainee_signed_at: new Date().toISOString(),
    })
    .eq('id', found.c.id)
    .is('trainee_signed_at', null);
  if (error) return { ok: false, error: 'Signature impossible, réessaie.' };
  // L'adresse sert aussi aux conventions suivantes du parcours.
  await found.admin
    .from('poec_trainees')
    .update({ address })
    .eq('program_id', found.c.program_id)
    .eq('trainee_id', found.c.trainee_id);
  await found.admin
    .from('poec_conventions')
    .update({ trainee_address: address })
    .eq('program_id', found.c.program_id)
    .eq('trainee_id', found.c.trainee_id)
    .is('trainee_signed_at', null);
  refresh(found.c, token);
  return { ok: true };
}

/** France Travail : signe en une fois toutes les conventions prêtes du parcours. */
export async function signAsFranceTravail(token: string, ids: string[], signer: string, signature: string): Promise<PublicResult> {
  if (!validToken(token)) return { ok: false, error: 'Lien invalide.' };
  if (!clip(signer, 160)) return { ok: false, error: 'Indique le nom du conseiller et l’agence.' };
  if (!validSignature(signature)) return { ok: false, error: 'Signe dans le cadre avant de valider.' };
  if (!ids.length) return { ok: false, error: 'Aucune convention sélectionnée.' };
  const admin = createAdminClient();
  const { data: program } = await admin.from('poec_programs').select('id').eq('ft_token', token).maybeSingle();
  if (!program) return { ok: false, error: 'Lien invalide.' };
  const { error } = await admin
    .from('poec_conventions')
    .update({ ft_signer: clip(signer, 160), ft_signature: signature, ft_signed_at: new Date().toISOString() })
    .eq('program_id', program.id)
    .in('id', ids.slice(0, 500))
    .is('ft_signed_at', null)
    .not('cf_signed_at', 'is', null)
    .not('company_signed_at', 'is', null)
    .not('trainee_signed_at', 'is', null);
  if (error) return { ok: false, error: 'Signature impossible, réessaie.' };
  revalidatePath(`/poec/${program.id}`);
  revalidatePath(`/france-travail/${token}`);
  return { ok: true };
}
