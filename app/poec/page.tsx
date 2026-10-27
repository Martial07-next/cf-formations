import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Briefcase, CalendarRange, Users, GraduationCap } from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { ProgramForm } from '@/components/poec/program-form';
import { conventionStatus, frShort, PROGRAM_KIND_LABEL, type ProgramKind } from '@/lib/poec';

export const metadata = { title: 'Parcours · CF Réseaux' };

export default async function PoecListPage({ searchParams }: { searchParams: Promise<{ nouveau?: string; type?: string }> }) {
  const { nouveau, type } = await searchParams;
  const profile = await getCurrentProfile();
  if (!canManage(profile?.role)) redirect('/');
  const supabase = await createClient();
  const { data: programs, error } = await supabase
    .from('poec_programs')
    .select('id, title, reference, start_date, end_date, recruiter, poec_trainees(trainee_id), poec_periods(id), sessions(id)')
    .order('start_date', { ascending: false });
  // Type de parcours (migration 43) : requête séparée, « POEC » si la colonne manque.
  const { data: kinds } = await supabase.from('poec_programs').select('id, kind');
  const kindOf = (id: string): ProgramKind => (((kinds as any[]) || []).find((k) => k.id === id)?.kind === 'personnalise' ? 'personnalise' : 'poec');
  const { data: conventions } = await supabase
    .from('poec_conventions')
    .select('program_id, cf_signed_at, company_signed_at, trainee_signed_at, ft_signed_at, company_name, company_address, company_rep, company_rep_role, company_tutor');
  const today = new Date().toISOString().slice(0, 10);
  const defaultKind: ProgramKind = type === 'personnalise' ? 'personnalise' : 'poec';

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Planning</p>
            <h1>Parcours POEC et personnalisés</h1>
            <p>
              Parcours construits pour un groupe : formations, stages en entreprise. Les parcours POEC ajoutent les
              conventions tripartites et le suivi France Travail.
            </p>
          </div>
        </header>

        {error ? (
          <div role="alert" className="alert alert-warning">
            Le module Parcours n’est pas encore installé : exécute <code>supabase/migration_phase23.sql</code> dans Supabase (SQL Editor).
          </div>
        ) : (
          <>
            <details className="panel poec-new" open={!programs?.length || nouveau === '1'}>
              <summary><strong>+ Nouveau parcours (POEC ou personnalisé)</strong></summary>
              <div style={{ marginTop: 14 }}><ProgramForm defaultKind={defaultKind} /></div>
            </details>

            {!programs?.length ? (
              <p className="empty">Aucun parcours pour l’instant.</p>
            ) : (
              <div className="poec-list">
                {(programs as any[]).map((p) => {
                  const kind = kindOf(p.id);
                  const conv = ((conventions as any[]) || []).filter((c) => c.program_id === p.id);
                  const signed = conv.filter((c) => ['signee', 'validee_ft'].includes(conventionStatus(c))).length;
                  const state = p.end_date < today ? 'Terminé' : p.start_date > today ? 'À venir' : 'En cours';
                  return (
                    <Link key={p.id} href={`/poec/${p.id}`} className={`poec-list-card kind-${kind}`}>
                      <span className="poec-list-badges">
                        <span className={`badge ${state === 'En cours' ? 'validee' : state === 'À venir' ? 'planifiee' : 'brouillon'}`}>{state}</span>
                        <span className={`program-kind-chip ${kind}`}>{PROGRAM_KIND_LABEL[kind]}</span>
                      </span>
                      <strong>{p.title}</strong>
                      <span className="hint"><CalendarRange size={13} aria-hidden /> du {frShort(p.start_date)} au {frShort(p.end_date)}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="poec-list-meta">
                        <span><Users size={13} aria-hidden /> {p.poec_trainees?.length || 0} stagiaires</span>
                        <span><GraduationCap size={13} aria-hidden /> {p.sessions?.length || 0} formations</span>
                        <span><Briefcase size={13} aria-hidden /> {p.poec_periods?.length || 0} stage{(p.poec_periods?.length || 0) > 1 ? 's' : ''}</span>
                        {(kind === 'poec' || conv.length > 0) && <span>Conventions {signed}/{conv.length}</span>}
                      </span>
                      {p.recruiter && <span className="hint">{kind === 'poec' ? 'Chargée de recrutement' : 'Référent'} : {p.recruiter}</span>}
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
