import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TraineeInfoForm } from '@/components/trainee-info-form';
import { TrainingHistory, type HistoryEntry } from '@/components/training-history';
import { loadDayOverrides, hoursOf, one } from '@/lib/history';
import { formatHours, dayHours } from '@/lib/week';
import { attendsDay, modulesLabel } from '@/lib/modules';
import { nameFields } from '@/lib/trainee-name';

export default async function TraineeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [{ data: trainee }, { data: links }] = await Promise.all([
    supabase.from('trainees').select('id, full_name, first_name, last_name, email, company').eq('id', id).maybeSingle(),
    supabase
      .from('session_trainees')
      .select('status, sessions(id, title, status, start_at, end_at, rooms(name), trainers(full_name, color))')
      .eq('trainee_id', id),
  ]);

  if (!trainee) notFound();

  const sessions = (links || []).map((l: any) => ({ link: l, s: one<any>(l.sessions) })).filter((x) => x.s);
  const sessionIds = sessions.map((x) => x.s.id);
  const [overrides, { data: moduleRows }, { data: chosenRows }] = await Promise.all([
    loadDayOverrides(supabase, sessionIds),
    sessionIds.length
      ? supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day, duration_hours').in('session_id', sessionIds).order('position')
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('session_trainee_modules').select('session_id, module_id').eq('trainee_id', id),
  ]);

  const entries: HistoryEntry[] = sessions.map(({ link, s }) => {
    const trainer = one<{ full_name: string; color: string | null }>(s.trainers);
    const modules = ((moduleRows as any[]) || []).filter((m) => m.session_id === s.id);
    const chosen = ((chosenRows as any[]) || []).filter((c) => c.session_id === s.id).map((c) => c.module_id);
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      start_at: s.start_at,
      end_at: s.end_at,
      roomName: one<{ name: string }>(s.rooms)?.name || null,
      trainerName: trainer?.full_name || null,
      color: trainer?.color || null,
      // Avec des modules : seules les heures des jours où le stagiaire est présent comptent.
      hours: modules.length
        ? Math.round(
            dayHours(s.start_at, s.end_at, overrides[s.id] || [])
              .filter((d) => attendsDay(modules, chosen, d.day))
              .reduce((n, d) => n + d.minutes, 0) / 6
          ) / 10
        : hoursOf(s, overrides),
      extra: modules.length ? modulesLabel(modules, chosen) : null,
      enrollmentStatus: link.status,
    };
  });

  const now = new Date().toISOString();
  const completed = entries.filter((e) => e.end_at < now && e.enrollmentStatus === 'validee');
  const upcoming = entries.filter((e) => e.end_at >= now);
  const hoursDone = Math.round(completed.reduce((n, e) => n + e.hours, 0) * 10) / 10;

  return (
    <main>
      <Sidebar active="/stagiaires" profile={profile} />
      <section className="content">
        <header>
          <div>
            <Link href="/stagiaires" className="back-link"><ArrowLeft size={14} aria-hidden /> Stagiaires</Link>
            <p className="eyebrow">Fiche stagiaire</p>
            <h1>{trainee.full_name}</h1>
            <p>{trainee.company || 'Entreprise non renseignée'}{trainee.email ? ` · ${trainee.email}` : ''}</p>
          </div>
        </header>

        <div className="stats">
          <div className="stat"><span>Formations suivies</span><strong>{completed.length}</strong><small>terminées, inscription validée</small></div>
          <div className="stat"><span>Heures de formation</span><strong>{formatHours(hoursDone)}</strong><small>formations terminées</small></div>
          <div className="stat"><span>À venir</span><strong>{upcoming.length}</strong><small>inscriptions</small></div>
        </div>

        <TrainingHistory entries={entries} emptyLabel="Ce stagiaire n’est inscrit à aucune formation pour l’instant." />

        <TraineeInfoForm
          isAdmin={canManage(profile?.role)}
          traineeId={trainee.id}
          firstName={nameFields(trainee).first_name}
          lastName={nameFields(trainee).last_name}
          email={trainee.email}
          company={trainee.company}
        />
      </section>
    </main>
  );
}
