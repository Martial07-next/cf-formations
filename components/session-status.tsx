import { SESSION_STATUS_LABEL } from '@/lib/status';
import { PHASE_LABEL, sessionPhase } from '@/lib/session-phase';

/** Statut affiché : « En cours » / « Terminée » selon la date, sinon le statut de la session. */
export function SessionStatus({ status, startAt, endAt, nowKey }: { status: string; startAt: string; endAt: string; nowKey: string }) {
  const phase = status === 'brouillon' ? null : sessionPhase(startAt, endAt, nowKey);
  if (phase) return <span className={`status-pill ${phase}`}>{PHASE_LABEL[phase]}</span>;
  return <span className={`status-pill ${status}`}>{SESSION_STATUS_LABEL[status as keyof typeof SESSION_STATUS_LABEL] ?? status}</span>;
}
