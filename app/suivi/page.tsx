import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { loadStaff, internalStaff } from '@/lib/tracking';
import { FollowupCell } from '@/components/tracking/session-tracking';
import { formatSessionPeriod } from '@/lib/week';

export const metadata = { title: 'Suivi interne · CF Réseaux' };

const one = (v: any) => (Array.isArray(v) ? v[0] : v);

/**
 * Organisation interne : les relances des stagiaires en attente et les
 * sessions à venir, par personne de l'équipe (moi par défaut).
 */
export default async function SuiviPage({ searchParams }: { searchParams: Promise<{ qui?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !canManage(profile.role)) redirect('/');
  const { qui } = await searchParams;
  const who = qui === 'tous' ? 'tous' : qui === 'personne' ? 'personne' : qui && /^[0-9a-f-]{36}$/.test(qui) ? qui : profile.id;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const staff = await loadStaff(supabase as any);
  const team = internalStaff(staff);

  let waitingQuery = supabase
    .from('session_trainees')
    .select(
      'session_id, trainee_id, added_by, added_at, status_by, status_at, followup_by, followup_count, last_followup_at, last_followup_by, followup_note, trainees(full_name, company, email), sessions!inner(id, title, start_at, end_at)'
    )
    .eq('status', 'en_attente')
    .gte('sessions.end_at', today)
    .limit(1000);
  if (who === 'personne') waitingQuery = waitingQuery.is('followup_by', null);
  else if (who !== 'tous') waitingQuery = waitingQuery.eq('followup_by', who);
  const { data: waiting, error } = await waitingQuery;

  let sessionsQuery = supabase
    .from('sessions')
    .select('id, title, start_at, end_at, status, manager_id, session_trainees(status)')
    .gte('end_at', today)
    .order('start_at')
    .limit(300);
  if (who === 'personne') sessionsQuery = sessionsQuery.is('manager_id', null);
  else if (who !== 'tous') sessionsQuery = sessionsQuery.eq('manager_id', who);
  const { data: managed } = await sessionsQuery;

  const rows = ((waiting as any[]) || []).sort(
    (a, b) => one(a.sessions).start_at.localeCompare(one(b.sessions).start_at) || (a.last_followup_at || '').localeCompare(b.last_followup_at || '')
  );
  const never = rows.filter((r) => !r.followup_count).length;
  const label = who === 'tous' ? 'toute l’équipe' : who === 'personne' ? 'personne (à attribuer)' : who === profile.id ? 'moi' : staff.find((s) => s.id === who)?.full_name || '—';

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Organisation interne</p>
            <h1>Suivi interne</h1>
            <p>Qui relance qui, et quelles sessions chacun gère. Vue : <strong>{label}</strong></p>
          </div>
          <form className="toolbar" style={{ margin: 0 }}>
            <label className="sr-only" htmlFor="qui">Personne</label>
            <select id="qui" name="qui" defaultValue={who === profile.id ? '' : who}>
              <option value="">Moi</option>
              <option value="tous">Toute l’équipe</option>
              <option value="personne">Non attribué</option>
              {team.filter((p) => p.id !== profile.id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button type="submit" className="small">Afficher</button>
          </form>
        </header>

        {error ? (
          <div role="alert" className="alert alert-warning">Exécute la migration 24 (supabase/migration_phase24.sql) dans Supabase pour activer le suivi interne.</div>
        ) : (
          <>
            <div className="stats">
              <div className="stat"><span>Stagiaires en attente</span><strong>{rows.length}</strong><small>sessions à venir</small></div>
              <div className="stat"><span>Jamais relancés</span><strong>{never}</strong><small>à appeler en priorité</small></div>
              <div className="stat"><span>Sessions gérées</span><strong>{(managed || []).length}</strong><small>à venir</small></div>
            </div>

            <section className="panel">
              <h2>Relances</h2>
              {!rows.length ? (
                <p className="empty">Aucun stagiaire en attente à relancer.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Stagiaire</th><th>Session</th><th>Mis en attente</th><th>Suivi des relances</th></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const t = one(r.trainees) || {};
                        const s = one(r.sessions);
                        const by = staff.find((p) => p.id === (r.status_by || r.added_by))?.full_name;
                        return (
                          <tr key={`${r.session_id}-${r.trainee_id}`}>
                            <td>
                              <Link href={`/stagiaires/${r.trainee_id}`}><strong>{t.full_name}</strong></Link>
                              <div className="hint">{[t.company, t.email].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td>
                              <Link href={`/sessions/${s.id}#stagiaires`}>{s.title}</Link>
                              <div className="hint">{formatSessionPeriod(s.start_at, s.end_at)}</div>
                            </td>
                            <td className="hint">
                              {by ? `par ${by}` : '—'}
                              {r.status_at || r.added_at ? ` le ${new Date(r.status_at || r.added_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''}
                            </td>
                            <td>
                              <FollowupCell
                                sessionId={r.session_id}
                                traineeId={r.trainee_id}
                                staff={staff}
                                canManage
                                t={{
                                  addedBy: r.added_by, addedAt: r.added_at, statusBy: r.status_by, statusAt: r.status_at, followupBy: r.followup_by,
                                  followupCount: r.followup_count || 0, lastFollowupAt: r.last_followup_at, lastFollowupBy: r.last_followup_by, followupNote: r.followup_note,
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Sessions gérées</h2>
              {!(managed || []).length ? (
                <p className="empty">Aucune session à venir.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Session</th><th>Dates</th><th>Validés</th><th>En attente</th>{who === 'tous' && <th>Gestionnaire</th>}</tr></thead>
                    <tbody>
                      {(managed as any[]).map((s) => {
                        const st = (s.session_trainees || []) as { status: string }[];
                        const w = st.filter((x) => x.status === 'en_attente').length;
                        return (
                          <tr key={s.id}>
                            <td><Link href={`/sessions/${s.id}`}><strong>{s.title}</strong></Link> <span className={`status-pill ${s.status}`}>{s.status === 'confirmee' ? 'Confirmée' : s.status === 'planifiee' ? 'Planifiée' : 'Brouillon'}</span></td>
                            <td>{formatSessionPeriod(s.start_at, s.end_at)}</td>
                            <td>{st.filter((x) => x.status === 'validee').length}</td>
                            <td>{w ? <span className="badge en_attente">{w}</span> : '—'}</td>
                            {who === 'tous' && <td>{staff.find((p) => p.id === s.manager_id)?.full_name || <span className="hint">—</span>}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
