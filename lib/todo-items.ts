import { parisNowKey, parisToday } from '@/lib/paris-time';
import { addDays, isoDate, formatSessionPeriod } from '@/lib/week';
import { alertHorizon, daysLeft, sessionAlerts, sessionsWithoutDigiforma } from '@/lib/session-alerts';
import { CLOSURE_SESSION_SEL, loadClosures, loanReminderMail, trainerReminderMail } from '@/lib/closure';
import type { TodoItem } from '@/components/todo-board';
import type { SupabaseClient } from '@supabase/supabase-js';

const one = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * « À faire » du bureau : sessions à préparer, lien Digiforma manquant,
 * sessions terminées à clôturer, demandes d'accès et synchronisations.
 */
export async function loadTodoItems(supabase: SupabaseClient, profile: { role: string; can_invoice?: boolean | null }, origin: string): Promise<TodoItem[]> {
  const isAdmin = profile.role === 'admin';
  const today = parisToday();
  const nowKey = parisNowKey();
  const ago120 = isoDate(addDays(new Date(today + 'T00:00:00Z'), -120));

  const nextQuery = (sel: string) =>
    supabase.from('sessions').select(sel).gte('end_at', `${today}T00:00:00`).lt('start_at', alertHorizon(today)).order('start_at');
  const NEXT_SEL = 'id, title, start_at, end_at, status, trainer_id, session_trainees(status)';
  const [nextRes, { data: ended }, admin] = await Promise.all([
    nextQuery(`${NEXT_SEL}, manager:profiles!sessions_manager_id_fkey(full_name)`),
    supabase
      .from('sessions')
      .select(CLOSURE_SESSION_SEL)
      .neq('status', 'brouillon')
      .lte('end_at', nowKey)
      .gte('end_at', `${ago120}T00:00:00`)
      .order('end_at')
      .limit(400),
    isAdmin
      ? Promise.all([
          supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'en_attente'),
          supabase.from('app_settings').select('absences_last_sync, absences_last_log, digiforma_last_sync, digiforma_last_sync_status').eq('id', true).maybeSingle(),
        ])
      : Promise.resolve(null),
  ]);

  // Gestionnaire (migration 24) : relu sans lui si la colonne manque.
  const next = nextRes.error ? (await nextQuery(NEXT_SEL)).data : nextRes.data;
  const items: TodoItem[] = [];

  // ---- Avant la formation : sessions en cours ou qui commencent bientôt ----
  const upcoming = (next as any[]) || [];
  const noDf = await sessionsWithoutDigiforma(supabase, upcoming.map((s) => s.id));
  for (const s of upcoming) {
    const startsIn = Math.round((new Date(s.start_at.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000);
    const when = s.start_at.slice(0, 10) <= today ? 'En cours' : daysLeft(s.start_at, today);
    const urgent = startsIn <= 2;
    if (noDf.get(s.id) === 0 && s.status !== 'brouillon') {
      items.push({
        key: `df-${s.id}`,
        kind: 'digiforma',
        group: 'avant',
        urgency: urgent ? 3 : 2,
        sessionId: s.id,
        title: s.title,
        meta: formatSessionPeriod(s.start_at, s.end_at),
        badge: when,
        label: 'Lien Digiforma manquant',
      });
    }
  }
  const alerts = sessionAlerts(
    upcoming.filter((s) => s.start_at.slice(0, 10) >= today),
    today,
    new Map([...noDf].filter(([, n]) => n > 0))
  );
  for (const a of alerts) {
    const s = upcoming.find((x) => x.id === a.id);
    items.push({
      key: `prep-${a.id}`,
      kind: 'prepare',
      group: 'avant',
      urgency: a.urgent ? 3 : 1,
      sessionId: a.id,
      title: a.title,
      meta: s ? formatSessionPeriod(s.start_at, s.end_at) : '',
      badge: daysLeft(a.startAt, today),
      label: 'À préparer',
      reasons: a.reasons,
      manager: a.manager,
    });
  }

  // ---- Après la formation : sessions terminées pas encore bouclées ----
  const closures = await loadClosures(supabase as any, (ended as any[]) || []);
  for (const s of (ended as any[]) || []) {
    const c = closures[s.id];
    if (!c || c.closed) continue;
    const period = formatSessionPeriod(s.start_at, s.end_at);
    const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(s.end_at.slice(0, 10) + 'T00:00:00Z')) / 86400000);
    items.push({
      key: `close-${s.id}`,
      kind: 'close',
      group: 'apres',
      urgency: c.loansOut.length && days > 2 ? 3 : days > 14 ? 2 : 1,
      sessionId: s.id,
      title: s.title,
      meta: `${period}${one(s.trainers)?.full_name ? ` · ${one(s.trainers).full_name}` : ''}`,
      badge: days <= 0 ? 'Terminée aujourd’hui' : `Terminée il y a ${days} j`,
      label: 'À clôturer',
      closure: {
        trainerLeft: c.trainerLeft,
        officeLeft: c.officeLeft,
        loans: c.loansOut.map((l) => ({ ...l, mail: loanReminderMail(l, s.title) })),
        billed: c.billed,
        trainerName: c.trainerName,
        trainerMail: c.trainerLeft ? trainerReminderMail(c, `${origin}/sessions/${s.id}`, period) : null,
      },
    });
  }

  // ---- Administration ----
  if (admin) {
    const [{ count }, { data: settings }] = admin as any;
    if (count) {
      items.push({ key: 'access', kind: 'link', group: 'admin', urgency: 2, href: '/administration', title: `${count} demande${count > 1 ? 's' : ''} d’accès à traiter`, meta: 'Administration › Utilisateurs', label: 'Accès' });
    }
    const st = (settings as any) || {};
    if (String(st.absences_last_log || '').startsWith('ERREUR')) {
      items.push({ key: 'sync-conges', kind: 'link', group: 'admin', urgency: 3, href: '/administration/integrations#conges', title: 'Synchronisation des congés en erreur', meta: 'Administration › Intégrations', label: 'Synchronisation' });
    }
    if (st.digiforma_last_sync_status === 'error') {
      items.push({ key: 'sync-df', kind: 'link', group: 'admin', urgency: 3, href: '/administration/integrations', title: 'Synchronisation Digiforma en erreur', meta: 'Administration › Intégrations', label: 'Synchronisation' });
    }
  }

  items.sort((a, b) => b.urgency - a.urgency);
  return items;
}
