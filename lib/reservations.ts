/**
 * Places réservées par entreprise (sans les noms). Un stagiaire validé de la
 * même entreprise occupe une des places réservées : il n'est pas compté deux fois.
 */
export type Reservation = {
  id: string;
  session_id: string;
  company: string;
  seats: number;
  note?: string | null;
  /** « en_attente » : pas encore confirmées, hors capacité (migration 50). */
  status?: 'validee' | 'en_attente' | null;
};
export const isPendingReservation = (r: Pick<Reservation, 'status'>) => r.status === 'en_attente';

const key = (v: string | null | undefined) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Pour chaque réservation : places déjà nommées et places encore sans nom. */
export function reservationStatus(reservations: Reservation[], validatedCompanies: (string | null | undefined)[]) {
  const named = new Map<string, number>();
  for (const c of validatedCompanies) {
    const k = key(c);
    if (k) named.set(k, (named.get(k) || 0) + 1);
  }
  // Places validées d'abord : un stagiaire validé ne remplit jamais une place en attente.
  const ordered = [...reservations].sort((a, b) => Number(isPendingReservation(a)) - Number(isPendingReservation(b)));
  const done = new Map<string, { named: number; unnamed: number }>();
  for (const r of ordered) {
    if (isPendingReservation(r)) {
      done.set(r.id, { named: 0, unnamed: r.seats });
      continue;
    }
    const k = key(r.company);
    const used = Math.min(r.seats, named.get(k) || 0);
    named.set(k, (named.get(k) || 0) - used);
    done.set(r.id, { named: used, unnamed: r.seats - used });
  }
  const rows = reservations.map((r) => ({ ...r, ...done.get(r.id)! }));
  return {
    rows,
    /** Places validées encore sans nom : comptées dans la capacité. */
    unnamed: rows.filter((r) => !isPendingReservation(r)).reduce((n, r) => n + r.unnamed, 0),
    /** Places en attente : hors capacité, ajoutées aux « en attente ». */
    pending: rows.filter(isPendingReservation).reduce((n, r) => n + r.seats, 0),
  };
}

/** Charge les réservations de plusieurs sessions (vide si la migration 20 manque). */
export async function loadReservations(supabase: any, sessionIds: string[]): Promise<Record<string, Reservation[]>> {
  const map: Record<string, Reservation[]> = {};
  if (!sessionIds.length) return map;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const ids = sessionIds.slice(i, i + 200);
    let { data, error } = await supabase.from('session_reservations').select('id, session_id, company, seats, note, status').in('session_id', ids).order('created_at');
    // Sans la migration 50 : toutes les places sont validées.
    if (error) ({ data, error } = await supabase.from('session_reservations').select('id, session_id, company, seats, note').in('session_id', ids).order('created_at'));
    if (error) return {};
    for (const r of (data as Reservation[]) || []) (map[r.session_id] ||= []).push(r);
  }
  return map;
}
