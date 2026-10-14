import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadProgramData } from '@/lib/poec-data';
import { loadSettings, stripTokens } from '@/lib/poec-public';
import { frShort, validToken } from '@/lib/poec';
import { ProgramTimeline } from '@/components/poec/program-timeline';
import { FranceTravailPanel } from '@/components/poec/france-travail-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suivi POEC · France Travail · CF Réseaux', robots: { index: false, follow: false } };

/**
 * Espace France Travail d'un parcours POEC (lien unique, sans compte) :
 * programme, stagiaires, conventions de stage et signature groupée.
 */
export default async function FranceTravailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let error: string | null = null;
  let data = null;
  let settings = null;
  if (!validToken(token)) error = 'Lien invalide.';
  else {
    try {
      const admin = createAdminClient();
      const { data: p } = await admin.from('poec_programs').select('id').eq('ft_token', token).maybeSingle();
      if (!p) error = 'Ce lien n’est plus valide. Demandez un nouveau lien à CF Réseaux.';
      else {
        [data, settings] = await Promise.all([loadProgramData(admin, p.id), loadSettings(admin)]);
      }
    } catch {
      error = 'Service momentanément indisponible.';
    }
  }

  return (
    <main className="sign-page">
      <div className="sign-card poec-card wide">
        <div className="poec-band"><img src="/logo-cf-reseaux.svg" alt="CF Réseaux" /></div>
        <p className="sign-brand">Espace France Travail · POEC</p>
        {error || !data || !settings ? (
          <div role="alert" className="alert alert-error">{error || 'Parcours introuvable.'}</div>
        ) : (
          <>
            <h1>{data.program.title}</h1>
            <p className="hint">
              Du {frShort(data.program.start_date)} au {frShort(data.program.end_date)}
              {data.program.reference ? ` · Réf. ${data.program.reference}` : ''}
              {data.program.recruiter ? ` · Chargée de recrutement : ${data.program.recruiter}` : ''}
            </p>
            {data.program.objectives && (
              <section>
                <h2 className="sub-heading">Objectifs</h2>
                <p className="poec-objectives">{data.program.objectives}</p>
              </section>
            )}
            <FranceTravailPanel
              token={token}
              programTitle={data.program.title}
              advisor={[data.program.ft_advisor, data.program.ft_agency].filter(Boolean).join(' · ')}
              members={data.members.map((m) => ({ id: m.trainee_id, name: m.full_name }))}
              periods={data.periods}
              conventions={data.conventions.map(stripTokens)}
              director={settings.director}
              legal={settings.legal}
              programme={{
                title: data.program.title,
                reference: data.program.reference,
                start: data.program.start_date,
                end: data.program.end_date,
                objectives: data.program.objectives,
                sessions: data.sessions.map((s) => ({ title: s.title, start_at: s.start_at, end_at: s.end_at, hours: s.hours, trainer: s.trainer, room: s.room })),
                periods: data.periods,
                trainees: data.members.map((m) => m.full_name),
                legal: settings.legal,
              }}
            />
            <section>
              <h2 className="sub-heading">Programme semaine par semaine</h2>
              <ProgramTimeline start={data.program.start_date} end={data.program.end_date} sessions={data.sessions} periods={data.periods} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
