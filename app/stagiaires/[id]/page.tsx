import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { TraineeInfoForm } from '@/components/trainee-info-form';
import { TrainingHistory } from '@/components/training-history';
import Link from 'next/link';
import { notFound } from 'next/navigation';

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function TraineeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [{ data: trainee }, { data: links }] = await Promise.all([
    supabase.from('trainees').select('id, full_name, email, company').eq('id', id).maybeSingle(),
    supabase
      .from('session_trainees')
      .select('status, sessions(id, title, reference, status, start_at, end_at, rooms(name), trainers(full_name))')
      .eq('trainee_id', id),
  ]);

  if (!trainee) notFound();

  const entries = (links || [])
    .map((l: any) => {
      const s = one(l.sessions);
      if (!s) return null;
      return {
        id: s.id,
        title: s.title,
        reference: s.reference,
        status: s.status,
        start_at: s.start_at,
        end_at: s.end_at,
        roomName: one(s.rooms)?.name || null,
        trainerName: one(s.trainers)?.full_name || null,
        enrollmentStatus: l.status as 'validee' | 'en_attente',
      };
    })
    .filter(Boolean) as any[];

  return (
    <main>
      <Sidebar active="/stagiaires" profile={profile} />
      <section className="content">
        <header>
          <div>
            <Link href="/stagiaires" className="back-link">← Retour aux stagiaires</Link>
            <p className="eyebrow">Fiche stagiaire</p>
            <h1>{trainee.full_name}</h1>
            <p>{trainee.company || 'Entreprise non renseignée'}</p>
          </div>
        </header>

        <TraineeInfoForm
          isAdmin={canManage(profile?.role)}
          traineeId={trainee.id}
          fullName={trainee.full_name}
          email={trainee.email}
          company={trainee.company}
        />

        <TrainingHistory entries={entries} />
      </section>
    </main>
  );
}
