import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { loadDayOverrides, hoursOf } from '@/lib/history';
import { formatHours, formatSessionPeriod } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { SESSION_STATUS_LABEL } from '@/lib/status';

type Trainer = { id: string; full_name: string; color: string | null; status: string; specialty: string | null; referent_id: string | null };
type Session = { id: string; title: string; status: string; start_at: string; end_at: string; trainer_id: string };

export default async function EquipePage() {
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
  const yearStart = `${nowIso.slice(0, 4)}-01-01`;
  const monthStart = `${nowIso.slice(0, 7)}-01`;
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  const ids = trainers.map((t) => t.id);
  const { data: sessionsData } = ids.length
    ? await supabase
        .from('sessions')
        .select('id, title, status, start_at, end_at, trainer_id')
        .in('trainer_id', ids)
        .gte('end_at', yearStart)
        .order('start_at')
    : { data: [] as Session[] };
  const sessions = (sessionsData || []) as Session[];
  const overrides = await loadDayOverrides(supabase, sessions.map((s) => s.id));

  const sum = (list: Session[]) => Math.round(list.reduce((n, s) => n + hoursOf(s, overrides), 0) * 10) / 10;

  function statsFor(t: Trainer) {
    const own = sessions.filter((s) => s.trainer_id === t.id && s.status !== 'brouillon');
    const upcoming = own.filter((s) => s.end_at >= nowIso);
    return {
      month: sum(own.filter((s) => s.start_at < nextMonthStart && s.end_at >= monthStart)),
      year: sum(own.filter((s) => s.end_at < nowIso)),
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
                    <div className="mini-stats">
                      <div><strong>{formatHours(st.month)}</strong><span>ce mois</span></div>
                      <div><strong>{formatHours(st.year)}</strong><span>réalisées {nowIso.slice(0, 4)}</span></div>
                      <div><strong>{st.upcoming.length}</strong><span>à venir</span></div>
                    </div>
                    <div className="next">
                      {st.next ? (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <CalendarClock size={14} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>
                            <strong>{st.next.title}</strong> — {st.next.start_at.slice(0, 10).split('-').reverse().join('/')}{' '}
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
