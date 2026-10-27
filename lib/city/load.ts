import { canManage } from '@/lib/roles';
import { addDays, effectiveDayTime, isoDate, weekdaysBetween } from '@/lib/week';
import { sessionAlerts } from '@/lib/session-alerts';
import {
  defaultLook,
  sanitizeLook,
  type BuildingId,
  type CityLink,
  type CityRoom,
  type CitySession,
  type CityState,
  type CityTrainer,
  type WorkshopFamily,
} from './types';

/**
 * Adaptateur métier → état de la ville, pour une date donnée.
 * Lecture seule, avec le client Supabase de l'utilisateur : le RLS existant
 * s'applique (ce qu'un compte ne peut pas lire n'apparaît pas dans la ville).
 */

type Profile = { id: string; role: string; trainer_id?: string | null; can_invoice?: boolean; can_dev?: boolean };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Bâtiment d'une salle : renseigné, sinon déduit du numéro (1–3 : BAT 1, 4–6 : BAT 2), comme lib/buildings.ts. */
function buildingOf(room: { name: string; location?: string | null }): { building: BuildingId | null; number: number | null } {
  const n = Number(room.name.match(/(\d+)/)?.[1]) || null;
  if (room.location === 'BAT 1') return { building: 'bat1', number: n };
  if (room.location === 'BAT 2') return { building: 'bat2', number: n };
  if (n && n >= 1 && n <= 3) return { building: 'bat1', number: n };
  if (n && n >= 4 && n <= 6) return { building: 'bat2', number: n };
  return { building: null, number: n };
}

/** Familles d'équipements d'après les formations possibles dans la salle (mots-clés). */
const FAMILY_RULES: [WorkshopFamily, RegExp][] = [
  ['irve', /\b(irve|borne|recharge|vehicule electrique|ve\b)/],
  ['aerien', /(aerien|poteau|hauteur|elagage|nacelle|ligne)/],
  ['souterrain', /(souterrain|tranchee|terrassement|fouille|cable|raccordement|genie civil|gc\b)/],
  ['fibre', /(fibre|optique|ftth|telecom|fttx)/],
  ['electrique', /(habilitation|electri|armoire|tableau|b0|h0|br\b|bt\b|hta|consignation)/],
];
export function familiesOf(texts: string[]): WorkshopFamily[] {
  const all = texts
    .join(' · ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return FAMILY_RULES.filter(([, re]) => re.test(all)).map(([f]) => f);
}

/** Prénom seul ; initiale du nom ajoutée s'il y a des homonymes. */
function labels(trainers: { id: string; full_name: string }[]): Record<string, string> {
  const first = (n: string) => n.trim().split(/\s+/)[0] || n;
  const count: Record<string, number> = {};
  for (const t of trainers) count[first(t.full_name)] = (count[first(t.full_name)] || 0) + 1;
  return Object.fromEntries(
    trainers.map((t) => {
      const f = first(t.full_name);
      const rest = t.full_name.trim().split(/\s+/).slice(1).join(' ');
      return [t.id, count[f] > 1 && rest ? `${f} ${rest[0].toUpperCase()}.` : f];
    })
  );
}

/** Liens du bungalow Administration : mêmes droits que le menu de la plateforme. */
function adminLinks(p: Profile): CityLink[] {
  const staff = canManage(p.role);
  const links: CityLink[] = [
    { href: '/tableau-de-bord', label: 'Tableau de bord' },
    { href: '/', label: 'Planning' },
    { href: '/sessions', label: 'Sessions' },
  ];
  if (p.trainer_id) links.push({ href: `/formateurs/${p.trainer_id}`, label: 'Mon historique' });
  if (staff) links.push({ href: '/equipe', label: 'Équipes & suivi' }, { href: '/suivi', label: 'Suivi interne' }, { href: '/modeles', label: 'Formations' }, { href: '/stagiaires', label: 'Stagiaires' });
  if (p.role === 'referent') links.push({ href: '/equipe', label: 'Mon équipe' });
  if (p.can_invoice || p.role === 'admin') links.push({ href: '/facturation', label: 'Facturation' });
  if (p.role === 'admin') links.push({ href: '/formateurs', label: 'Formateurs' }, { href: '/salles', label: 'Salles' }, { href: '/administration', label: 'Administration' }, { href: '/salaries', label: 'Salariés' });
  return links;
}

export async function loadCityState(supabase: any, date: string, profile: Profile): Promise<CityState> {
  const staff = canManage(profile.role);
  const in7 = isoDate(addDays(new Date(date + 'T00:00:00Z'), 7));

  const [roomsRes, sessRes, trainersRes, absRes, upcomingRes, avatarsRes] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity, location, status, is_holding').order('name'),
    supabase
      .from('sessions')
      .select('id, title, status, start_at, end_at, trainer_id, room_id, session_trainees(status)')
      .neq('status', 'brouillon')
      .lte('start_at', `${date}T23:59:59`)
      .gte('end_at', `${date}T00:00:00`)
      .limit(300),
    supabase.from('trainers').select('id, full_name, color, status, is_external').order('full_name'),
    // Type d'absence seulement : le motif (note) n'est jamais lu ici.
    supabase.from('trainer_absences').select('trainer_id, kind').lte('start_date', date).gte('end_date', date),
    supabase
      .from('sessions')
      .select('id, title, status, start_at, trainer_id, session_trainees(status)')
      .neq('status', 'brouillon')
      .gt('start_at', `${date}T23:59:59`)
      .lte('start_at', `${in7}T23:59:59`)
      .order('start_at')
      .limit(200),
    supabase.from('city_avatars').select('trainer_id, skin, hair, hair_color, top_color, bottom_color, accessory, vacation'),
  ]);

  const allRooms = ((roomsRes.data as any[]) || []) as any[];
  const roomById = new Map(allRooms.map((r) => [r.id, r]));
  const sessionsRaw = (((sessRes.data as any[]) || []) as any[]).filter((s) => weekdaysBetween(s.start_at, s.end_at).includes(date));
  const ids = sessionsRaw.map((s) => s.id);
  const roomIds = allRooms.filter((r) => !r.is_holding && r.status !== 'exterieur').map((r) => r.id);

  const [daysRes, replRes, signRes, rtRes, wsRes] = await Promise.all([
    ids.length ? supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', ids).eq('day', date) : { data: [] },
    ids.length ? supabase.from('session_day_trainers').select('session_id, trainer_id').in('session_id', ids).eq('day', date) : { data: [] },
    ids.length
      ? supabase.from('attendance_signatures').select('session_id, trainee_id, half').in('session_id', ids).eq('day', date).eq('signer', 'stagiaire').eq('status', 'signe')
      : { data: [] },
    roomIds.length ? supabase.from('room_templates').select('room_id, templates(title)').in('room_id', roomIds) : { data: [] },
    roomIds.length ? supabase.from('room_workshops').select('room_id, name, equipment, modules').in('room_id', roomIds) : { data: [] },
  ]);

  // Salles du centre (hors salle d'attente et formations extérieures).
  const rooms: CityRoom[] = allRooms
    .filter((r) => !r.is_holding && r.status !== 'exterieur')
    .map((r) => {
      const texts = [
        ...(((rtRes.data as any[]) || []) as any[]).filter((x) => x.room_id === r.id).map((x) => one<any>(x.templates)?.title || ''),
        ...(((wsRes.data as any[]) || []) as any[]).filter((x) => x.room_id === r.id).flatMap((x) => [x.name, x.equipment || '', x.modules || '']),
      ];
      return {
        id: r.id,
        name: r.name,
        ...buildingOf(r),
        capacity: r.capacity,
        available: r.status !== 'indisponible',
        families: familiesOf(texts),
        workshops: (((wsRes.data as any[]) || []) as any[]).filter((x) => x.room_id === r.id).map((x) => x.name),
      };
    });

  // Émargement : lisible par le formateur de la session, le bureau et la facturation (RLS).
  const signRows = signRes.error ? null : (((signRes.data as any[]) || []) as any[]);
  const signedIds = new Set((signRows || []).map((r) => r.session_id));
  const present = (sid: string, half: 'am' | 'pm') =>
    signRows ? new Set(signRows.filter((r) => r.session_id === sid && r.half === half).map((r) => r.trainee_id)).size : null;

  const repl = new Map(((((replRes.data as any[]) || []) as any[])).map((r) => [r.session_id, r.trainer_id]));
  const sessions: CitySession[] = sessionsRaw.map((s) => {
    const room = s.room_id ? roomById.get(s.room_id) : null;
    const t = effectiveDayTime(date, s.start_at, s.end_at, (((daysRes.data as any[]) || []) as any[]).filter((d) => d.session_id === s.id));
    const trainees = ((s.session_trainees as any[]) || []) as any[];
    const external = room?.status === 'exterieur' ? room.name : null;
    const trainer = repl.get(s.id) || s.trainer_id;
    // Sans émargement ce jour, on ne sait pas : null plutôt que 0 (sauf si la session a des signatures).
    const known = signRows !== null && signedIds.has(s.id);
    return {
      id: s.id,
      title: s.title,
      roomId: room && !room.is_holding && !external ? room.id : null,
      building: room && !room.is_holding && !external ? buildingOf(room).building : null,
      external,
      start: t.start,
      end: t.end,
      trainerIds: trainer ? [trainer] : [],
      validated: trainees.filter((x) => x.status === 'validee').length,
      waiting: trainees.filter((x) => x.status === 'en_attente').length,
      presentAm: known ? present(s.id, 'am') : null,
      presentPm: known ? present(s.id, 'pm') : null,
      status: s.status === 'confirmee' ? 'confirmee' : 'planifiee',
    };
  });

  // Formateurs : statut du jour. Seul le type « congé » mène au Beach Club ;
  // les autres absences donnent « Indisponible », sans motif.
  const absences = (((absRes.data as any[]) || []) as any[]);
  const avatarRows = avatarsRes.error ? [] : (((avatarsRes.data as any[]) || []) as any[]);
  const looks = new Map(avatarRows.map((a) => [a.trainer_id, a]));
  const trainersRaw = (((trainersRes.data as any[]) || []) as any[]);
  const working = new Set(sessions.flatMap((s) => s.trainerIds));
  const visible = trainersRaw.filter((t) => working.has(t.id) || (t.status !== 'inactif' && !t.is_external));
  const names = labels(visible);
  const trainers: CityTrainer[] = visible.map((t) => {
    const mine = sessions.filter((s) => s.trainerIds.includes(t.id));
    const abs = absences.filter((a) => a.trainer_id === t.id);
    const status: CityTrainer['status'] = mine.some((s) => !s.external)
      ? 'formation'
      : mine.length
        ? 'exterieur'
        : abs.some((a) => a.kind === 'conge')
          ? 'conge'
          : abs.length
            ? 'indisponible'
            : 'non_affecte';
    const row = looks.get(t.id);
    const base = defaultLook(t.id, t.color);
    return {
      id: t.id,
      label: names[t.id],
      status,
      sessionIds: mine.map((s) => s.id),
      look: row
        ? sanitizeLook({ skin: row.skin, hair: row.hair, hairColor: row.hair_color, top: row.top_color, bottom: row.bottom_color, accessory: row.accessory, vacation: row.vacation }, base)
        : base,
      custom: Boolean(row),
    };
  });

  const upcomingRows = (((upcomingRes.data as any[]) || []) as any[]);
  return {
    date,
    generatedAt: new Date().toISOString(),
    rooms,
    sessions,
    trainers,
    upcoming: upcomingRows.length,
    // Relances (comme le tableau de bord) : réservées au bureau.
    alerts: staff ? sessionAlerts(upcomingRows, date).map((a) => ({ id: a.id, title: a.title, reasons: a.reasons })) : [],
    myTrainerId: profile.trainer_id || null,
    adminLinks: adminLinks(profile),
    avatarsMissing: Boolean(avatarsRes.error),
  };
}
