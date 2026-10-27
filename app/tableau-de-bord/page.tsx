import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSignature,
  Lightbulb,
  PenLine,
  Plus,
  Receipt,
  RefreshCcw,
  Route,
  UserPlus,
} from 'lucide-react';
import { createClient, getCurrentProfile, canManage } from '@/lib/supabase/server';
import { parisNowKey, parisToday } from '@/lib/paris-time';
import { addDays, effectiveDayTime, isoDate, weekdaysBetween } from '@/lib/week';
import { computeDossierTodo } from '@/lib/dossier-todo';
import { ALERT_DAYS, inDays, sessionAlerts } from '@/lib/session-alerts';
import { conventionStatus } from '@/lib/poec';
import { ABSENCE_LABEL, frDate } from '@/lib/absences';
import { DEFAULT_TRAINER_COLOR } from '@/lib/colors';
import { DashCard as Card, type DashItem as Item } from '@/components/dash-card';

export const metadata = { title: 'Tableau de bord · CF PLANNING' };

const SESSION_SEL = 'id, title, status, start_at, end_at, trainer_id, template_id, rooms(name, is_holding), trainers(full_name, color), session_trainees(trainee_id, status)';
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const frDay = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const period = (s: { start_at: string; end_at: string }) =>
  s.start_at.slice(0, 10) === s.end_at.slice(0, 10) ? frDay(s.start_at) : `${frDay(s.start_at)} → ${frDay(s.end_at)}`;
const hm = (t: string) => t.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');


/**
 * Tableau de bord : ce qui compte pour chacun, au même endroit.
 *  · Formateur : formations du jour et de la semaine, documents à remplir, congés.
 *  · Bureau : sessions à préparer (7 jours), dossiers à boucler, parcours POEC,
 *    raccourcis de création (session, parcours POEC, session personnalisée).
 *  · Facturation : sessions terminées à facturer.
 *  · Administrateur : tout, plus demandes d'accès, remarques dev, synchronisations.
 */
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  const supabase = await createClient();
  const role = profile.role;
  const staff = canManage(role);
  const isAdmin = role === 'admin';
  const billing = Boolean(profile.can_invoice) || isAdmin;
  const trainerId = profile.trainer_id || null;
  const today = parisToday();
  const nowKey = parisNowKey();
  const in7 = isoDate(addDays(new Date(today + 'T00:00:00Z'), 7));
  const ago60 = isoDate(addDays(new Date(today + 'T00:00:00Z'), -60));
  const ago120 = isoDate(addDays(new Date(today + 'T00:00:00Z'), -120));
  const in30 = isoDate(addDays(new Date(today + 'T00:00:00Z'), 30));

  // Sessions des 60 derniers jours jusqu'aux 7 prochains : aujourd'hui, semaine, dossiers.
  const scope = supabase
    .from('sessions')
    .select(SESSION_SEL)
    .neq('status', 'brouillon')
    .lte('start_at', `${in7}T23:59:59`)
    .gte('end_at', `${ago60}T00:00:00`)
    .order('start_at')
    .limit(400);
  const [{ data: scopeRows }, { data: replRows }] = await Promise.all([
    trainerId ? scope : staff ? scope : Promise.resolve({ data: [] as any[] }),
    trainerId ? supabase.from('session_day_trainers').select('session_id, day').eq('trainer_id', trainerId).gte('day', ago60) : Promise.resolve({ data: [] as any[] }),
  ]);
  const all = ((scopeRows as any[]) || []) as any[];
  const replDays: Record<string, string[]> = {};
  for (const r of (replRows as any[]) || []) (replDays[r.session_id] ||= []).push(r.day);
  // Formateur : ses sessions (principal ou remplaçant certains jours).
  const mine = trainerId ? all.filter((s) => s.trainer_id === trainerId || replDays[s.id]) : [];
  const ids = [...new Set(all.map((s) => s.id))];
  const [{ data: dayRows }, { data: moduleRows }, { data: linkRows }, { data: todayRepl }] = await Promise.all([
    ids.length ? supabase.from('session_days').select('session_id, day, start_time, end_time').in('session_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? supabase.from('session_modules').select('id, session_id, position, name, start_day, end_day').in('session_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? supabase.from('session_trainee_modules').select('session_id, trainee_id, module_id').in('session_id', ids) : Promise.resolve({ data: [] as any[] }),
    // Remplaçants du jour : qui anime réellement chaque session aujourd'hui.
    ids.length ? supabase.from('session_day_trainers').select('session_id, trainer_id').in('session_id', ids).eq('day', today) : Promise.resolve({ data: [] as any[] }),
  ]);
  const trainerToday = (s: any) => ((todayRepl as any[]) || []).find((r) => r.session_id === s.id)?.trainer_id || s.trainer_id;
  const daysOf = (id: string) => ((dayRows as any[]) || []).filter((d) => d.session_id === id);
  const timeToday = (s: any) => effectiveDayTime(today, s.start_at, s.end_at, daysOf(s.id));

  // Avancement des dossiers des sessions commencées (même calcul que le planning).
  const started = (staff ? all : mine).filter((s) => s.start_at.slice(0, 16) <= nowKey);
  const { trainerDone, todo, dossierComplete } = await computeDossierTodo(supabase as any, started, {
    dayRows: (dayRows as any[]) || [],
    moduleRows: (moduleRows as any[]) || [],
    linkRows: (linkRows as any[]) || [],
  });

  // ---- Formateur ----------------------------------------------------------
  const myToday: Item[] = mine
    .filter((s) => weekdaysBetween(s.start_at, s.end_at).includes(today) && trainerToday(s) === trainerId)
    .map((s) => {
      const t = timeToday(s);
      const room = one<any>(s.rooms);
      const live = `${today}T${t.start}` <= nowKey && nowKey < `${today}T${t.end}`;
      return {
        href: `/sessions/${s.id}`,
        title: s.title,
        meta: `${hm(t.start)} – ${hm(t.end)}${room && !room.is_holding ? ` · ${room.name}` : ''}`,
        badge: live ? { text: 'En cours', tone: 'ok' } : nowKey >= `${today}T${t.end}` ? { text: 'Terminée', tone: 'info' } : { text: 'À venir', tone: 'todo' },
      };
    });
  const myWeek: Item[] = mine
    .filter((s) => s.start_at.slice(0, 10) > today)
    .slice(0, 6)
    .map((s) => {
      const room = one<any>(s.rooms);
      return { href: `/sessions/${s.id}`, title: s.title, meta: `${period(s)}${room && !room.is_holding ? ` · ${room.name}` : ''}`, badge: { text: inDays(s.start_at, today), tone: 'info' } };
    });
  const myTodo: Item[] = mine
    .filter((s) => started.some((x) => x.id === s.id) && (todo[s.id]?.trainer || 0) > 0 && !trainerDone[s.id])
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
    .map((s) => ({
      href: `/sessions/${s.id}#dossier`,
      title: s.title,
      meta: period(s),
      badge: { text: `${todo[s.id].trainer} à remplir`, tone: s.end_at.slice(0, 16) <= nowKey ? 'urgent' : 'warn' },
    }));
  const { data: absRows } = trainerId
    ? await supabase.from('trainer_absences').select('id, kind, start_date, end_date, note').eq('trainer_id', trainerId).gte('end_date', today).lte('start_date', in30).order('start_date')
    : { data: [] as any[] };
  const myLeaves: Item[] = ((absRows as any[]) || []).map((a) => ({
    href: `/formateurs/${trainerId}`,
    title: ABSENCE_LABEL[a.kind] || 'Absence',
    meta: a.start_date === a.end_date ? `le ${frDate(a.start_date)}` : `du ${frDate(a.start_date)} au ${frDate(a.end_date)}`,
  }));

  // ---- Bureau ---------------------------------------------------------------
  let toPrepare: Item[] = [];
  let todayAll: Item[] = [];
  let waitTrainer: Item[] = [];
  let officeTodo: Item[] = [];
  let poecItems: Item[] = [];
  if (staff) {
    const { data: next } = await supabase
      .from('sessions')
      .select('id, title, start_at, status, trainer_id, session_trainees(status)')
      .gte('start_at', today)
      .lt('start_at', isoDate(addDays(new Date(today + 'T00:00:00Z'), ALERT_DAYS + 1)))
      .order('start_at');
    toPrepare = sessionAlerts((next as any[]) || [], today).map((a) => ({
      href: `/sessions/${a.id}`,
      title: a.title,
      meta: `${inDays(a.startAt, today)} · ${a.reasons.join(', ')}`,
      badge: { text: a.urgent ? 'Urgent' : 'À préparer', tone: a.urgent ? 'urgent' : 'warn' },
    }));
    todayAll = all
      .filter((s) => weekdaysBetween(s.start_at, s.end_at).includes(today))
      .map((s) => {
        const t = timeToday(s);
        const tr = one<any>(s.trainers);
        const room = one<any>(s.rooms);
        const n = ((s.session_trainees as any[]) || []).filter((x) => x.status === 'validee').length;
        return {
          href: `/sessions/${s.id}`,
          title: s.title,
          meta: `${hm(t.start)} – ${hm(t.end)} · ${tr?.full_name || 'Formateur à définir'}${room && !room.is_holding ? ` · ${room.name}` : ''} · ${n} stagiaire${n > 1 ? 's' : ''}`,
          color: tr?.color || DEFAULT_TRAINER_COLOR,
        };
      });
    const ended = started.filter((s) => s.end_at.slice(0, 16) <= nowKey);
    waitTrainer = ended
      .filter((s) => (todo[s.id]?.trainer || 0) > 0)
      .sort((a, b) => a.end_at.localeCompare(b.end_at))
      .map((s) => ({
        href: `/sessions/${s.id}#dossier`,
        title: s.title,
        meta: `${period(s)} · ${one<any>(s.trainers)?.full_name || 'sans formateur'}`,
        badge: { text: `${todo[s.id].trainer} côté formateur`, tone: 'warn' },
      }));
    officeTodo = ended
      .filter((s) => !(todo[s.id]?.trainer) && (todo[s.id]?.office || 0) > 0)
      .map((s) => ({ href: `/sessions/${s.id}#dossier`, title: s.title, meta: period(s), badge: { text: `${todo[s.id].office} pour le bureau`, tone: 'todo' } }));

    const [{ data: programs }, { data: conventions }] = await Promise.all([
      supabase.from('poec_programs').select('id, title, start_date, end_date').gte('end_date', today).order('start_date'),
      supabase.from('poec_conventions').select('program_id, cf_signed_at, company_signed_at, trainee_signed_at, ft_signed_at, company_name, company_address, company_rep, company_rep_role, company_tutor'),
    ]);
    poecItems = ((programs as any[]) || []).map((p) => {
      const conv = ((conventions as any[]) || []).filter((c) => c.program_id === p.id);
      const open = conv.filter((c) => !['signee', 'validee_ft'].includes(conventionStatus(c))).length;
      return {
        href: `/poec/${p.id}`,
        title: p.title,
        meta: `du ${frDate(p.start_date)} au ${frDate(p.end_date)}`,
        badge: open ? { text: `${open} convention${open > 1 ? 's' : ''} à signer`, tone: 'warn' } : conv.length ? { text: 'Conventions signées', tone: 'ok' } : undefined,
      };
    });
  }

  // ---- Facturation ----------------------------------------------------------
  let toBill: Item[] = [];
  if (billing) {
    const { data: bill, error: billErr } = await supabase
      .from('sessions')
      .select('id, title, start_at, end_at, status, billing_done')
      .eq('billing_done', false)
      .neq('status', 'brouillon')
      .lt('end_at', `${nowKey}`)
      .gte('end_at', `${ago120}T00:00:00`)
      .order('end_at');
    if (!billErr) {
      toBill = ((bill as any[]) || []).map((s) => ({
        href: `/sessions/${s.id}#facturation`,
        title: s.title,
        meta: period(s),
        badge: dossierComplete[s.id] ? { text: 'Dossier complet', tone: 'ok' } : { text: 'À facturer', tone: 'todo' },
      }));
    }
  }

  // ---- Administrateur ---------------------------------------------------------
  let accessCount = 0;
  let devCount = 0;
  let syncs: Item[] = [];
  if (isAdmin) {
    const [{ count: ac }, { count: dc }, { data: settings }] = await Promise.all([
      supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'en_attente'),
      supabase.from('dev_feedback').select('id', { count: 'exact', head: true }).in('status', ['a_faire', 'en_cours']),
      supabase.from('app_settings').select('absences_last_sync, absences_last_log, digiforma_last_sync, digiforma_last_sync_status').eq('id', true).maybeSingle(),
    ]);
    accessCount = ac ?? 0;
    devCount = dc ?? 0;
    const st = (settings as any) || {};
    const when = (v: string | null) => (v ? new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : 'jamais');
    const congesKo = String(st.absences_last_log || '').startsWith('ERREUR');
    syncs = [
      { href: '/administration/integrations#conges', title: 'Plateforme de congés', meta: `Dernière synchronisation : ${when(st.absences_last_sync)}`, badge: congesKo ? { text: 'Erreur', tone: 'urgent' } : st.absences_last_sync ? { text: 'OK', tone: 'ok' } : { text: 'À configurer', tone: 'todo' } },
      { href: '/administration/integrations', title: 'Digiforma', meta: `Dernière synchronisation : ${when(st.digiforma_last_sync)}`, badge: st.digiforma_last_sync_status === 'error' ? { text: 'Erreur', tone: 'urgent' } : st.digiforma_last_sync ? { text: 'OK', tone: 'ok' } : { text: 'Jamais', tone: 'todo' } },
    ];
  }

  // Prénom : le mot qui n'est pas en majuscules (« EROUART Martial » → Martial).
  const words: string[] = String(profile.full_name || '').split(/\s+/).filter(Boolean);
  const first = words.find((w) => w !== w.toUpperCase()) || words[0] || '';
  const dateLabel = new Date(today + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const myCount = myTodo.length;

  return (
    <main>
      <section className="content dash">
        <header className="dash-hero">
          <div>
            <p className="eyebrow">Tableau de bord</p>
            <h1>Bonjour {first}</h1>
            <p className="dash-date">
              {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
              {trainerId && ` · ${myToday.length ? `${myToday.length} formation${myToday.length > 1 ? 's' : ''} aujourd’hui` : 'pas de formation aujourd’hui'}`}
              {trainerId && myCount > 0 && ` · ${myCount} dossier${myCount > 1 ? 's' : ''} à compléter`}
            </p>
          </div>
          <div className="dash-actions">
            <Link href="/" className="btn"><CalendarDays size={15} aria-hidden /> Planning</Link>
            {staff && (
              <>
                <Link href="/?creer=1" className="btn primary"><Plus size={15} aria-hidden /> Nouvelle session</Link>
                <Link href="/poec?nouveau=1" className="btn"><Route size={15} aria-hidden /> Nouveau parcours POEC</Link>
              </>
            )}
          </div>
        </header>

        <div className="dash-grid">
          {trainerId && (
            <>
              <Card icon={<CalendarClock size={17} aria-hidden />} title="Aujourd’hui" items={myToday} empty="Pas de formation aujourd’hui." tone="dark" />
              <Card icon={<FileSignature size={17} aria-hidden />} title="Documents à remplir" items={myTodo} empty="Tous tes dossiers sont à jour." tone={myTodo.length ? 'warn' : undefined} />
              <Card icon={<CalendarDays size={17} aria-hidden />} title="Mes prochaines formations" items={myWeek} empty="Rien de prévu dans les 7 prochains jours." />
              {myLeaves.length > 0 && <Card icon={<CalendarOff size={17} aria-hidden />} title="Mes congés (30 jours)" items={myLeaves} empty="" />}
            </>
          )}

          {staff && (
            <>
              <Card icon={<AlertTriangle size={17} aria-hidden />} title={`À préparer (${ALERT_DAYS} jours)`} items={toPrepare} empty="Toutes les sessions à venir sont prêtes." tone={toPrepare.some((i) => i.badge?.tone === 'urgent') ? 'urgent' : toPrepare.length ? 'warn' : undefined} />
              {!trainerId && <Card icon={<CalendarClock size={17} aria-hidden />} title="Formations du jour" items={todayAll} empty="Aucune formation aujourd’hui." tone="dark" />}
              <Card icon={<ClipboardList size={17} aria-hidden />} title="Dossiers en attente du formateur" items={waitTrainer} empty="Aucun dossier en attente." tone={waitTrainer.length ? 'warn' : undefined} hint="Sessions terminées dont le formateur n’a pas tout rempli." />
              <Card icon={<FileSignature size={17} aria-hidden />} title="Dossiers à boucler (bureau)" items={officeTodo} empty="Rien à boucler." />
              <Card
                icon={<Route size={17} aria-hidden />}
                title="Parcours POEC en cours"
                items={poecItems}
                empty="Aucun parcours en cours."
                footer={
                  <span className="dash-card-links">
                    <Link href="/poec?nouveau=1"><Plus size={13} aria-hidden /> Nouveau parcours</Link>
                    {poecItems.length > 0 && <span className="hint">Session personnalisée : ouvre le parcours › « Session personnalisée »</span>}
                  </span>
                }
              />
            </>
          )}

          {billing && <Card icon={<Receipt size={17} aria-hidden />} title="À facturer" items={toBill} empty="Toutes les sessions terminées sont facturées." tone={toBill.length ? 'warn' : undefined} />}

          {isAdmin && (
            <>
              <Card
                icon={<UserPlus size={17} aria-hidden />}
                title="Administration"
                items={[
                  { href: '/administration', title: 'Demandes d’accès', badge: accessCount ? { text: `${accessCount} en attente`, tone: 'warn' } : { text: 'Aucune', tone: 'ok' } },
                  { href: '/ameliorations', title: 'Remarques dev', badge: devCount ? { text: `${devCount} à traiter`, tone: 'warn' } : { text: 'Aucune', tone: 'ok' } },
                ]}
                empty=""
              />
              <Card icon={<RefreshCcw size={17} aria-hidden />} title="Synchronisations" items={syncs} empty="" />
            </>
          )}

          {!trainerId && !staff && !billing && (
            <Card icon={<Lightbulb size={17} aria-hidden />} title="Bienvenue" items={[{ href: '/', title: 'Ouvrir le planning', meta: 'Toutes les formations, salle par salle' }]} empty="" />
          )}
        </div>

        {(trainerId || staff) && (
          <p className="hint dash-foot">
            <CheckCircle2 size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Les documents à remplir se mettent à jour dès qu’ils sont complétés dans le dossier de la session.
            {staff && <> · <PenLine size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Raccourci : touche N sur le planning pour une nouvelle session.</>}
          </p>
        )}
      </section>
    </main>
  );
}
