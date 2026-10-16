/** Relances côté équipe : sessions qui commencent dans les 7 jours et qui ne sont pas prêtes. */

export type SessionAlert = {
  id: string;
  title: string;
  startAt: string;
  manager: string | null;
  reasons: string[];
  /** Urgent : commence dans 2 jours ou moins. */
  urgent: boolean;
};

export const ALERT_DAYS = 7;

export function sessionAlerts(rows: any[], todayIso: string): SessionAlert[] {
  const today = new Date(todayIso + 'T00:00:00Z').getTime();
  const out: SessionAlert[] = [];
  for (const s of rows) {
    const trainees = (s.session_trainees as any[]) || [];
    const validated = trainees.filter((t) => t.status === 'validee').length;
    const waiting = trainees.filter((t) => t.status === 'en_attente').length;
    const reasons: string[] = [];
    if (s.status === 'brouillon') reasons.push('brouillon');
    else if (s.status !== 'confirmee') reasons.push('pas confirmée');
    if (!s.trainer_id) reasons.push('sans formateur');
    if (!validated) reasons.push('aucun stagiaire validé');
    if (waiting) reasons.push(`${waiting} stagiaire${waiting > 1 ? 's' : ''} en attente`);
    if (!reasons.length) continue;
    const manager = Array.isArray(s.manager) ? s.manager[0] : s.manager;
    const days = Math.round((new Date(s.start_at.slice(0, 10) + 'T00:00:00Z').getTime() - today) / 86400000);
    out.push({ id: s.id, title: s.title, startAt: s.start_at, manager: manager?.full_name || null, reasons, urgent: days <= 2 });
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** « aujourd'hui », « demain », « dans 3 jours ». */
export function inDays(startAt: string, todayIso: string): string {
  const d = Math.round((new Date(startAt.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(todayIso + 'T00:00:00Z').getTime()) / 86400000);
  return d <= 0 ? 'aujourd’hui' : d === 1 ? 'demain' : `dans ${d} jours`;
}
