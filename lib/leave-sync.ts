import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Réception des congés envoyés par la plateforme de congés (Supabase
 * « Database Webhook »). Les noms de colonnes de l'autre plateforme ne sont
 * pas connus à l'avance : on reconnaît les noms usuels, en français ou en
 * anglais. Si une colonne n'est pas reconnue, le journal (Administration →
 * Intégrations) liste les colonnes reçues pour ajuster la correspondance.
 */
const FIELDS = {
  email: ['email', 'user_email', 'employee_email', 'mail', 'email_salarie', 'email_employe', 'salarie_email'],
  name: ['full_name', 'nom_complet', 'employee_name', 'salarie', 'employe', 'name', 'nom'],
  first: ['first_name', 'prenom', 'firstname'],
  last: ['last_name', 'nom', 'lastname'],
  start: ['start_date', 'date_debut', 'debut', 'date_start', 'start', 'from', 'du', 'starts_at', 'start_at'],
  end: ['end_date', 'date_fin', 'fin', 'date_end', 'end', 'to', 'au', 'ends_at', 'end_at'],
  status: ['status', 'statut', 'state', 'etat', 'validation'],
  kind: ['type', 'kind', 'motif', 'nature', 'leave_type', 'type_conge'],
};

const APPROVED = ['valide', 'validee', 'approuve', 'approuvee', 'approved', 'accepte', 'acceptee', 'accepted', 'ok', 'true'];

const plain = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

function pick(record: Record<string, any>, names: string[]): any {
  for (const n of names) if (record[n] != null && record[n] !== '') return record[n];
  return null;
}

const exact = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);

function toDay(v: unknown): string | null {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function toKind(v: unknown): 'conge' | 'absence' | 'maladie' | 'autre' {
  const k = plain(v);
  if (k.includes('malad') || k.includes('sick') || k.includes('arret')) return 'maladie';
  if (k.includes('absen')) return 'absence';
  if (!k || k.includes('cong') || k.includes('vacan') || k.includes('rtt') || k.includes('paid') || k.includes('cp')) return 'conge';
  return 'autre';
}

export type LeaveSyncResult = { ok: boolean; action: string; detail: string };

export async function handleLeaveEvent(supabase: SupabaseClient, payload: any): Promise<LeaveSyncResult> {
  // Format Supabase Database Webhook : { type, table, record, old_record }
  const type = String(payload?.type || 'UPSERT').toUpperCase();
  const record: Record<string, any> = (type === 'DELETE' ? payload?.old_record : payload?.record) ?? payload ?? {};
  const externalId = record.id != null ? String(record.id) : null;
  if (!externalId) return { ok: false, action: 'ignoré', detail: `aucun identifiant « id » dans la ligne reçue (colonnes : ${Object.keys(record).join(', ')})` };

  const removeExisting = async (why: string) => {
    const { count } = await supabase
      .from('trainer_absences')
      .delete({ count: 'exact' })
      .eq('source', 'conges')
      .eq('external_id', externalId);
    return { ok: true, action: 'retiré', detail: `congé ${externalId} ${why} (${count ?? 0} retiré)` };
  };

  if (type === 'DELETE') return removeExisting('supprimé dans la plateforme de congés');

  const status = pick(record, FIELDS.status);
  if (status != null && !APPROVED.includes(plain(status))) return removeExisting(`non validé (statut « ${status} »)`);

  const start = toDay(pick(record, FIELDS.start));
  const end = toDay(pick(record, FIELDS.end)) || start;
  if (!start || !end) {
    return { ok: false, action: 'ignoré', detail: `dates introuvables (colonnes reçues : ${Object.keys(record).join(', ')})` };
  }

  // Formateur : par e-mail, sinon par nom complet.
  let trainerId: string | null = null;
  const email = pick(record, FIELDS.email);
  if (email) {
    const { data } = await supabase.from('trainers').select('id').ilike('email', exact(String(email).trim())).limit(1).maybeSingle();
    trainerId = data?.id ?? null;
  }
  if (!trainerId) {
    const first = pick(record, FIELDS.first);
    const last = pick(record, FIELDS.last);
    const name = first && last ? `${first} ${last}` : pick(record, FIELDS.name);
    if (name) {
      const { data } = await supabase.from('trainers').select('id').ilike('full_name', exact(String(name).trim())).limit(1).maybeSingle();
      trainerId = data?.id ?? null;
    }
  }
  if (!trainerId) {
    return {
      ok: true,
      action: 'ignoré',
      detail: `aucun formateur correspondant (e-mail « ${email ?? '—'} ») — normal s'il ne s'agit pas d'un formateur`,
    };
  }

  const row = {
    trainer_id: trainerId,
    start_date: start <= end ? start : end,
    end_date: start <= end ? end : start,
    kind: toKind(pick(record, FIELDS.kind)),
    note: 'Plateforme de congés',
    source: 'conges',
    external_id: externalId,
  };
  const { data: existing } = await supabase
    .from('trainer_absences')
    .select('id')
    .eq('source', 'conges')
    .eq('external_id', externalId)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from('trainer_absences').update(row).eq('id', existing.id)
    : await supabase.from('trainer_absences').insert(row);
  if (error) return { ok: false, action: 'erreur', detail: error.message };
  return { ok: true, action: existing ? 'mis à jour' : 'ajouté', detail: `congé du ${start} au ${end}` };
}
