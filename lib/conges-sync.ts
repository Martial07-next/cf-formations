import postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Congés de la plateforme CF Réseaux Congés (dépôt cf-conges, Prisma) →
 * indisponibilités des formateurs sur le planning.
 *
 * Le planning lit directement la base de la plateforme de congés avec un
 * compte PostgreSQL en LECTURE SEULE (variable CONGES_DATABASE_URL, voir
 * Administration › Intégrations) : uniquement les demandes VALIDÉES, et
 * seulement les colonnes utiles (jamais les mots de passe ni les soldes).
 *
 * Chaque congé est rattaché au formateur par son e-mail (sinon par
 * prénom + nom) et enregistré dans trainer_absences (source « conges »).
 * Un congé refusé, annulé ou supprimé disparaît à la synchronisation suivante.
 */

/** Types qui ne rendent pas le formateur indisponible. */
const NOT_ABSENT = ['TT', 'JT', 'F'];
/** Fenêtre synchronisée : congés terminés depuis moins de 90 jours et à venir. */
const PAST_DAYS = 90;

type Row = {
  id: string;
  email: string | null;
  nom: string | null;
  prenom: string | null;
  code: string;
  libelle: string;
  debut: string;
  fin: string;
  demi: boolean;
  periode: string | null;
};

export type CongesSyncResult = { ok: boolean; detail: string; added?: number; updated?: number; removed?: number; unmatched?: string[] };

const plain = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

function kindOf(code: string): 'conge' | 'absence' | 'maladie' | 'autre' {
  const c = code.toUpperCase();
  if (c === 'ARM' || c === 'AT') return 'maladie';
  if (c === 'CP' || c === 'RH' || c === 'C') return 'conge';
  if (c === 'ABS' || c === 'ASA') return 'absence';
  return 'autre';
}

export function congesConfigured() {
  return Boolean(process.env.CONGES_DATABASE_URL);
}

async function readConges(): Promise<Row[]> {
  const sql = postgres(process.env.CONGES_DATABASE_URL!, {
    ssl: 'require',
    max: 1,
    prepare: false, // pooler Supabase (mode transaction)
    connect_timeout: 10,
    idle_timeout: 5,
  });
  try {
    return await sql<Row[]>`
      select r.id,
             u.email, u.nom, u.prenom,
             t.code, t.libelle,
             to_char((r."dateDebut" at time zone 'UTC') at time zone 'Europe/Paris', 'YYYY-MM-DD') as debut,
             to_char((r."dateFin" at time zone 'UTC') at time zone 'Europe/Paris', 'YYYY-MM-DD') as fin,
             r."demiJournee" as demi,
             r."demiJourneePeriode" as periode
      from "LeaveRequest" r
      join "User" u on u.id = r."userId"
      join "LeaveType" t on t.id = r."leaveTypeId"
      where r.statut = 'VALIDE'
        and r."supprimeParAdmin" = false
        and r."dateFin" >= now() - make_interval(days => ${PAST_DAYS})
        and t.code <> all(${NOT_ABSENT})
    `;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/**
 * Fériés « travaillés » : décision « Oui » de la direction dans CF Congés
 * (table JourFerieOuverture). null : lecture impossible (droit manquant).
 */
async function readWorkedHolidays(): Promise<{ day: string }[] | null> {
  const sql = postgres(process.env.CONGES_DATABASE_URL!, { ssl: 'require', max: 1, prepare: false, connect_timeout: 10, idle_timeout: 5 });
  try {
    return await sql<{ day: string }[]>`
      select to_char(o."date", 'YYYY-MM-DD') as day
      from "JourFerieOuverture" o
      where o.ouvert = true and o."date" >= now() - interval '400 days'
    `;
  } catch {
    return null;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/** Fériés travaillés → worked_holidays, puis décalage des sessions tombant sur un férié. */
export async function syncHolidays(supabase: SupabaseClient): Promise<string> {
  const { holidayOn } = await import('@/lib/holidays');
  const { applyHolidayShifts } = await import('@/lib/holiday-shifts');
  let note = '';
  if (congesConfigured()) {
    const rows = await readWorkedHolidays();
    if (rows === null) {
      note = 'fériés travaillés non lus (droit de lecture sur JourFerieOuverture à ajouter : script SQL)';
    } else {
      const days = rows.map((r) => r.day).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const { data: cur, error } = await supabase.from('worked_holidays').select('day');
      if (!error) {
        const have = new Set(((cur as any[]) || []).map((r) => String(r.day).slice(0, 10)));
        const add = days.filter((d) => !have.has(d));
        const del = [...have].filter((d) => !days.includes(d));
        if (add.length) await supabase.from('worked_holidays').upsert(add.map((d) => ({ day: d, label: holidayOn(d)?.label || null, synced_at: new Date().toISOString() })));
        if (del.length) await supabase.from('worked_holidays').delete().in('day', del);
        note = `${days.length} férié(s) travaillé(s)`;
      }
    }
  }
  const r = await applyHolidayShifts(supabase);
  const parts = [note, r.shifted ? `${r.shifted} session(s) décalée(s) (férié)` : '', r.undone ? `${r.undone} décalage(s) annulé(s)` : '', r.conflicts ? `${r.conflicts} session(s) à replanifier (férié)` : ''].filter(Boolean);
  return parts.join(' · ');
}

export async function syncConges(supabase: SupabaseClient): Promise<CongesSyncResult> {
  if (!congesConfigured()) return { ok: false, detail: 'CONGES_DATABASE_URL non configurée (voir Administration › Intégrations).' };
  let rows: Row[];
  try {
    rows = await readConges();
  } catch (e: any) {
    const msg = String(e?.message || e);
    return {
      ok: false,
      detail: /permission denied/i.test(msg)
        ? `Accès refusé par la base des congés : exécute le script SQL de lecture seule (${msg}).`
        : `Connexion à la base des congés impossible : ${msg}`,
    };
  }

  const { data: trainers, error: trErr } = await supabase.from('trainers').select('id, full_name, email');
  if (trErr) return { ok: false, detail: trErr.message };
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const t of (trainers as { id: string; full_name: string; email: string | null }[]) || []) {
    if (t.email) byEmail.set(t.email.trim().toLowerCase(), t.id);
    const n = plain(t.full_name);
    if (n) byName.set(n, t.id);
    // « NOM Prénom » et « Prénom NOM » : mêmes mots, ordre indifférent.
    byName.set(n.split(' ').sort().join(' '), t.id);
  }

  const wanted: { trainer_id: string; start_date: string; end_date: string; kind: string; note: string; source: string; external_id: string }[] = [];
  const unmatched = new Set<string>();
  for (const r of rows) {
    if (!r.debut || !r.fin) continue;
    const name = plain(`${r.prenom || ''} ${r.nom || ''}`);
    const trainerId =
      (r.email && byEmail.get(r.email.trim().toLowerCase())) || byName.get(name) || byName.get(name.split(' ').sort().join(' '));
    if (!trainerId) {
      unmatched.add(`${r.prenom || ''} ${r.nom || ''}`.trim());
      continue;
    }
    const half = r.demi ? ` (demi-journée${r.periode ? ` ${String(r.periode).toLowerCase()}` : ''})` : '';
    wanted.push({
      trainer_id: trainerId,
      start_date: r.debut <= r.fin ? r.debut : r.fin,
      end_date: r.debut <= r.fin ? r.fin : r.debut,
      kind: kindOf(r.code),
      note: `${r.libelle}${half} · plateforme de congés`,
      source: 'conges',
      external_id: r.id,
    });
  }

  // Congés déjà copiés dans la fenêtre synchronisée.
  const since = new Date(Date.now() - PAST_DAYS * 86400000).toISOString().slice(0, 10);
  const { data: existing, error: exErr } = await supabase
    .from('trainer_absences')
    .select('id, external_id, trainer_id, start_date, end_date, kind, note')
    .eq('source', 'conges')
    .gte('end_date', since);
  if (exErr) return { ok: false, detail: exErr.message };
  const current = new Map(((existing as any[]) || []).map((e) => [String(e.external_id), e]));

  let added = 0;
  let updated = 0;
  for (const w of wanted) {
    const e = current.get(w.external_id);
    if (!e) {
      const { error } = await supabase.from('trainer_absences').insert(w);
      if (error) return { ok: false, detail: error.message };
      added++;
    } else if (e.trainer_id !== w.trainer_id || e.start_date !== w.start_date || e.end_date !== w.end_date || e.kind !== w.kind || e.note !== w.note) {
      const { error } = await supabase.from('trainer_absences').update(w).eq('id', e.id);
      if (error) return { ok: false, detail: error.message };
      updated++;
    }
  }
  // Refusés, annulés, supprimés ou passés en télétravail : retirés du planning.
  const keep = new Set(wanted.map((w) => w.external_id));
  const stale = ((existing as any[]) || []).filter((e) => !keep.has(String(e.external_id))).map((e) => e.id);
  if (stale.length) {
    const { error } = await supabase.from('trainer_absences').delete().in('id', stale);
    if (error) return { ok: false, detail: error.message };
  }

  return {
    ok: true,
    added,
    updated,
    removed: stale.length,
    unmatched: [...unmatched],
    detail: `${wanted.length} congé(s) de formateurs · ${added} ajouté(s), ${updated} modifié(s), ${stale.length} retiré(s)${
      unmatched.size ? ` · ${unmatched.size} personne(s) sans fiche formateur (normal pour les salariés non formateurs)` : ''
    }`,
  };
}

/** Synchronise et note le résultat dans les paramètres (journal visible dans Intégrations). */
export async function syncCongesAndLog(supabase: SupabaseClient) {
  const result = await syncConges(supabase);
  // Jours fériés : décisions de CF Congés et décalage des sessions.
  try {
    const h = await syncHolidays(supabase);
    if (h) result.detail = `${result.detail} · ${h}`;
  } catch {
    /* sans effet sur les congés */
  }
  await supabase
    .from('app_settings')
    .update({ absences_last_sync: new Date().toISOString(), absences_last_log: `${result.ok ? 'OK' : 'ERREUR'} : ${result.detail}` })
    .eq('id', true);
  return result;
}

/**
 * Synchronisation « au passage » (ouverture du planning) : au plus une fois
 * toutes les 10 minutes. La date est réservée avant de synchroniser, pour
 * qu'un seul chargement de page la lance.
 */
export async function syncCongesIfStale(supabase: SupabaseClient, minutes = 10) {
  if (!congesConfigured()) return;
  const threshold = new Date(Date.now() - minutes * 60000).toISOString();
  const { data } = await supabase
    .from('app_settings')
    .update({ absences_last_sync: new Date().toISOString() })
    .eq('id', true)
    .or(`absences_last_sync.is.null,absences_last_sync.lt.${threshold}`)
    .select('id');
  if (!data?.length) return;
  await syncCongesAndLog(supabase);
}
