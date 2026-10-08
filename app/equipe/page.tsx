import Link from 'next/link';
import { CalendarClock, CalendarOff } from 'lucide-react';
import { absenceText, type Absence } from '@/lib/absences';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { loadDayOverrides, hoursByMonth } from '@/lib/history';
import { MonthlyTable } from '@/components/monthly-table';
import { formatHours, formatSessionPeriod } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { SESSION_STATUS_LABEL } from '@/lib/status';

type Trainer = { id: string; full_name: string; color: string | null; status: string; specialty: string | null; referent_id: string | null };
type Session = { id: string; title: string; status: string; start_at: string; end_at: string; trainer_id: string };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const { annee } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const isAdmin = profile?.role === 'admin';

  if (!profile || (profile.role !== 'referent' && !isAdmin)) {
    return (
      <main>
        <Sidebar active="/equipe" profile={profile} />
        <section className="content">
          <p className="empty">Cette page est réservée aux référents cadres et au bureau administratif.</p>
        </section>
      </main>
    );
  }

  let trainersQuery = supabase
    .from('trainers')
    .select('id, full_name, color, status, specialty, referent_id')
    .order('full_name');
  if (!isAdmin) trainersQuery = trainersQuery.eq('referent_id', profile.id);
  const [{ data: trainersData }, { data: profiles }] = await Promise.all([
    trainersQuery,
    supabase.from('profiles').select('id, full_name, role'),
  ]);
  const trainers = (trainersData || []) as Trainer[];

  const now = new Date();
  const nowIso = now.toISOString();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const year = Number.parseInt(annee || '', 10) || currentYear;
  // Sessions couvrant l'année affichée et l'année en cours (pour les cartes).
  const fromYear = Math.min(year, currentYear);
  const toYear = Math.max(year, currentYear);

  const ids = trainers.map((t) => t.id);
  const { data: sessionsData } = ids.length
    ? await supabase
        .from('sessions')
        .select('id, title, status, start_at, end_at, trainer_id')
        .in('trainer_id', ids)
        .gte('end_at', `${fromYear}-01-01`)
        .lt('start_at', `${toYear + 1}-01-01`)
        .order('start_at')
    : { data: [] as Session[] };
  const sessions = (sessionsData || []) as Session[];
  const overrides = await loadDayOverrides(supabase, sessions.map((s) => s.id));

  // Congés en cours ou dans les 30 prochains jours.
  const today = nowIso.slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const { data: absencesData } = ids.length
    ? await supabase
        .from('trainer_absences')
        .select('id, trainer_id, start_date, end_date, kind')
        .in('trainer_id', ids)
        .gte('end_date', today)
        .lte('start_date', in30)
        .order('start_date')
    : { data: [] as any[] };
  const absences = (absencesData || []) as Absence[];

  const total = (a: number[]) => a.reduce((n, x) => n + x, 0);

  function statsFor(t: Trainer) {
    const own = sessions.filter((s) => s.trainer_id === t.id && s.status !== 'brouillon');
    const upcoming = own.filter((s) => s.end_at >= nowIso);
    const current = hoursByMonth(own, overrides, currentYear);
    return {
      month: current.done[currentMonth] + current.planned[currentMonth],
      year: total(current.done),
      upcoming,
      waiting: upcoming.filter((s) => s.status === 'planifiee').length,
      next: upcoming[0] || null,
    };
  }

  // Regroupement par référent (vue admin) ou une seule équipe (vue référent).
  const profileName = new Map((profiles || []).map((p: any) => [p.id, p.full_name as string]));
  const teams = new Map<string, Trainer[]>();
  for (const t of trainers) {
    const key = t.referent_id || '';
    (teams.get(key) || teams.set(key, []).get(key)!).push(t);
  }
  const teamList = [...teams.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : (profileName.get(a) || '').localeCompare(profileName.get(b) || '', 'fr')));

  const allStats = trainers.map(statsFor);
  const totalMonth = Math.round(allStats.reduce((n, s) => n + s.month, 0) * 10) / 10;
  const totalUpcoming = allStats.reduce((n, s) => n + s.upcoming.length, 0);
  const totalWaiting = allStats.reduce((n, s) => n + s.waiting, 0);

  return (
    <main>
      <Sidebar active="/equipe" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Suivi</p>
            <h1>{isAdmin ? 'Équipes & suivi des formateurs' : 'Mon équipe'}</h1>
            <p>
              {isAdmin
                ? 'Chaque référent cadre et les formateurs qu’il suit. Le rattachement se fait dans Formateurs → Modifier.'
                : 'Les formateurs dont tu es le référent, avec leur charge et leurs prochaines sessions.'}
            </p>
          </div>
        </header>

        <div className="stats">
          <div className="stat"><span>Formateurs suivis</span><strong>{trainers.length}</strong></div>
          <div className="stat"><span>Heures ce mois-ci</span><strong>{formatHours(totalMonth)}</strong><small>hors brouillons</small></div>
          <div className="stat"><span>Sessions à venir</span><strong>{totalUpcoming}</strong></div>
          <div className="stat"><span>En attente de confirmation</span><strong>{totalWaiting}</strong><small>sessions à venir</small></div>
        </div>

        {trainers.length === 0 && (
          <p className="empty">
            Aucun formateur rattaché{isAdmin ? '' : ' à toi'} pour l’instant. Un administrateur peut associer un référent à chaque
            formateur depuis la page Formateurs.
          </p>
        )}

        {trainers.length > 0 && (
          <MonthlyTable
            title={`Suivi mois par mois : ${isAdmin ? 'tous les formateurs' : 'mon équipe'}`}
            year={year}
            yearHref={(y) => `/equipe?annee=${y}`}
            rows={trainers.map((t) => ({
              label: t.full_name,
              href: `/formateurs/${t.id}?annee=${year}`,
              color: t.color || DEFAULT_TRAINER_COLOR,
              ...hoursByMonth(
                sessions.filter((s) => s.trainer_id === t.id),
                overrides,
                year
              ),
            }))}
          />
        )}

        {teamList.map(([referentId, members]) => (
          <section key={referentId || 'none'}>
            {isAdmin && (
              <h2 className="sub-heading">
                {referentId ? `Équipe de ${profileName.get(referentId) || 'référent inconnu'}` : 'Formateurs sans référent'}
                {' '}<span className="hint">({members.length})</span>
              </h2>
            )}
            <div className="team-grid">
              {members.map((t) => {
                const st = statsFor(t);
                return (
                  <Link key={t.id} href={`/formateurs/${t.id}`} className="team-card" style={{ ['--c' as any]: t.color || DEFAULT_TRAINER_COLOR }}>
                    <h3>
                      <span className="trainer-tag">
                        <span className="swatch" style={{ background: t.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                        {t.full_name}
                      </span>
                      {t.status === 'inactif' && <span className="badge inactif">Inactif</span>}
                    </h3>
                    {t.specialty && <span className="hint">{t.specialty}</span>}
                    {absences
                      .filter((a) => a.trainer_id === t.id)
                      .map((a) => (
                        <span key={a.id} className="sc-absence" style={{ fontSize: 12 }}>
                          <CalendarOff size={13} aria-hidden /> {a.start_date <= today ? 'Actuellement' : 'Bientôt'} {absenceText(a)}
                        </span>
                      ))}
                    <div className="mini-stats">
                      <div><strong>{formatHours(st.month)}</strong><span>ce mois</span></div>
                      <div><strong>{formatHours(st.year)}</strong><span>réalisées {currentYear}</span></div>
                      <div><strong>{st.upcoming.length}</strong><span>à venir</span></div>
                    </div>
                    <div className="next">
                      {st.next ? (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <CalendarClock size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>
                            <strong>{st.next.title}</strong> · {st.next.start_at.slice(0, 10).split('-').reverse().join('/')}{' '}
                            {formatSessionPeriod(st.next.start_at, st.next.end_at)}{' '}
                            <span className={`status-pill ${st.next.status}`}>{SESSION_STATUS_LABEL[st.next.status]}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="hint">Aucune session à venir</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
