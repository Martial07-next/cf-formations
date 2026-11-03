import { parisNowKey } from '@/lib/paris-time';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { SessionsTable } from '@/components/sessions-table';
import { Download } from 'lucide-react';
import { loadReservations, reservationStatus } from '@/lib/reservations';
import { loadDossierBadges } from '@/lib/dossier-badges';

export default async function SessionsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const editable = canManage(profile?.role);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, status, start_at, end_at, max_trainees, trainer_id, template_id, rooms(name, is_holding), trainers(full_name, color), session_trainees(status, trainee_id, trainees(company))')
    .order('start_at', { ascending: false })
    .limit(500);

  // Places réservées par entreprise encore sans nom (migration 20).
  const reservations = await loadReservations(supabase, ((sessions as any[]) || []).map((s) => s.id));
  const rows = ((sessions as any[]) || []).map((s) => {
    const companies = (s.session_trainees || [])
      .filter((t: any) => t.status === 'validee')
      .map((t: any) => (Array.isArray(t.trainees) ? t.trainees[0] : t.trainees)?.company);
    return { ...s, reserved: reservations[s.id] ? reservationStatus(reservations[s.id], companies).unnamed : 0 };
  });

  // Avancement des dossiers des sessions commencées (même calcul que le planning).
  const nowKey = parisNowKey();
  const started = rows.filter((s: any) => s.start_at.slice(0, 16) <= nowKey);
  const dossier = await loadDossierBadges(supabase, started, {
    staffView: editable || Boolean(profile?.can_invoice),
    trainerId: profile?.trainer_id || null,
    nowKey,
  }).catch(() => ({}));

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Planning</p>
            <h1>Sessions</h1>
            <p>Toutes les sessions : en cours, à venir et terminées, avec l’avancement de leur dossier.</p>
          </div>
          {editable && (
            <div className="header-actions">
              <a href="/sessions/export" className="btn"><Download size={15} aria-hidden /> Export CSV</a>
            </div>
          )}
        </header>
        <SessionsTable isAdmin={editable} myTrainerId={profile?.trainer_id || null} rows={rows} nowKey={nowKey} dossier={dossier} />
      </section>
    </main>
  );
}
