import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parisToday } from '@/lib/paris-time';
import { effectiveDayTime, weekdaysBetween } from '@/lib/week';

export const dynamic = 'force-dynamic';

function same(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Formateurs en formation aujourd'hui (heure de Paris), pour l'« Équipe en
 * direct » de la plateforme CF Réseaux Congés : nom, e-mail, intitulé et
 * horaires du jour. Tient compte des remplaçants d'un jour et des horaires
 * propres à un jour ; les brouillons sont ignorés.
 *
 * Protégé par PLANNING_API_SECRET (« Authorization: Bearer <secret> »),
 * même valeur des deux côtés. Sans secret configuré, tout est refusé.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.PLANNING_API_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'PLANNING_API_SECRET non configuré.' }, { status: 503 });
  if (!same(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const day = parisToday();
  const supabase = createAdminClient();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, trainer_id, rooms(name)')
    .lte('start_at', `${day}T23:59:59`)
    .gte('end_at', `${day}T00:00:00`)
    .neq('status', 'brouillon');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const list = ((sessions as any[]) || []).filter((s) => weekdaysBetween(s.start_at, s.end_at).includes(day));
  const ids = list.map((s) => s.id);
  const [{ data: dayRows }, { data: replacements }] = await Promise.all([
    ids.length ? supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', ids).eq('day', day) : Promise.resolve({ data: [] as any[] }),
    ids.length ? supabase.from('session_day_trainers').select('session_id, trainer_id').in('session_id', ids).eq('day', day) : Promise.resolve({ data: [] as any[] }),
  ]);

  const rows = list
    .map((s) => {
      const trainerId = ((replacements as any[]) || []).find((r) => r.session_id === s.id)?.trainer_id || s.trainer_id;
      const t = effectiveDayTime(day, s.start_at, s.end_at, ((dayRows as any[]) || []).filter((d) => d.session_id === s.id));
      const room = Array.isArray(s.rooms) ? s.rooms[0] : s.rooms;
      return { trainerId, sessionId: s.id as string, formation: s.title as string, debut: t.start, fin: t.end, salle: (room?.name as string) || null };
    })
    .filter((r) => r.trainerId);

  const trainerIds = [...new Set(rows.map((r) => r.trainerId))];
  const { data: trainers } = trainerIds.length
    ? await supabase.from('trainers').select('id, full_name, email').in('id', trainerIds)
    : { data: [] as any[] };

  const formateurs = rows
    .map((r) => {
      const t = ((trainers as any[]) || []).find((x) => x.id === r.trainerId);
      // Lien de la fiche session (connexion au planning obligatoire pour l'ouvrir).
      return t
        ? { nom: t.full_name as string, email: (t.email as string | null) || null, sessionId: r.sessionId, formation: r.formation, debut: r.debut, fin: r.fin, salle: r.salle }
        : null;
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, date: day, formateurs }, { headers: { 'Cache-Control': 'no-store' } });
}
