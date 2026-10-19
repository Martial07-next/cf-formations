import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CalendarRange, CheckCircle2 } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { loadProgramData } from '@/lib/poec-data';
import { conventionStatus, frShort } from '@/lib/poec';
import { compareRooms } from '@/lib/buildings';
import { formatHours } from '@/lib/week';
import { ProgramTimeline } from '@/components/poec/program-timeline';
import { ProgrammePdfButton } from '@/components/poec/programme-pdf-button';
import { ProgramHeaderActions, GroupPanel, ProgramPlanningActions, ConventionsPanel, FranceTravailLink } from '@/components/poec/program-manager';

export const metadata = { title: 'Parcours POEC · CF Réseaux' };

export default async function PoecProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ajout?: string }>;
}) {
  const { id } = await params;
  const { ajout } = await searchParams;
  const profile = await getCurrentProfile();
  if (!canManage(profile?.role)) redirect('/');
  const supabase = await createClient();
  const data = await loadProgramData(supabase, id);
  if (!data) notFound();
  const { program, members, sessions, periods, conventions } = data;

  const [{ data: rooms }, { data: trainers }, { data: templates }, { data: roomTemplates }, { data: absences }, { data: settings }, { data: attachableRaw }] =
    await Promise.all([
      supabase.from('rooms').select('id, name, capacity, is_holding, status, location').order('name'),
      supabase.from('trainers').select('*').order('full_name'),
      supabase
        .from('templates')
        .select('id, title, category, duration_hours, max_trainees, template_trainers(trainer_id), template_modules(name, duration_hours, position)')
        .order('title'),
      supabase.from('room_templates').select('room_id, template_id'),
      supabase
        .from('trainer_absences')
        .select('id, trainer_id, start_date, end_date, kind, note')
        .gte('end_date', program.start_date)
        .lte('start_date', program.end_date)
        .limit(2000),
      supabase.from('app_settings').select('*').limit(1).maybeSingle(),
      supabase
        .from('sessions')
        .select('id, title, start_at, end_at')
        .is('poec_id', null)
        .gte('start_at', program.start_date)
        .lte('start_at', `${program.end_date}T23:59:59`)
        .order('start_at')
        .limit(200),
    ]);

  const s = (settings as any) || {};
  const director = { name: s.director_name || 'Madame Aurélie Lancelle', title: s.director_title || 'Directrice de CF Réseaux' };
  const legal = { siret: s.siret || null, nda: s.nda || null, city: s.signature_city || 'Cuincy' };
  const totalHours = Math.round(sessions.reduce((n, x) => n + x.hours, 0) * 10) / 10;
  const signed = conventions.filter((c) => ['signee', 'validee_ft'].includes(conventionStatus(c))).length;
  const added = ajout ? sessions.find((x) => x.id === ajout) : null;

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <Link href="/poec" className="back-link"><ArrowLeft size={14} aria-hidden /> Parcours POEC</Link>
            <p className="eyebrow">Parcours POEC{program.reference ? ` · ${program.reference}` : ''}</p>
            <h1>{program.title}</h1>
            <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span><CalendarRange size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> du {frShort(program.start_date)} au {frShort(program.end_date)}</span>
              {program.recruiter && <span>Chargée de recrutement : <strong>{program.recruiter}</strong></span>}
              {program.ft_advisor && <span>France Travail : <strong>{[program.ft_advisor, program.ft_agency].filter(Boolean).join(' · ')}</strong></span>}
            </p>
          </div>
          <div className="form-actions">
            <ProgrammePdfButton
              input={{
                title: program.title,
                reference: program.reference,
                start: program.start_date,
                end: program.end_date,
                objectives: program.objectives,
                sessions: sessions.map((x) => ({ title: x.title, start_at: x.start_at, end_at: x.end_at, hours: x.hours, trainer: x.trainer, room: x.room })),
                periods,
                trainees: members.map((m) => m.full_name),
                legal,
              }}
            />
            <ProgramHeaderActions program={program} />
          </div>
        </header>

        {added && (
          <div role="status" className="alert alert-success">
            <CheckCircle2 size={16} aria-hidden style={{ verticalAlign: '-3px' }} /> « {added.title} » ajoutée au parcours, {added.enrolled} stagiaire{added.enrolled > 1 ? 's' : ''} inscrit{added.enrolled > 1 ? 's' : ''}.{' '}
            <Link href={`/sessions/${added.id}`}>Ouvrir la fiche de session</Link>
          </div>
        )}

        <div className="stats">
          <div className="stat"><span>Stagiaires</span><strong>{members.length}</strong><small>groupe fixe</small></div>
          <div className="stat"><span>Formations</span><strong>{sessions.length}</strong><small>{formatHours(totalHours)} en centre</small></div>
          <div className="stat"><span>Stages</span><strong>{periods.length}</strong><small>période{periods.length > 1 ? 's' : ''} en entreprise</small></div>
          <div className="stat"><span>Conventions</span><strong>{signed}/{conventions.length}</strong><small>signées par les 3 parties</small></div>
        </div>

        {program.objectives && (
          <section className="panel">
            <h2>Objectifs du parcours</h2>
            <p className="poec-objectives">{program.objectives}</p>
          </section>
        )}

        <GroupPanel programId={program.id} members={members} />

        <section className="panel">
          <h2>Programme</h2>
          <p className="panel-intro">
            Construis le parcours avec les formations du catalogue : chacune apparaît au planning (badge POEC) avec le groupe déjà inscrit. Les stages en entreprise s’affichent aussi au planning.
          </p>
          <ProgramPlanningActions
            program={program}
            sessions={sessions}
            attachable={(attachableRaw as any[]) || []}
            periods={periods}
            rooms={[...((rooms as any[]) || [])].sort(compareRooms).map((r) => ({
              ...r,
              template_ids: ((roomTemplates as any[]) || []).filter((x) => x.room_id === r.id).map((x) => x.template_id),
            }))}
            trainers={(trainers as any) || []}
            templates={((templates as any[]) || []).map((t) => ({
              ...t,
              trainer_ids: (t.template_trainers || []).map((x: any) => x.trainer_id),
              modules: [...(t.template_modules || [])].sort((a: any, b: any) => a.position - b.position),
            }))}
            absences={(absences as any) || []}
            memberCount={members.length}
          />
          <h3 className="sub-heading">Semaine par semaine</h3>
          <ProgramTimeline start={program.start_date} end={program.end_date} sessions={sessions} periods={periods} linkSessions />
        </section>

        <section className="panel">
          <h2>Conventions de stage</h2>
          <p className="panel-intro">
            Une convention tripartite par stagiaire et par stage. Envoie à l’entreprise d’accueil et au stagiaire leur lien personnel : ils complètent et signent en ligne, sans compte. Tu signes pour CF Réseaux en une fois.
          </p>
          <ConventionsPanel
            program={program}
            periods={periods}
            members={members}
            conventions={conventions}
            director={director}
            legal={legal}
            signerName={profile?.full_name || ''}
          />
        </section>

        <section className="panel">
          <h2>France Travail</h2>
          <FranceTravailLink program={program} />
        </section>
      </section>
    </main>
  );
}
