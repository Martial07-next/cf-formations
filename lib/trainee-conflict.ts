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

// ------------------------------------------------------------
// Import en masse (fichiers de plusieurs milliers de lignes)
// ------------------------------------------------------------

type Existing = {
  id: string;
  full_name: string;
  email: string | null;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
};

/** Clé d'identité : ordre nom / prénom, accents et majuscules indifférents. */
function identityKey(text: string) {
  return text
    .split(/\s+/)
    .map((p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Clé de l'index unique trainees_name_key (minuscules, espaces réduits). */
const dbNameKey = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

/** Exécute `fn` sur chaque élément, `limit` à la fois. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * Version groupée de findOrCreateTrainee : charge l'annuaire une seule fois,
 * fait les rapprochements en mémoire, puis crée et complète les fiches par
 * paquets. Quelques requêtes au total au lieu de plusieurs par ligne, ce qui
 * évite que l'import soit coupé par la limite de temps du serveur.
 * Renvoie un résultat par ligne (même ordre), null si la ligne a échoué.
 */
export async function resolveTraineesBulk(
  supabase: SupabaseClient,
  rows: { name: TraineeName; email: string | null; company?: string | null }[]
): Promise<({ id: string; created: boolean; completed?: boolean } | null)[]> {
  const results: ({ id: string; created: boolean; completed?: boolean } | null)[] = rows.map(() => null);

  // 1. Annuaire complet, par pages de 1000 (limite de l'API).
  const all: Existing[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('trainees')
      .select('id, full_name, email, company, first_name, last_name')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...((data as Existing[]) || []));
    if (!data || data.length < 1000) break;
  }

  type Entry = Existing & { pending?: number[]; changed?: boolean };
  const byEmail = new Map<string, Entry>();
  const byKey = new Map<string, Entry>();
  const keyOf = (t: Existing) => identityKey(t.first_name || t.last_name ? `${t.first_name || ''} ${t.last_name || ''}` : t.full_name);
  const index = (t: Entry) => {
    if (t.email) byEmail.set(t.email.toLowerCase(), t);
    const k = keyOf(t);
    if (k && !byKey.has(k)) byKey.set(k, t);
  };
  for (const t of all) index(t);

  // 2. Rapprochement en mémoire.
  const toCreate: Entry[] = [];
  rows.forEach((row, i) => {
    const fullName = buildFullName(row.name);
    if (!fullName) return;
    const k = identityKey(fullName);
    let email = row.email?.toLowerCase() || null;
    const company = row.company || null;

    let found: Entry | null = null;
    if (email) {
      const t = byEmail.get(email);
      // E-mail déjà porté par une autre personne : on ne fusionne pas, et on ne réutilise pas l'e-mail.
      if (t && keyOf(t) !== k) email = null;
      else found = t || null;
    }
    found ||= byKey.get(k) || null;

    if (found?.pending) {
      // Personne déjà prévue à la création plus haut dans le fichier.
      found.pending.push(i);
      found.email ||= email;
      found.company ||= company;
      return;
    }
    if (found) {
      // Complète chaque case vide, sans rien écraser.
      const first = found.first_name || row.name.first_name || null;
      const last = found.last_name || row.name.last_name || null;
      let changed = false;
      if (!found.email && email) { found.email = email; changed = true; }
      if (!found.company && company) { found.company = company; changed = true; }
      if (last && (first !== found.first_name || last !== found.last_name)) {
        found.first_name = first;
        found.last_name = last;
        found.full_name = buildFullName({ first_name: first, last_name: last });
        changed = true;
      }
      if (changed) found.changed = true;
      results[i] = { id: found.id, created: false, completed: changed };
      if (email) byEmail.set(email, found);
      return;
    }
    const entry: Entry = {
      id: '',
      full_name: fullName,
      first_name: row.name.first_name,
      last_name: row.name.last_name,
      email,
      company,
      pending: [i],
    };
    toCreate.push(entry);
    index(entry);
  });

  // 3. Créations par paquets de 500.
  await inChunks(toCreate, 500, async (chunk) => {
    const payload = chunk.map((t) => ({
      full_name: t.full_name,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email,
      company: t.company,
    }));
    const { data, error } = await supabase.from('trainees').insert(payload).select('id, full_name');
    if (!error && data) {
      const ids = new Map(data.map((d: any) => [dbNameKey(d.full_name), d.id as string]));
      for (const t of chunk) {
        const id = ids.get(dbNameKey(t.full_name));
        if (id) t.pending!.forEach((i, n) => (results[i] = { id, created: n === 0 }));
      }
      return;
    }
    // Paquet refusé (ex. une fiche créée entre-temps) : ligne par ligne.
    for (const t of chunk) {
      const res = await findOrCreateTrainee(supabase, { first_name: t.first_name, last_name: t.last_name || t.full_name }, t.email, t.company);
      if (res) t.pending!.forEach((i, n) => (results[i] = n === 0 ? res : { id: res.id, created: false }));
    }
  });

  // 4. Compléments des fiches existantes, 10 mises à jour à la fois.
  const toUpdate = all.filter((t) => (t as Entry).changed);
  const failed = new Set<string>();
  await pool(toUpdate, 10, async (t) => {
    const { error } = await supabase
      .from('trainees')
      .update({ full_name: t.full_name, first_name: t.first_name, last_name: t.last_name, email: t.email, company: t.company })
      .eq('id', t.id);
    if (error) failed.add(t.id);
  });
  if (failed.size) results.forEach((r) => r && failed.has(r.id) && (r.completed = false));

  return results;
}

/**
 * Stagiaires déjà VALIDÉS sur une autre session qui chevauche [startAt, endAt],
 * pour une liste d'identifiants (version groupée de findTraineeConflict).
 */
export async function findTraineeConflictsBulk(
  supabase: SupabaseClient,
  traineeIds: string[],
  startAt: string,
  endAt: string,
  excludeSessionId?: string
): Promise<Map<string, { sessionId: string; title: string }>> {
  const conflicts = new Map<string, { sessionId: string; title: string }>();
  await inChunks([...new Set(traineeIds)], 200, async (ids) => {
    const { data } = await supabase
      .from('session_trainees')
      .select('trainee_id, sessions(id, title, start_at, end_at)')
      .in('trainee_id', ids)
      .eq('status', 'validee');
    for (const row of (data as any[]) || []) {
      const s: any = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
      if (!s || s.id === excludeSessionId || conflicts.has(row.trainee_id)) continue;
      if (new Date(s.start_at) < new Date(endAt) && new Date(s.end_at) > new Date(startAt)) {
        conflicts.set(row.trainee_id, { sessionId: s.id, title: s.title });
      }
    }
  });
  return conflicts;
}

/** Inscriptions existantes d'une session : trainee_id → statut. */
export async function sessionLinks(supabase: SupabaseClient, sessionId: string) {
  const links = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('session_trainees')
      .select('trainee_id, status')
      .eq('session_id', sessionId)
      .range(from, from + 999);
    for (const l of (data as any[]) || []) links.set(l.trainee_id, l.status);
    if (!data || data.length < 1000) break;
  }
  return links;
}

/** Inscrit des stagiaires à une session par paquets de 500. Renvoie les identifiants en échec avec le message. */
export async function upsertSessionLinks(
  supabase: SupabaseClient,
  sessionId: string,
  links: { trainee_id: string; status: 'validee' | 'en_attente' }[]
): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  await inChunks(links, 500, async (chunk) => {
    const { error } = await supabase
      .from('session_trainees')
      .upsert(chunk.map((l) => ({ session_id: sessionId, ...l })), { onConflict: 'session_id,trainee_id' });
    if (!error) return;
    await pool(chunk, 10, async (l) => {
      const { error: e } = await supabase
        .from('session_trainees')
        .upsert({ session_id: sessionId, ...l }, { onConflict: 'session_id,trainee_id' });
      if (e) failed.set(l.trainee_id, e.message);
    });
  });
  return failed;
}
