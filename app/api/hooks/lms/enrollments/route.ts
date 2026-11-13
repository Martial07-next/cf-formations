import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildLmsEnrollments,
  parseLmsQuery,
  LMS_PAGE_SIZE,
  type LmsAttendanceRow,
  type LmsDepartureRow,
  type LmsLinkRow,
  type LmsSessionRow,
  type LmsTraineeRow,
} from '@/lib/lms-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function same(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const LOT = 1000; // Supabase renvoie au plus 1000 lignes par requête : lecture par tranches.

async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += LOT) {
    const { data, error } = await query(from, from + LOT - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[]) || [];
    out.push(...rows);
    if (rows.length < LOT) return out;
  }
}

/**
 * Inscriptions des sessions terminant sur une période (?du=AAAA-MM-JJ
 * &au=AAAA-MM-JJ, 400 jours au plus, &page=N, 50 sessions par page), pour la
 * plateforme E-learning CF Réseaux LMS : stagiaire, session, formation du
 * catalogue, statut d'inscription, émargements par demi-journée, départ anticipé.
 *
 * LECTURE SEULE : aucune écriture en base. Brouillons et stagiaires à la
 * corbeille exclus. Ni signature, ni adresse, ni note de suivi.
 *
 * Protégé par LMS_API_SECRET (« Authorization: Bearer <secret> »), distinct
 * de PLANNING_API_SECRET pour pouvoir le révoquer séparément.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.LMS_API_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'LMS_API_SECRET non configuré.' }, { status: 503 });
  if (!same(request.headers.get('authorization') || '', `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const q = parseLmsQuery(request.nextUrl.searchParams);
  if (!q.ok) return NextResponse.json({ ok: false, error: q.error }, { status: 400 });

  try {
    const supabase = createAdminClient();
    const offset = (q.page - 1) * LMS_PAGE_SIZE;
    // Une session de plus que la page : indique s'il reste une page suivante.
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, reference, digiforma_ref, status, start_at, end_at, template_id, templates(id, title, codification, category)')
      .gte('end_at', `${q.du}T00:00:00`)
      .lte('end_at', `${q.au}T23:59:59`)
      .neq('status', 'brouillon')
      .order('end_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + LMS_PAGE_SIZE);
    if (sessionError) throw new Error(sessionError.message);

    const all = (sessionData as unknown as LmsSessionRow[]) || [];
    const hasMore = all.length > LMS_PAGE_SIZE;
    const sessions = all.slice(0, LMS_PAGE_SIZE);
    const ids = sessions.map((s) => s.id);

    let enrollments: ReturnType<typeof buildLmsEnrollments> = [];
    if (ids.length) {
      const links = await readAll<LmsLinkRow>((from, to) =>
        supabase.from('session_trainees').select('session_id, trainee_id, status, cursus, added_at, status_at').in('session_id', ids).order('session_id').order('trainee_id').range(from, to)
      );
      const traineeIds = [...new Set(links.map((l) => l.trainee_id))];
      const [trainees, attendance, departures] = await Promise.all([
        traineeIds.length
          ? readAll<LmsTraineeRow>((from, to) =>
              supabase.from('trainees').select('id, full_name, first_name, last_name, email, company').in('id', traineeIds).is('trashed_at', null).order('id').range(from, to)
            )
          : Promise.resolve([] as LmsTraineeRow[]),
        readAll<LmsAttendanceRow>((from, to) =>
          supabase.from('attendance_signatures').select('session_id, trainee_id, day, half, status').in('session_id', ids).eq('signer', 'stagiaire').order('id').range(from, to)
        ),
        readAll<LmsDepartureRow>((from, to) =>
          supabase.from('early_departures').select('session_id, trainee_id, departed_at, reason').in('session_id', ids).order('id').range(from, to)
        ),
      ]);
      enrollments = buildLmsEnrollments(sessions, links, trainees, attendance, departures);
    }

    return NextResponse.json(
      { ok: true, du: q.du, au: q.au, page: q.page, pageSize: LMS_PAGE_SIZE, sessions: sessions.length, hasMore, generatedAt: new Date().toISOString(), enrollments },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Message générique : ne jamais renvoyer de détail interne au client externe.
    return NextResponse.json({ ok: false, error: 'Lecture du planning impossible.' }, { status: 500 });
  }
}
