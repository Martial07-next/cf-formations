import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { canEditStartTimes } from '@/lib/roles';
import { Sidebar } from '@/components/sidebar';
import { SessionDetailView } from '@/components/session-detail';
import { compareRooms } from '@/lib/buildings';
import { formatSessionPeriod, sessionHours, formatHours } from '@/lib/week';
import { SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DossierPanel } from '@/components/dossier/dossier-panel';
import { sessionSlots, expectedOn, slotKey } from '@/lib/dossier';

// Les imports de gros fichiers (plusieurs milliers de lignes) passent par les actions de cette page.
export const maxDuration = 60;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/** Tout l'annuaire des stagiaires (l'API renvoie 1000 lignes maximum par requête). */
async function allTraineesOf(supabase: Awaited<ReturnType<typeof createClient>>) {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await supabase.from('trainees').select('id, full_name, email, company').order('full_name').range(from, from + 999);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nouvelle?: string }>;
}) {
  const { id } = await params;
  const isNew = (await searchParams).nouvelle === '1';
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const editable = canManage(profile?.role);

  const [{ data: session }, { data: rooms }, { data: trainers }, { data: allTrainees }, { data: links }, { data: dayRows }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, title, status, start_at, end_at, room_id, trainer_id, template_id, max_trainees, notes, digiforma_ref, rooms(name, is_holding), trainers(id, full_name, color), templates(title, category, duration_hours)'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('rooms').select('id, name, capacity, is_holding, location').order('name'),
      supabase.from('trainers').select('*').order('full_name'),
      editable ? allTraineesOf(supabase).then((data) => ({ data })) : Promise.resolve({ data: [] as any[] }),
      supabase.from('session_trainees').select('status, trainees(id, full_name, email, company, first_name, last_name)').eq('session_id', id),
      supabase.from('session_days').select('day, start_time, end_time').eq('session_id', id),
    ]);

  if (!session) notFound();

  const [{ data: modules }, { data: moduleLinks }] = await Promise.all([
    supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day, duration_hours').eq('session_id', id).order('position'),
    supabase.from('session_trainee_modules').select('trainee_id, module_id').eq('session_id', id),
  ]);
  // Supports de cours et documents de la formation (fiche du catalogue).
  let templateId = (session as any).template_id as string | null;
  if (!templateId) {
    const { data: same } = await supabase.from('templates').select('id').eq('title', session.title).limit(1);
    templateId = same?.[0]?.id ?? null;
  }
  const { data: formationLinks } = templateId
    ? await supabase.from('template_links').select('id, label, url').eq('template_id', templateId).order('position')
    : { data: [] as any[] };

  const traineeModules: Record<string, string[]> = {};
  for (const l of moduleLinks || []) (traineeModules[l.trainee_id] ||= []).push(l.module_id);

  const enrolled = (links || [])
    .map((l: any) => {
      const t = one(l.trainees);
      return t ? { ...t, status: l.status as 'validee' | 'en_attente' } : null;
    })
    .filter(Boolean) as any[];

  // Dossier de formation : émargement + documents (vide si la migration 16 n'est pas faite).
  const [{ data: sigRows, error: dossierError }, { data: docRows }, { data: entryRows }] = await Promise.all([
    supabase.from('attendance_signatures').select('signer, trainee_id, day, half, status').eq('session_id', id),
    templateId
      ? supabase.from('dossier_documents').select('*').or(`session_id.eq.${id},template_id.eq.${templateId}`).order('position')
      : supabase.from('dossier_documents').select('*').eq('session_id', id).order('position'),
    supabase.from('dossier_entries').select('document_id, data, completed, updated_at').eq('session_id', id),
  ]);
  const slots = sessionSlots(session.start_at, session.end_at, (dayRows as any) || []);
  const validatedTrainees = enrolled
    .filter((t: any) => t.status === 'validee')
    .map((t: any) => ({
      id: t.id as string,
      name: t.last_name ? `${String(t.last_name).toUpperCase()} ${t.first_name || ''}`.trim() : (t.full_name as string),
      company: (t.company as string | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const expected: Record<string, string[]> = {};
  if ((modules || []).length) {
    for (const s of slots) expected[slotKey(s)] = expectedOn(s.day, validatedTrainees.map((t) => t.id), (modules as any) || [], traineeModules);
  }
  const isOwn = Boolean(profile?.trainer_id) && profile?.trainer_id === (session as any).trainer_id;
  // Template docs first (dans l'ordre du catalogue), puis ceux propres à la session.
  const documents = [...((docRows as any[]) || [])].sort((a, b) => Number(!!a.session_id) - Number(!!b.session_id) || a.position - b.position);

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
          isNew={isNew && editable}
          formationLinks={(formationLinks as any) || []}
          isAdmin={editable}
          canEditSession={editable}
          canEditStartTimes={canEditStartTimes(profile?.role)}
          modules={(modules as any) || []}
          traineeModules={traineeModules}
          isOwnTrainer={Boolean(profile?.trainer_id) && profile?.trainer_id === (session as any).trainer_id}
          digiformaEnabled={Boolean(process.env.DIGIFORMA_API_TOKEN)}
          session={session as any}
          template={template}
          rooms={[...((rooms as any[]) || [])].sort(compareRooms)}
          trainers={(trainers as any) || []}
          enrolled={enrolled}
          allTrainees={allTrainees || []}
          dayOverrides={(dayRows as any) || []}
        />

        {dossierError ? (
          editable && (
            <div role="status" className="alert alert-warning">
              Dossier de formation dématérialisé : exécute la migration 16 (supabase/migration_phase16.sql) dans Supabase pour l’activer.
            </div>
          )
        ) : (
          <DossierPanel
            sessionId={session.id}
            title={session.title}
            period={
              session.start_at.slice(0, 10) === session.end_at.slice(0, 10)
                ? `Le ${session.start_at.slice(0, 10).split('-').reverse().join('/')}`
                : `Du ${session.start_at.slice(0, 10).split('-').reverse().join('/')} au ${session.end_at.slice(0, 10).split('-').reverse().join('/')}`
            }
            room={room?.is_holding ? null : room?.name || null}
            trainerName={trainer?.full_name || null}
            slots={slots}
            trainees={validatedTrainees}
            expected={expected}
            signatures={(sigRows as any) || []}
            documents={documents}
            entries={(entryRows as any) || []}
            canFill={canEditStartTimes(profile?.role) || isOwn}
            canManage={editable}
          />
        )}
      </section>
    </main>
  );
}
