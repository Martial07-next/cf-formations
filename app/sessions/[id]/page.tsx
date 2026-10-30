import { SessionStatus } from '@/components/session-status';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { loadStaff } from '@/lib/tracking';
import { SessionTrackingBar, SessionHistory, type TraineeTracking } from '@/components/tracking/session-tracking';
import { SessionAutorisations } from '@/components/autorisations/session-autorisations';
import { loadAuthorizations } from '@/lib/autorisations-server';
import { sessionKinds } from '@/lib/autorisations';
import { sessionStarted, parisNowKey } from '@/lib/session-lock';
import { SessionBilling } from '@/components/billing/session-billing';
import { INVOICE_SELECT, type Invoice } from '@/lib/billing';
import { builtinActive, customDocs as customDocsOf } from '@/lib/documents';
import { loadDocs, loadDocSignatures } from '@/lib/documents-server';
import { SessionLoans } from '@/components/vetements/loans-panel';
import { LOAN_SELECT, loanStatus, type ClothingLoan } from '@/lib/vetements';
import { canEditStartTimes } from '@/lib/roles';
import { SessionDetailView } from '@/components/session-detail';
import { compareRooms, trainingPlace, buildingAddress, streetAddress } from '@/lib/buildings';
import { appreciationRequired, codificationOf } from '@/lib/appreciation';
import { formatSessionPeriod, sessionHours, formatHours, weekdaysBetween, dayHours } from '@/lib/week';
import { countDays } from '@/lib/schedule';
import { isClosedHoliday } from '@/lib/holidays';
import { reussiteModels, reussiteModule } from '@/lib/reussite';
import { SESSION_STATUS_LABEL } from '@/lib/status';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import Link from 'next/link';
import { JumpButton } from '@/components/jump-button';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarOff, Pencil, UserPlus } from 'lucide-react';
import { DossierPanel } from '@/components/dossier/dossier-panel';
import { loadDayTrainers } from '@/lib/day-trainers';
import { loadReservations } from '@/lib/reservations';
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
  searchParams: Promise<{ nouvelle?: string; jour?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isNew = sp.nouvelle === '1';
  // Ouvert depuis un jour du planning : ce jour est mis en évidence (formateur par jour).
  const focusDay = sp.jour && /^\d{4}-\d{2}-\d{2}$/.test(sp.jour) ? sp.jour : null;
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const editable = canManage(profile?.role);

  const [{ data: session }, { data: rooms }, { data: trainers }, { data: allTrainees }, { data: links }, { data: dayRows }] =
    await Promise.all([
      supabase
        .from('sessions')
        .select(
          'id, title, status, start_at, end_at, room_id, trainer_id, template_id, max_trainees, notes, digiforma_ref, rooms(name, is_holding, location, status), trainers(id, full_name, color), templates(title, category, duration_hours)'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('rooms').select('id, name, capacity, is_holding, location, status').order('name'),
      supabase.from('trainers').select('*').order('full_name'),
      editable ? allTraineesOf(supabase).then((data) => ({ data })) : Promise.resolve({ data: [] as any[] }),
      supabase.from('session_trainees').select('status, trainees(id, full_name, email, company, first_name, last_name)').eq('session_id', id),
      supabase.from('session_days').select('day, start_time, end_time').eq('session_id', id),
    ]);

  if (!session) notFound();

  // Vitesse : toutes les requêtes indépendantes partent tout de suite, en parallèle,
  // au lieu de s'enchaîner une par une (chacune attendue plus bas, là où elle sert).
  const start = <T,>(q: PromiseLike<T>) => Promise.resolve(q);
  const earlyValidatedIds = ((links as any[]) || [])
    .filter((l) => l.status === 'validee')
    .map((l) => one<any>(l.trainees)?.id as string | undefined)
    .filter(Boolean) as string[];
  const early = {
    settings: start(supabase.from('app_settings').select('*').eq('id', true).maybeSingle()),
    dayTrainers: loadDayTrainers(supabase, [id]),
    reservations: loadReservations(supabase, [id]),
    absences: start(
      supabase
        .from('trainer_absences')
        .select('id, trainer_id, start_date, end_date, kind, note')
        .lte('start_date', session.end_at.slice(0, 10))
        .gte('end_date', session.start_at.slice(0, 10))
    ),
    poec: start(supabase.from('sessions').select('poec_id, poec_programs(id, title, kind)').eq('id', id).maybeSingle()),
    // Lien Digiforma des autres documents (migration 36).
    digiforma: start(supabase.from('sessions').select('digiforma_docs_url').eq('id', id).maybeSingle()),
    digiformaDone: start(supabase.from('session_forms').select('completed').eq('session_id', id).eq('kind', 'digiforma').maybeSingle()),
    track: Promise.all([
      start(supabase.from('sessions').select('created_by, manager_id, created_at, authorizations').eq('id', id).maybeSingle()),
      start(
        supabase
          .from('session_trainees')
          .select('trainee_id, added_by, added_at, status_by, status_at, followup_by, followup_count, last_followup_at, last_followup_by, followup_note')
          .eq('session_id', id)
      ),
      start(supabase.from('session_activity').select('id, action, detail, created_at, actor_id').eq('session_id', id).order('created_at', { ascending: false }).limit(150)),
      loadStaff(supabase as any),
    ]),
    billing: Promise.all([
      start(supabase.from('sessions').select('billing_done, billing_done_at, billing_done_by, billing_note').eq('id', id).maybeSingle()),
      start(supabase.from('session_invoices').select(INVOICE_SELECT).eq('session_id', id).order('created_at')),
    ]),
    cursus: start(supabase.from('session_trainees').select('trainee_id, cursus').eq('session_id', id)),
    docs: loadDocs(supabase as any),
    docSigs: loadDocSignatures(supabase as any, 'trainee_id', earlyValidatedIds),
    autor: loadAuthorizations(supabase as any, earlyValidatedIds),
    loans: Promise.all([
      start(
        supabase
          .from('clothing_loans')
          .select(LOAN_SELECT)
          .or(earlyValidatedIds.length ? `session_id.eq.${id},trainee_id.in.(${earlyValidatedIds.join(',')})` : `session_id.eq.${id}`)
      ),
      earlyValidatedIds.length ? start(supabase.from('trainees').select('id, address').in('id', earlyValidatedIds)) : Promise.resolve({ data: [] as any[] }),
    ]),
  };

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
  const [{ data: formationLinks }, { data: qualifiedRows }] = templateId
    ? await Promise.all([
        supabase.from('template_links').select('id, label, url').eq('template_id', templateId).order('position'),
        // Formateurs habilités pour cette formation (seuls proposés).
        supabase.from('template_trainers').select('trainer_id').eq('template_id', templateId),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const qualifiedTrainerIds = ((qualifiedRows as any[]) || []).map((r) => r.trainer_id as string);

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
  // Tour de table intégré (migration 17) : activé par défaut, désactivable par formation.
  const [{ data: formRow, error: formError }, { data: tplOpt }] = await Promise.all([
    supabase.from('session_forms').select('data, completed, completed_at').eq('session_id', id).eq('kind', 'tour_de_table').maybeSingle(),
    templateId ? supabase.from('templates').select('*').eq('id', templateId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Fiches d'appréciation individuelle (migration 21) : réglage de la session, sinon de la formation.
  const [{ data: faiRow, error: faiError }, { data: sessFlag, error: flagError }] = await Promise.all([
    supabase.from('session_forms').select('data, completed').eq('session_id', id).eq('kind', 'appreciation').maybeSingle(),
    supabase.from('sessions').select('fiche_appreciation').eq('id', id).maybeSingle(),
  ]);
  // Attestations de réussite (migration 39) : modèles choisis sur la formation.
  const arModels = reussiteModels((tplOpt as any)?.attestation_reussite);
  const { data: arRow } = arModels.length
    ? await supabase.from('session_forms').select('data').eq('session_id', id).eq('kind', 'reussite').maybeSingle()
    : { data: null };
  // Jours fériés de la période (migration 48) : décalage automatique ou à replanifier.
  const { data: shiftRows } = await supabase.from('session_holiday_shifts').select('holiday, label, status, detail').eq('session_id', id).order('holiday');
  const holidayShifts = ((shiftRows as any[]) || []).filter((h) => isClosedHoliday(String(h.holiday).slice(0, 10)));
  // Titres d'habilitation déposés (migration 46) : null si la migration manque.
  const { data: titleRows, error: titleError } = await supabase
    .from('habilitation_titles')
    .select('id, trainee_id, file_name, mime, size, source, created_at')
    .eq('session_id', id)
    .order('created_at');
  const tourDeTable =
    formError || (tplOpt as any)?.tour_de_table === false
      ? null
      : {
          data: ((formRow as any)?.data as any) || null,
          completed: Boolean((formRow as any)?.completed),
          completedAt: (formRow as any)?.completed_at ? new Date((formRow as any).completed_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : null,
        };
  // Mentions légales des documents (migration 18) ; ignorées si absentes.
  const { data: settings } = await early.settings;
  const legal = {
    siret: ((settings as any)?.siret as string) || null,
    nda: ((settings as any)?.nda as string) || null,
    city: ((settings as any)?.signature_city as string) || 'Cuincy',
  };
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
  // Remplaçants jour par jour (migration 19) et congés des formateurs sur la période.
  const dayTrainerMap = await early.dayTrainers;
  const reservations = (await early.reservations)[id] || [];
  const dayTrainers = dayTrainerMap[id] || {};
  const { data: periodAbsences } = await early.absences;
  const trainerName = (tid: string) => ((trainers as any[]) || []).find((t) => t.id === tid)?.full_name as string | undefined;
  const replacementNames = [...new Set(Object.values(dayTrainers).map((d) => trainerName(d.trainer_id)).filter(Boolean) as string[])];
  const { data: dfRow, error: dfError } = await early.digiforma;
  const { data: dfDoneRow } = await early.digiformaDone;
  const digiformaDocs = dfError
    ? null
    : { url: ((dfRow as any)?.digiforma_docs_url as string | null) ?? null, done: Boolean((dfDoneRow as any)?.completed) };
  const isOwn =
    Boolean(profile?.trainer_id) &&
    (profile?.trainer_id === (session as any).trainer_id || Object.values(dayTrainers).some((d) => d.trainer_id === profile?.trainer_id));
  // Template docs first (dans l'ordre du catalogue), puis ceux propres à la session.
  const documents = [...((docRows as any[]) || [])].sort((a, b) => Number(!!a.session_id) - Number(!!b.session_id) || a.position - b.position);

  const room = one((session as any).rooms) as { name: string; is_holding: boolean | null; location: string | null; status?: string | null } | null;
  const trainer = one((session as any).trainers) as { id: string; full_name: string; color: string | null } | null;
  const template = one((session as any).templates) as { title: string; category: string | null; duration_hours: number } | null;
  const hours = sessionHours(session.start_at, session.end_at, (dayRows as any) || []);
  // Une série d'attestations par modèle (P1, P2, P3… toujours séparées) : le
  // module de la session du même nom donne les dates, la durée et les stagiaires.
  const allDays = dayHours(session.start_at, session.end_at, (dayRows as any) || []);
  const durationText = (h: number, d: number) => `${formatHours(h)} (${String(d).replace('.', ',')} jour${d > 1 ? 's' : ''})`;
  const arSeries = arModels.map((model) => {
    const mod = reussiteModule(model, ((modules as any[]) || []) as { id: string; name: string; start_day: string; end_day: string; duration_hours: number | null }[]);
    if (mod) {
      const days = allDays.filter((d) => d.day >= mod.start_day && d.day <= mod.end_day);
      const h = mod.duration_hours != null ? Number(mod.duration_hours) : Math.round(days.reduce((n, d) => n + d.minutes, 0) / 6) / 10;
      return {
        model,
        startDate: mod.start_day,
        endDate: mod.end_day,
        duration: durationText(h, countDays(days.map((d) => d.minutes))),
        trainees: validatedTrainees.filter((t) => !traineeModules[t.id]?.length || traineeModules[t.id].includes(mod.id)),
      };
    }
    return {
      model,
      startDate: session.start_at.slice(0, 10),
      endDate: session.end_at.slice(0, 10),
      // Seul modèle : la session entière ; sinon la durée habituelle du modèle.
      duration: arModels.length === 1 ? durationText(hours, countDays(allDays.map((d) => d.minutes))) : durationText(model.hours, model.days),
      trainees: validatedTrainees,
    };
  });
  // Parcours POEC (migration 23) : erreur ignorée si la migration manque.
  const poecRes: any = await early.poec;
  // Sans la migration 43 (type de parcours) : titre seul.
  const poecRow = poecRes.error ? (await supabase.from('sessions').select('poec_id, poec_programs(id, title)').eq('id', id).maybeSingle()).data : poecRes.data;
  const poec = one((poecRow as any)?.poec_programs) as { id: string; title: string; kind?: string | null } | null;
  // Parcours personnalisé : titre d'habilitation jamais demandé (le réglage du catalogue ne change pas).
  const customProgram = poec?.kind === 'personnalise';

  // Organisation interne (migration 24) : créée par, gestionnaire, suivi des inscriptions, historique.
  const [{ data: trackRow, error: trackError }, { data: trackLinks }, { data: activity }, staff] = await early.track;
  // Facturation (migration 30) : ignorée si la migration manque.
  const [{ data: billRow, error: billError }, { data: invoiceRows }] = await early.billing;
  const billing = billError
    ? null
    : {
        done: Boolean((billRow as any)?.billing_done),
        doneAt: (billRow as any)?.billing_done_at ?? null,
        doneBy: (billRow as any)?.billing_done_by ?? null,
        note: (billRow as any)?.billing_note ?? null,
      };
  // Initial / recyclage (migration 29) : ignoré si la migration manque.
  const { data: cursusRows, error: cursusError } = await early.cursus;
  // Boutons Initial / Recyclage : seulement si la formation est « disponible en recyclage » (migration 33).
  const recyclageOn = Boolean((tplOpt as any)?.recyclage_available);
  const cursusMap: Record<string, 'initial' | 'recyclage' | null> = cursusError
    ? {}
    : Object.fromEntries(((cursusRows as any[]) || []).map((r) => [r.trainee_id, r.cursus ?? null]));
  const cursus = cursusError || !recyclageOn ? null : cursusMap;
  const tracking: Record<string, TraineeTracking> | null = trackError
    ? null
    : Object.fromEntries(
        ((trackLinks as any[]) || []).map((r) => [
          r.trainee_id,
          {
            addedBy: r.added_by, addedAt: r.added_at, statusBy: r.status_by, statusAt: r.status_at, followupBy: r.followup_by,
            followupCount: r.followup_count || 0, lastFollowupAt: r.last_followup_at, lastFollowupBy: r.last_followup_by, followupNote: r.followup_note,
          },
        ])
      );
  // Autorisations (droit à l'image, livrets, vêtements TST) des stagiaires validés.
  // Documents à signer gérés par l'administrateur (migration 28).
  const allDocs = await early.docs;
  const trainingDocs = customDocsOf(allDocs, 'stagiaire');
  const autorKinds = trackError
    ? []
    : sessionKinds((trackRow as any)?.authorizations ?? null, (tplOpt as any)?.authorizations ?? null).filter((k) => builtinActive(allDocs, k));
  const validatedIds = enrolled.filter((t: any) => t.status === 'validee').map((t: any) => t.id as string);
  const docSigs = trainingDocs.length ? await early.docSigs : [];
  const autorRows = trackError ? [] : await early.autor;
  // Prêts de vêtements TST (migration 27) : ceux de la session + ceux pas rendus d'avant.
  const [{ data: loanRows, error: loanError }, { data: addrRows }] = await early.loans;
  const allLoans = ((loanRows as ClothingLoan[]) || []);
  const sessionLoans = allLoans.filter((l) => l.session_id === id);
  const otherOpenLoans = allLoans.filter((l) => l.session_id !== id && ['prete', 'incomplet'].includes(loanStatus(l)));
  const addressOf = (tid: string) => ((addrRows as any[]) || []).find((r) => r.id === tid)?.address || null;

  // Session commencée / terminée : liste des stagiaires figée, fiche réorganisée.
  const started = sessionStarted(session.start_at);
  const ended = session.end_at.slice(0, 16) <= parisNowKey();
  const sessionDays = weekdaysBetween(session.start_at, session.end_at);
  const todayIndex = sessionDays.indexOf(parisNowKey().slice(0, 10));

  // Blocs de travail (vêtements, autorisations, dossier) : juste après les stagiaires.
  const workPanels = (
      <>
          {!loanError && builtinActive(allDocs, 'vetements') && (canEditStartTimes(profile?.role) || isOwn) && (
            <SessionLoans
              sessionId={session.id}
              trainees={validatedTrainees.map((t) => ({ id: t.id, name: t.name, address: addressOf(t.id) }))}
              loans={sessionLoans}
              otherOpen={otherOpenLoans}
              canManage={editable}
              cachet={editable ? ((settings as any)?.cachet_image as string) || null : null}
            />
          )}

          {!trackError && (
            <SessionAutorisations
              sessionId={session.id}
              title={session.title}
              kinds={autorKinds}
              overridden={(trackRow as any)?.authorizations != null}
              canManage={editable}
              canCollect={canEditStartTimes(profile?.role) || isOwn}
              rows={validatedTrainees.map((t) => ({
                id: t.id,
                name: t.name,
                auths: autorRows.filter((a) => a.trainee_id === t.id),
                docSigs: docSigs.filter((x) => x.trainee_id === t.id),
              }))}
              customDocs={trainingDocs}
              cachet={editable ? ((settings as any)?.cachet_image as string) || null : null}
            />
          )}

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
              trainees={validatedTrainees.map((t) => ({ ...t, cursus: recyclageOn ? cursusMap[t.id] ?? null : null }))}
              expected={expected}
              signatures={(sigRows as any) || []}
              documents={documents}
              entries={(entryRows as any) || []}
              canFill={canEditStartTimes(profile?.role) || isOwn}
              canManage={editable}
              tourDeTable={tourDeTable}
              titleFiles={titleError ? null : ((titleRows as any) || [])}
              titleRequired={Boolean((tplOpt as any)?.titre_habilitation) && !customProgram}
              me={profile ? { id: profile.id, name: profile.full_name } : null}
              digiforma={digiformaDocs}
              reussite={
                arSeries.length
                  ? {
                      session: {
                        series: arSeries,
                        lieu: room?.is_holding
                          ? null
                          : (room as any)?.status === 'exterieur'
                            ? buildingAddress(room as any)
                            : streetAddress(room)
                              ? `Centre CF RÉSEAUX - ${streetAddress(room)}`
                              : null,
                        trainerName: [trainer?.full_name, ...replacementNames].filter(Boolean).join(', ') || null,
                      },
                      data: ((arRow as any)?.data as any) || null,
                    }
                  : null
              }
              appreciation={
                faiError || flagError
                  ? null
                  : {
                      required: appreciationRequired((sessFlag as any)?.fiche_appreciation ?? null, (tplOpt as any)?.fiche_appreciation),
                      sessionFlag: (sessFlag as any)?.fiche_appreciation ?? null,
                      templateFlag: Boolean((tplOpt as any)?.fiche_appreciation),
                      data: ((faiRow as any)?.data as any) || null,
                      codification: codificationOf((tplOpt as any)?.codification, (tplOpt as any)?.title || session.title),
                      startDate: session.start_at.slice(0, 10),
                      endDate: session.end_at.slice(0, 10),
                      lieu: room?.is_holding ? null : buildingAddress(room),
                      trainerNames: [trainer?.full_name, ...replacementNames].filter(Boolean).join(', ') || null,
                      // Attestation / appréciation des compétences : bureau et administrateur uniquement.
                      finFormation: editable
                        ? {
                            actionTitle: session.title,
                            formationTitle: (tplOpt as any)?.title || session.title,
                            objectifs: (tplOpt as any)?.objectifs ?? null,
                            competences: (tplOpt as any)?.competences ?? null,
                            objectifsRecyclage: (tplOpt as any)?.objectifs_recyclage ?? null,
                            competencesRecyclage: (tplOpt as any)?.competences_recyclage ?? null,
                            // Jours précis : un jour de moins de 5 h compte pour une demi-journée.
                            days: countDays(dayHours(session.start_at, session.end_at, (dayRows as any) || []).map((d) => d.minutes)),
                            hours,
                            address: room?.is_holding ? null : streetAddress(room),
                            signataire: ((settings as any)?.signataire as string) || 'GRÉBERT MATTHIEU',
                            agrement: ((settings as any)?.agrement as string) || 'CTST-2026-27/1/P',
                            cachet: ((settings as any)?.cachet_image as string) || null,
                          }
                        : null,
                    }
              }
              dayTrainerNames={Object.fromEntries(Object.entries(dayTrainers).map(([d, x]) => [d, trainerName(x.trainer_id) || '']))}
              place={room?.is_holding ? null : trainingPlace(room)}
              legal={legal}
              billingDone={billing ? billing.done : null}
            />
          )}
      </>
    );

  return (
    <main>
      <section className="content">
        <header>
          <div>
            <Link href="/sessions" className="back-link"><ArrowLeft size={14} aria-hidden /> Retour aux sessions</Link>
            <p className="eyebrow">Fiche session</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {session.title}
              <SessionStatus status={session.status} startAt={session.start_at} endAt={session.end_at} nowKey={parisNowKey()} />
            </h1>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>
                {room?.is_holding
                  ? 'Salle à affecter'
                  : (room as any)?.status === 'exterieur'
                    ? `Formation extérieure (INTRA) · ${room?.name}${room?.location ? ` · ${room.location}` : ''}`
                    : room?.name || 'Salle non définie'}
              </span>·
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
              {replacementNames.length > 0 && (
                <span className="sc-replaced" title="Remplaçant(s) certains jours">
                  Remplacé certains jours par {replacementNames.join(', ')}
                </span>
              )}
            </p>
          </div>
          <div className="header-actions">
            {editable && (
              <JumpButton target="infos" className="btn primary">
                <Pencil size={15} aria-hidden /> Modifier la session
              </JumpButton>
            )}
            {editable && !started && (
              <JumpButton target="stagiaires">
                <UserPlus size={15} aria-hidden /> Ajouter des stagiaires
              </JumpButton>
            )}
          </div>
        </header>

        {started && (
          <div role="status" className={`session-live ${ended ? 'ended' : 'live'}`}>
            <strong>{ended ? 'Session terminée' : todayIndex >= 0 ? `Session en cours · jour ${todayIndex + 1} sur ${sessionDays.length}` : 'Session en cours'}</strong>
            <span>
              {ended
                ? 'Liste des stagiaires figée. Reste à boucler le dossier : documents, attestations, facturation.'
                : 'Liste des stagiaires figée. Ci-dessous : stagiaires, autorisations (QR code), vêtements et dossier de formation.'}
            </span>
          </div>
        )}

        {tracking && (
          <SessionTrackingBar
            sessionId={session.id}
            createdBy={(trackRow as any)?.created_by ?? null}
            createdAt={(trackRow as any)?.created_by ? (trackRow as any)?.created_at : null}
            managerId={(trackRow as any)?.manager_id ?? null}
            staff={staff}
            canManage={editable}
            isAdmin={profile?.role === 'admin'}
          />
        )}

        {poec && (
          <div role="status" className="alert alert-success poec-banner">
            Formation du parcours {customProgram ? '' : 'POEC '}<strong>{poec.title}</strong> : le groupe est inscrit automatiquement.{' '}
            {canManage(profile?.role) && <Link href={`/poec/${poec.id}`}>Ouvrir le parcours</Link>}
          </div>
        )}

        {holidayShifts.map((h: any) => (
          <div key={h.holiday} role="status" className={`alert ${h.status === 'conflit' ? 'alert-error' : 'alert-warning'} holiday-banner`}>
            <CalendarOff size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
            <span>
              {h.status === 'conflit' ? (
                <>
                  <strong>Jour férié le {String(h.holiday).slice(0, 10).split('-').reverse().join('/')} ({h.label})</strong> : pas de formation ce jour-là, mais le décalage automatique est impossible ({h.detail || 'conflit de planning'}). Replanifie la session.
                </>
              ) : h.status === 'decale' ? (
                <>
                  <strong>Jour férié le {String(h.holiday).slice(0, 10).split('-').reverse().join('/')} ({h.label})</strong> : pas de formation ce jour-là, la session a été décalée automatiquement d’un jour ouvré.
                  {' '}Si la direction le passe en « travaillé » dans CF Congés, le décalage sera annulé.
                </>
              ) : (
                <>
                  <strong>Jour férié le {String(h.holiday).slice(0, 10).split('-').reverse().join('/')} ({h.label})</strong> : pas de formation ce jour-là (déjà pris en compte dans les dates).
                </>
              )}
            </span>
          </div>
        ))}

        {room?.is_holding && (
          <div role="status" className="alert alert-warning">
            Session importée de Digiforma : choisis une vraie salle ci-dessous puis enregistre.
          </div>
        )}

        <SessionDetailView
          qualifiedTrainerIds={qualifiedTrainerIds}
          dayTrainerIds={Object.fromEntries(Object.entries(dayTrainers).map(([d, x]) => [d, x.trainer_id]))}
          focusDay={focusDay}
          reservations={reservations}
          isNew={isNew && editable}
          formationLinks={(formationLinks as any) || []}
          isAdmin={editable}
          canEditSession={editable}
          canEditStartTimes={canEditStartTimes(profile?.role)}
          modules={(modules as any) || []}
          traineeModules={traineeModules}
          isOwnTrainer={isOwn}
          digiformaEnabled={Boolean(process.env.DIGIFORMA_API_TOKEN)}
          session={session as any}
          template={template}
          rooms={[...((rooms as any[]) || [])].sort(compareRooms)}
          trainers={(trainers as any) || []}
          enrolled={enrolled}
          allTrainees={allTrainees || []}
          dayOverrides={(dayRows as any) || []}
          tracking={tracking}
          staff={staff}
          cursus={cursus}
          started={started}
          sessionEnded={ended}
          isAdminUser={profile?.role === 'admin'}
          workPanels={workPanels}
          intraCompany={room?.status === 'exterieur' ? room.name : null}
        />

        {billing && (editable || profile?.can_invoice) && (
          <SessionBilling
            sessionId={session.id}
            state={billing}
            invoices={(invoiceRows as Invoice[]) || []}
            companies={[...new Set(validatedTrainees.map((t) => t.company).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fr'))}
            canBill={Boolean(profile?.can_invoice)}
            doneByName={billing.doneBy ? staff.find((p) => p.id === billing.doneBy)?.full_name || null : null}
          />
        )}

        {editable && <SessionHistory items={(activity as any) || []} staff={staff} sessionId={session.id} isAdmin={profile?.role === 'admin'} />}
      </section>
    </main>
  );
}
