import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TrainingHistory, type HistoryEntry } from '@/components/training-history';
import { loadDayOverrides, hoursOf, one, hoursByMonth } from '@/lib/history';
import { MonthlyTable } from '@/components/monthly-table';
import { AbsencesPanel } from '@/components/absences-panel';
import { formatHours } from '@/lib/week';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';

export default async function TrainerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ annee?: string }>;
}) {
  const { id } = await params;
  const { annee } = await searchParams;
  const year = Number.parseInt(annee || '', 10) || new Date().getUTCFullYear();
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [{ data: trainer }, { data: sessions }, { data: absences }] = await Promise.all([
    supabase
      .from('trainers')
      .select('id, full_name, email, specialty, availability, status, color, referent_id, profiles!trainers_referent_id_fkey(full_name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('sessions')
      .select('id, title, status, start_at, end_at, rooms(name), session_trainees(status)')
      .eq('trainer_id', id)
      .order('start_at', { ascending: false }),
    supabase
      .from('trainer_absences')
      .select('id, trainer_id, start_date, end_date, kind, note')
      .eq('trainer_id', id)
      .order('start_date', { ascending: false }),
  ]);

  if (!trainer) notFound();

  const overrides = await loadDayOverrides(supabase, (sessions || []).map((s: any) => s.id));
  const now = new Date().toISOString();
  const yearStart = `${now.slice(0, 4)}-01-01`;
  const color = trainer.color || DEFAULT_TRAINER_COLOR;

  const entries: HistoryEntry[] = (sessions || []).map((s: any) => {
    const validated = (s.session_trainees || []).filter((t: any) => t.status === 'validee').length;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      start_at: s.start_at,
      end_at: s.end_at,
      roomName: one<{ name: string }>(s.rooms)?.name || null,
      trainerName: null,
      color,
      hours: hoursOf(s, overrides),
      extra: `${validated} stagiaire${validated > 1 ? 's' : ''}`,
    };
  });

  const done = entries.filter((e) => e.end_at < now && e.status !== 'brouillon');
  const upcoming = entries.filter((e) => e.end_at >= now);
  const sum = (list: HistoryEntry[]) => Math.round(list.reduce((n, e) => n + e.hours, 0) * 10) / 10;
  const traineesTrained = (sessions || [])
    .filter((s: any) => s.end_at < now)
    .reduce((n: number, s: any) => n + (s.session_trainees || []).filter((t: any) => t.status === 'validee').length, 0);
  const referent = one<{ full_name: string }>((trainer as any).profiles)?.full_name;

  return (
    <main>
      <Sidebar active={profile?.trainer_id === id ? `/formateurs/${id}` : '/formateurs'} profile={profile} />
      <section className="content">
        <header>
          <div>
            <Link href="/formateurs" className="back-link"><ArrowLeft size={14} aria-hidden /> Formateurs</Link>
            <p className="eyebrow">Fiche formateur</p>
            <h1 className="trainer-tag" style={{ fontSize: 26 }}>
              <span className="swatch" style={{ background: color, width: 18, height: 18, borderRadius: 6 }} aria-hidden />
              {trainer.full_name}
              {trainer.status === 'inactif' && <span className="badge inactif">Inactif</span>}
            </h1>
            <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {trainer.specialty && <span>{trainer.specialty}</span>}
              {referent && <span>Référent : <strong>{referent}</strong></span>}
              {trainer.email && <a href={`mailto:${trainer.email}`} className="trainer-tag" style={{ fontWeight: 600 }}><Mail size={14} aria-hidden /> {trainer.email}</a>}
            </p>
          </div>
        </header>

        <div className="stats">
          <div className="stat"><span>Heures réalisées</span><strong>{formatHours(sum(done))}</strong><small>depuis le début</small></div>
          <div className="stat"><span>Heures cette année</span><strong>{formatHours(sum(done.filter((e) => e.start_at >= yearStart)))}</strong><small>sessions terminées</small></div>
          <div className="stat"><span>Heures planifiées</span><strong>{formatHours(sum(upcoming))}</strong><small>{upcoming.length} session{upcoming.length > 1 ? 's' : ''} à venir</small></div>
          <div className="stat"><span>Sessions réalisées</span><strong>{done.length}</strong><small>{traineesTrained} stagiaire{traineesTrained > 1 ? 's' : ''} formé{traineesTrained > 1 ? 's' : ''}</small></div>
        </div>

        <AbsencesPanel trainerId={id} absences={((absences as any[]) || []).reverse()} canEdit={canManage(profile?.role) || (profile?.role === 'referent' && trainer.referent_id === profile.id)} />

        <MonthlyTable
          title="Suivi mensuel"
          year={year}
          yearHref={(y) => `/formateurs/${id}?annee=${y}`}
          rows={[{ label: 'Heures', ...hoursByMonth((sessions || []) as any[], overrides, year) }]}
        />

        <TrainingHistory entries={entries} emptyLabel="Ce formateur n’a encore animé aucune session." />
      </section>
    </main>
  );
}
