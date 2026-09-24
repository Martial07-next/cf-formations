import { createClient, getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { SessionDetailView } from '@/components/session-detail';
import { formatSessionPeriod } from '@/lib/week';
import Link from 'next/link';
import { notFound } from 'next/navigation';

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();

  const [{ data: session }, { data: rooms }, { data: trainers }, { data: allTrainees }, { data: links }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('id, title, reference, status, start_at, end_at, room_id, trainer_id, max_trainees, notes, rooms(name)')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('rooms').select('id, name, capacity').order('name'),
      supabase.from('trainers').select('id, full_name').order('full_name'),
      supabase.from('trainees').select('id, full_name, email, company').order('full_name'),
      supabase
        .from('session_trainees')
        .select('status, trainees(id, full_name, email, company)')
        .eq('session_id', id),
    ]);

  if (!session) notFound();

  const enrolled = (links || [])
    .map((l: any) => {
      const t = one(l.trainees);
      return t ? { ...t, status: l.status as 'validee' | 'en_attente' } : null;
    })
    .filter(Boolean) as any[];

  const roomName = one((session as any).rooms)?.name;

  return (
    <main>
      <Sidebar active="/sessions" profile={profile} />
      <section className="content">
        <header>
          <div>
            <Link href="/sessions" className="back-link">← Retour aux sessions</Link>
            <p className="eyebrow">Fiche session</p>
            <h1>{session.title}</h1>
            <p>
              {roomName || 'Salle non définie'} · {formatSessionPeriod(session.start_at, session.end_at)}
            </p>
          </div>
        </header>

        <SessionDetailView
          isAdmin={profile?.role === 'admin'}
          session={session as any}
          rooms={rooms || []}
          trainers={trainers || []}
          enrolled={enrolled}
          allTrainees={allTrainees || []}
        />
      </section>
    </main>
  );
}
