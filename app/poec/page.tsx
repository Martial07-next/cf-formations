import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarRange, Users, GraduationCap } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { ProgramForm } from '@/components/poec/program-form';
import { conventionStatus, frShort } from '@/lib/poec';

export const metadata = { title: 'Parcours POEC · CF Réseaux' };

export default async function PoecListPage() {
  const profile = await getCurrentProfile();
  if (!canManage(profile?.role)) redirect('/');
  const supabase = await createClient();
  const { data: programs, error } = await supabase
    .from('poec_programs')
    .select('id, title, reference, start_date, end_date, recruiter, poec_trainees(trainee_id), poec_periods(id), sessions(id)')
    .order('start_date', { ascending: false });
  const { data: conventions } = await supabase
    .from('poec_conventions')
    .select('program_id, cf_signed_at, company_signed_at, trainee_signed_at, ft_signed_at, company_name, company_address, company_rep, company_rep_role, company_tutor');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Planning</p>
            <h1>Parcours POEC</h1>
            <p>Sessions de ~3 mois construites pour un groupe : formations, stages en entreprise, conventions signées en ligne.</p>
          </div>
        </header>

        {error ? (
          <div role="alert" className="alert alert-warning">
            Le module POEC n’est pas encore installé : exécute <code>supabase/migration_phase23.sql</code> dans Supabase (SQL Editor).
          </div>
        ) : (
          <>
            <details className="panel poec-new" open={!programs?.length}>
              <summary><strong>+ Nouveau parcours POEC</strong></summary>
              <div style={{ marginTop: 14 }}><ProgramForm /></div>
            </details>

            {!programs?.length ? (
              <p className="empty">Aucun parcours pour l’instant.</p>
            ) : (
              <div className="poec-list">
                {(programs as any[]).map((p) => {
                  const conv = ((conventions as any[]) || []).filter((c) => c.program_id === p.id);
                  const signed = conv.filter((c) => ['signee', 'validee_ft'].includes(conventionStatus(c))).length;
                  const state = p.end_date < today ? 'Terminé' : p.start_date > today ? 'À venir' : 'En cours';
                  return (
                    <Link key={p.id} href={`/poec/${p.id}`} className="poec-list-card">
                      <span className={`badge ${state === 'En cours' ? 'validee' : state === 'À venir' ? 'planifiee' : 'brouillon'}`}>{state}</span>
                      <strong>{p.title}</strong>
                      <span className="hint"><CalendarRange size={13} aria-hidden /> du {frShort(p.start_date)} au {frShort(p.end_date)}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="poec-list-meta">
                        <span><Users size={13} aria-hidden /> {p.poec_trainees?.length || 0} stagiaires</span>
                        <span><GraduationCap size={13} aria-hidden /> {p.sessions?.length || 0} formations</span>
                        <span><Briefcase size={13} aria-hidden /> {p.poec_periods?.length || 0} stage{(p.poec_periods?.length || 0) > 1 ? 's' : ''}</span>
                        <span>Conventions {signed}/{conv.length}</span>
                      </span>
                      {p.recruiter && <span className="hint">Chargée de recrutement : {p.recruiter}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
