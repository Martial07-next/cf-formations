import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFullName, isDuplicateError, type TraineeName } from '@/lib/trainee-name';

/**
 * Cherche si `traineeId` est déjà VALIDÉ sur une autre session dont le
 * créneau chevauche [startAt, endAt]. Un stagiaire ne peut pas suivre deux
 * formations en même temps.
 * (Fonction serveur ordinaire, volontairement hors d'un fichier 'use server'
 * pour ne pas être exposée comme Server Action.)
 */
export async function findTraineeConflict(
  supabase: SupabaseClient,
  traineeId: string,
  startAt: string,
  endAt: string,
  excludeSessionId?: string
): Promise<{ sessionId: string; title: string } | null> {
  const { data } = await supabase
    .from('session_trainees')
    .select('status, sessions(id, title, start_at, end_at)')
    .eq('trainee_id', traineeId)
    .eq('status', 'validee');

  for (const row of data || []) {
    const s: any = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!s || s.id === excludeSessionId) continue;
    if (new Date(s.start_at) < new Date(endAt) && new Date(s.end_at) > new Date(startAt)) {
      return { sessionId: s.id, title: s.title };
    }
  }
  return null;
}

/** Échappe les jokers de ILIKE (% et _) pour une comparaison exacte insensible à la casse. */
function exact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => '\\' + c);
}

/**
 * Retrouve un stagiaire (par e-mail, puis par nom : « Prénom Nom » ou « Nom Prénom »),
 * sinon le crée. Une fiche retrouvée est complétée avec les informations
 * manquantes (e-mail, entreprise, prénom/nom séparés) : jamais de doublon.
 */
export async function findOrCreateTrainee(
  supabase: SupabaseClient,
  name: TraineeName,
  email: string | null,
  company: string | null = null
): Promise<{ id: string; created: boolean; completed?: boolean } | null> {
  const fullName = buildFullName(name);
  if (!fullName) return null;
  const reversed = name.first_name ? `${name.last_name} ${name.first_name}`.replace(/\s+/g, ' ').trim() : null;
  const cols = 'id, full_name, email, company, first_name, last_name';
  const sameKey = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');

  let found: any = null;
  if (email) {
    const { data } = await supabase.from('trainees').select(cols).ilike('email', exact(email)).limit(1).maybeSingle();
    // E-mail déjà porté par une autre personne : on ne fusionne pas, et on ne réutilise pas l'e-mail.
    if (data && sameKey(data.full_name || '') !== sameKey(fullName)) email = null;
    else found = data;
  }
  if (!found) {
    const { data } = await supabase.from('trainees').select(cols).ilike('full_name', exact(fullName)).limit(1).maybeSingle();
    found = data;
  }
  if (!found && reversed) {
    const { data } = await supabase.from('trainees').select(cols).ilike('full_name', exact(reversed)).limit(1).maybeSingle();
    found = data;
  }

  if (found) {
    // Complète automatiquement chaque case vide de la fiche avec ce que donne
    // le fichier (e-mail, entreprise, prénom, nom), sans rien écraser.
    let completed = false;
    const info: Record<string, string> = {};
    if (!found.email && email) info.email = email;
    if (!found.company && company) info.company = company;
    if (Object.keys(info).length) {
      const { error } = await supabase.from('trainees').update(info).eq('id', found.id);
      completed ||= !error;
    }

    // Prénom / nom : enregistrés séparément (le nom complet affiché suit).
    const first = found.first_name || name.first_name || null;
    const last = found.last_name || name.last_name || null;
    if ((first !== found.first_name || last !== found.last_name) && last) {
      const { error } = await supabase
        .from('trainees')
        .update({ first_name: first, last_name: last, full_name: buildFullName({ first_name: first, last_name: last }) })
        .eq('id', found.id);
      completed ||= !error;
    }
    return { id: found.id, created: false, completed };
  }

  const { data, error } = await supabase
    .from('trainees')
    .insert({ full_name: fullName, first_name: name.first_name, last_name: name.last_name, email, company })
    .select('id')
    .single();
  if (isDuplicateError(error)) {
    // Créé entre-temps (ou nom identique à des espaces/majuscules près) : on réutilise la fiche.
    const { data: again } = await supabase.from('trainees').select('id').ilike('full_name', exact(fullName)).limit(1).maybeSingle();
    return again ? { id: again.id, created: false } : null;
  }
  if (error || !data) return null;
  return { id: data.id, created: true };
}
