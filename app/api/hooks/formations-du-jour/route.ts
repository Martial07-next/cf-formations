import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { effectiveDayTime, weekdaysBetween } from '@/lib/week';

export const dynamic = 'force-dynamic';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JOURS = 62;

function same(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Formations de chaque formateur jour par jour sur une période (?du=AAAA-MM-JJ
 * &au=AAAA-MM-JJ, 62 jours au plus), pour le « Planning équipe » de la
 * plateforme CF Réseaux Congés. Même règles que formations-du-jour : jours
 * ouvrés, remplaçants d'un jour, horaires propres à un jour, brouillons ignorés.
 *
 * Protégé par PLANNING_API_SECRET (« Authorization: Bearer <secret> »).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.PLANNING_API_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'PLANNING_API_SECRET non configuré.' }, { status: 503 });
  if (!same(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const du = request.nextUrl.searchParams.get('du') || '';
  const au = request.nextUrl.searchParams.get('au') || '';
  if (!JOUR.test(du) || !JOUR.test(au) || du > au) {
    return NextResponse.json({ ok: false, error: 'Paramètres du / au invalides.' }, { status: 400 });
  }
  const ecart = (Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86400000;
  if (ecart > MAX_JOURS) return NextResponse.json({ ok: false, error: `Période limitée à ${MAX_JOURS} jours.` }, { status: 400 });

  const supabase = createAdminClient();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, trainer_id, rooms(name)')
    .lte('start_at', `${au}T23:59:59`)
    .gte('end_at', `${du}T00:00:00`)
    .neq('status', 'brouillon');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const list = (sessions as any[]) || [];
  const ids = list.map((s) => s.id);
  const [{ data: dayRows }, { data: replacements }] = await Promise.all([
    ids.length
      ? supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', ids).gte('day', du).lte('day', au)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase.from('session_day_trainers').select('session_id, day, trainer_id').in('session_id', ids).gte('day', du).lte('day', au)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const rows: { date: string; trainerId: string; sessionId: string; formation: string; debut: string; fin: string; salle: string | null }[] = [];
  for (const s of list) {
    const room = Array.isArray(s.rooms) ? s.rooms[0] : s.rooms;
    const joursSession = ((dayRows as any[]) || []).filter((d) => d.session_id === s.id);
    for (const day of weekdaysBetween(s.start_at, s.end_at)) {
      if (day < du || day > au) continue;
      const trainerId = ((replacements as any[]) || []).find((r) => r.session_id === s.id && r.day === day)?.trainer_id || s.trainer_id;
      if (!trainerId) continue;
      const t = effectiveDayTime(day, s.start_at, s.end_at, joursSession);
      rows.push({ date: day, trainerId, sessionId: s.id, formation: s.title, debut: t.start, fin: t.end, salle: (room?.name as string) || null });
    }
  }

  const trainerIds = [...new Set(rows.map((r) => r.trainerId))];
  const { data: trainers } = trainerIds.length
    ? await supabase.from('trainers').select('id, full_name, email').in('id', trainerIds)
    : { data: [] as any[] };

  const formateurs = rows
    .map((r) => {
      const t = ((trainers as any[]) || []).find((x) => x.id === r.trainerId);
      return t
        ? { date: r.date, nom: t.full_name as string, email: (t.email as string | null) || null, sessionId: r.sessionId, formation: r.formation, debut: r.debut, fin: r.fin, salle: r.salle }
        : null;
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, du, au, formateurs }, { headers: { 'Cache-Control': 'no-store' } });
}
