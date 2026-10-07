import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { SessionDetailView } from '@/components/session-detail';
import { formatSessionPeriod, sessionHours, formatHours } from '@/lib/week';
import { SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const editable = canManage(profile?.role);

  const [{ data: session }, { data: rooms }, { data: trainers }, { data: allTrainees }, { data: links }, { data: dayRows }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, title, reference, status, start_at, end_at, room_id, trainer_id, template_id, max_trainees, notes, digiforma_ref, rooms(name, is_holding), trainers(id, full_name, color), templates(title, category, duration_hours)'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('rooms').select('id, name, capacity, is_holding').order('name'),
      supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
      editable
        ? supabase.from('trainees').select('id, full_name, email, company').order('full_name')
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('session_trainees').select('status, trainees(id, full_name, email, company)').eq('session_id', id),
      supabase.from('session_days').select('day, start_time, end_time').eq('session_id', id),
    ]);

  if (!session) notFound();

  const enrolled = (links || [])
    .map((l: any) => {
      const t = one(l.trainees);
      return t ? { ...t, status: l.status as 'validee' | 'en_attente' } : null;
    })
    .filter(Boolean) as any[];

  const room = one((session as any).rooms) as { name: string; is_holding: boolean | null } | null;
  const trainer = one((session as any).trainers) as { id: string; full_name: string; color: string | null } | null;
  const template = one((session as any).templates) as { title: string; category: string | null; duration_hours: number } | null;
  const hours = sessionHours(session.start_at, session.end_at, (dayRows as any) || []);

  return (
    <main>
      <Sidebar active="/sessions" profile={profile} />
      <section className="content">
        <header>
          <div>
            <Link href="/sessions" className="back-link"><ArrowLeft size={14} aria-hidden /> Retour aux sessions</Link>
            <p className="eyebrow">Fiche session</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {session.title}
              <span className={`status-pill ${session.status}`}>{SESSION_STATUS_LABEL[session.status] ?? session.status}</span>
            </h1>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{room?.is_holding ? 'Salle à affecter' : room?.name || 'Salle non définie'}</span>·
              <span>{formatSessionPeriod(session.start_at, session.end_at)}</span>·
              <span>{formatHours(hours)}</span>
              {trainer && (
                <>
                  ·
                  <Link href={`/formateurs/${trainer.id}`} className="trainer-tag" style={{ textDecoration: 'none' }}>
                    <span className="swatch" style={{ background: trainer.color || DEFAULT_TRAINER_COLOR }} aria-hidden />
                    {trainer.full_name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </header>

        {room?.is_holding && (
          <div role="status" className="alert alert-warning">
            Session importée de Digiforma : choisis une vraie salle ci-dessous puis enregistre.
          </div>
        )}

        <SessionDetailView
          isAdmin={editable}
          session={session as any}
          template={template}
          rooms={(rooms as any) || []}
          trainers={(trainers as any) || []}
          enrolled={enrolled}
          allTrainees={allTrainees || []}
          dayOverrides={(dayRows as any) || []}
        />
      </section>
    </main>
  );
}
