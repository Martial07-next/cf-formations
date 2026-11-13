/**
 * Export en lecture seule des inscriptions vers la plateforme E-learning
 * (CF Réseaux LMS). Fonctions pures, sans accès à la base : la route
 * /api/hooks/lms/enrollments lit les tables et confie l'assemblage à ce fichier.
 *
 * Données volontairement limitées au strict nécessaire (RGPD) : jamais de
 * signature, d'adresse, de note de suivi ni de détail de départ anticipé.
 */

export const LMS_MAX_RANGE_DAYS = 400;
export const LMS_PAGE_SIZE = 50;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export type LmsSessionRow = {
  id: string;
  title: string;
  reference: string | null;
  digiforma_ref: string | null;
  status: string;
  start_at: string;
  end_at: string;
  template_id: string | null;
  templates?: { id: string; title: string; codification: string | null; category: string | null } | { id: string; title: string; codification: string | null; category: string | null }[] | null;
};
export type LmsLinkRow = { session_id: string; trainee_id: string; status: string; cursus: string | null; added_at: string | null; status_at: string | null };
export type LmsTraineeRow = { id: string; full_name: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null };
export type LmsAttendanceRow = { session_id: string; trainee_id: string | null; day: string; half: string; status: string };
export type LmsDepartureRow = { session_id: string; trainee_id: string; departed_at: string; reason: string };

export type LmsEnrollment = {
  session: {
    id: string;
    title: string;
    reference: string | null;
    digiformaRef: string | null;
    status: string;
    startAt: string;
    endAt: string;
    formation: { id: string; title: string; codification: string | null; category: string | null } | null;
  };
  trainee: { id: string; firstName: string | null; lastName: string | null; fullName: string; email: string | null; company: string | null };
  enrollment: { status: string; cursus: string | null; addedAt: string | null; statusAt: string | null };
  attendance: {
    halfDaysSigned: number;
    halfDaysAbsent: number;
    firstSignedDay: string | null;
    lastSignedDay: string | null;
    records: { day: string; half: string; status: string }[];
  };
  earlyDeparture: { departedAt: string; reason: string } | null;
};

/** Vérifie la période demandée (?du=AAAA-MM-JJ&au=AAAA-MM-JJ) et la page. */
export function parseLmsQuery(params: URLSearchParams): { ok: true; du: string; au: string; page: number } | { ok: false; error: string } {
  const du = params.get('du') || '';
  const au = params.get('au') || '';
  if (!JOUR.test(du) || !JOUR.test(au) || Number.isNaN(Date.parse(`${du}T00:00:00Z`)) || Number.isNaN(Date.parse(`${au}T00:00:00Z`)) || du > au) {
    return { ok: false, error: 'Paramètres du / au invalides (AAAA-MM-JJ, du ≤ au).' };
  }
  const ecart = (Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86400000;
  if (ecart > LMS_MAX_RANGE_DAYS) return { ok: false, error: `Période limitée à ${LMS_MAX_RANGE_DAYS} jours.` };
  const rawPage = params.get('page') || '1';
  if (!/^\d{1,5}$/.test(rawPage) || Number(rawPage) < 1) return { ok: false, error: 'Paramètre page invalide (entier ≥ 1).' };
  return { ok: true, du, au, page: Number(rawPage) };
}

/** Assemble une ligne par (session, stagiaire). Stagiaires absents de la liste (corbeille) ignorés. */
export function buildLmsEnrollments(
  sessions: LmsSessionRow[],
  links: LmsLinkRow[],
  trainees: LmsTraineeRow[],
  attendance: LmsAttendanceRow[],
  departures: LmsDepartureRow[]
): LmsEnrollment[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const traineeById = new Map(trainees.map((t) => [t.id, t]));
  const key = (s: string, t: string) => `${s}|${t}`;

  const att = new Map<string, LmsAttendanceRow[]>();
  for (const a of attendance) {
    if (!a.trainee_id) continue;
    const k = key(a.session_id, a.trainee_id);
    const list = att.get(k);
    if (list) list.push(a);
    else att.set(k, [a]);
  }
  // Plusieurs départs pour un même stagiaire (cas anormal) : le plus tôt fait foi.
  const dep = new Map<string, LmsDepartureRow>();
  for (const d of departures) {
    const k = key(d.session_id, d.trainee_id);
    const prev = dep.get(k);
    if (!prev || d.departed_at < prev.departed_at) dep.set(k, d);
  }

  const out: LmsEnrollment[] = [];
  for (const l of links) {
    const s = sessionById.get(l.session_id);
    const t = traineeById.get(l.trainee_id);
    if (!s || !t) continue;
    const tpl = Array.isArray(s.templates) ? s.templates[0] || null : s.templates || null;
    const rows = (att.get(key(s.id, t.id)) || [])
      .map((a) => ({ day: a.day, half: a.half, status: a.status }))
      .sort((a, b) => `${a.day}${a.half}`.localeCompare(`${b.day}${b.half}`));
    const signedDays = rows.filter((r) => r.status === 'signe').map((r) => r.day);
    const d = dep.get(key(s.id, t.id));
    out.push({
      session: {
        id: s.id,
        title: s.title,
        reference: s.reference,
        digiformaRef: s.digiforma_ref,
        status: s.status,
        startAt: s.start_at,
        endAt: s.end_at,
        formation: tpl ? { id: tpl.id, title: tpl.title, codification: tpl.codification, category: tpl.category } : null,
      },
      trainee: {
        id: t.id,
        firstName: t.first_name,
        lastName: t.last_name,
        fullName: t.full_name,
        email: t.email ? t.email.trim().toLowerCase() : null,
        company: t.company,
      },
      enrollment: { status: l.status, cursus: l.cursus, addedAt: l.added_at, statusAt: l.status_at },
      attendance: {
        halfDaysSigned: signedDays.length,
        halfDaysAbsent: rows.filter((r) => r.status === 'absent').length,
        firstSignedDay: signedDays[0] || null,
        lastSignedDay: signedDays.at(-1) || null,
        records: rows,
      },
      earlyDeparture: d ? { departedAt: d.departed_at, reason: d.reason } : null,
    });
  }
  return out.sort((a, b) => a.session.endAt.localeCompare(b.session.endAt) || a.session.id.localeCompare(b.session.id) || a.trainee.id.localeCompare(b.trainee.id));
}
