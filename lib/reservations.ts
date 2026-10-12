/**
 * Places réservées par entreprise (sans les noms). Un stagiaire validé de la
 * même entreprise occupe une des places réservées : il n'est pas compté deux fois.
 */
export type Reservation = { id: string; session_id: string; company: string; seats: number; note?: string | null };

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
  const rows = reservations.map((r) => {
    const k = key(r.company);
    const used = Math.min(r.seats, named.get(k) || 0);
    named.set(k, (named.get(k) || 0) - used);
    return { ...r, named: used, unnamed: r.seats - used };
  });
  return { rows, unnamed: rows.reduce((n, r) => n + r.unnamed, 0) };
}

/** Charge les réservations de plusieurs sessions (vide si la migration 20 manque). */
export async function loadReservations(supabase: any, sessionIds: string[]): Promise<Record<string, Reservation[]>> {
  const map: Record<string, Reservation[]> = {};
  if (!sessionIds.length) return map;
  for (let i = 0; i < sessionIds.length; i += 200) {
    const { data, error } = await supabase
      .from('session_reservations')
      .select('id, session_id, company, seats, note')
      .in('session_id', sessionIds.slice(i, i + 200))
      .order('created_at');
    if (error) return {};
    for (const r of (data as Reservation[]) || []) (map[r.session_id] ||= []).push(r);
  }
  return map;
}
