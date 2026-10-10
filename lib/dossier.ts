import { effectiveDayTime, weekdaysBetween, type DayOverride } from '@/lib/week';

/**
 * Dossier de formation dématérialisé : émargement par demi-journée et
 * documents à remplir. Fonctions pures, utilisées côté serveur et client.
 */

export type Half = 'am' | 'pm';
export const HALF_LABEL: Record<Half, string> = { am: 'Matin', pm: 'Après-midi' };
export type Slot = { day: string; half: Half; start: string; end: string };

export type SignatureRow = {
  id?: string;
  signer: 'stagiaire' | 'formateur';
  trainee_id: string | null;
  day: string;
  half: Half;
  status: 'signe' | 'absent';
  signature?: string | null;
  signer_name?: string | null;
  signed_at?: string;
};

export type DossierDocument = {
  id: string;
  template_id: string | null;
  session_id: string | null;
  title: string;
  storage_path: string;
  file_name: string | null;
  filled_by: 'formateur' | 'bureau' | 'aucun';
  required: boolean;
  position: number;
};

export type DossierEntry = { document_id: string; completed: boolean; updated_at?: string; data?: any };

/** Demi-journées d'une session (matin si la journée commence avant 12 h, après-midi si elle finit après 13 h). */
export function sessionSlots(startAt: string, endAt: string, overrides: DayOverride[] = []): Slot[] {
  const days = weekdaysBetween(startAt, endAt);
  const list = days.length ? days : [startAt.slice(0, 10)];
  const slots: Slot[] = [];
  for (const day of list) {
    const { start, end } = effectiveDayTime(day, startAt, endAt, overrides);
    if (start < '12:00') slots.push({ day, half: 'am', start, end: end < '12:00' ? end : '12:00' });
    if (end > '13:00') slots.push({ day, half: 'pm', start: start > '13:00' ? start : '13:00', end });
  }
  return slots;
}

/** Stagiaires attendus un jour donné : ceux qui suivent un module ce jour-là (ou tous s'ils n'ont pas de modules choisis). */
export function expectedOn(
  day: string,
  traineeIds: string[],
  modules: { id: string; start_day: string; end_day: string }[],
  traineeModules: Record<string, string[]>
) {
  if (!modules.length) return traineeIds;
  const todays = modules.filter((m) => m.start_day <= day && m.end_day >= day).map((m) => m.id);
  return traineeIds.filter((id) => !traineeModules[id]?.length || traineeModules[id].some((m) => todays.includes(m)));
}

export const slotKey = (s: { day: string; half: Half }) => `${s.day}|${s.half}`;

/** Avancement du dossier d'une session. */
export function dossierProgress(input: {
  slots: Slot[];
  traineeIds: string[];
  modules?: { id: string; start_day: string; end_day: string }[];
  traineeModules?: Record<string, string[]>;
  signatures: Pick<SignatureRow, 'signer' | 'trainee_id' | 'day' | 'half'>[];
  documents: Pick<DossierDocument, 'id' | 'required' | 'filled_by'>[];
  entries: Pick<DossierEntry, 'document_id' | 'completed'>[];
}) {
  const signed = new Set(input.signatures.map((s) => `${s.signer}|${s.trainee_id || ''}|${s.day}|${s.half}`));
  let needed = 0;
  let done = 0;
  for (const slot of input.slots) {
    const expected = expectedOn(slot.day, input.traineeIds, input.modules || [], input.traineeModules || {});
    for (const id of expected) {
      needed++;
      if (signed.has(`stagiaire|${id}|${slot.day}|${slot.half}`)) done++;
    }
    needed++;
    if (signed.has(`formateur||${slot.day}|${slot.half}`)) done++;
  }
  const required = input.documents.filter((d) => d.required && d.filled_by !== 'aucun');
  const completedDocs = required.filter((d) => input.entries.some((e) => e.document_id === d.id && e.completed)).length;
  const emargementDone = input.traineeIds.length > 0 && needed > 0 && done === needed;
  return {
    emargement: { done, needed, complete: emargementDone },
    documents: { done: completedDocs, needed: required.length },
    complete: emargementDone && completedDocs === required.length,
  };
}

/** Date et heure actuelles en France (YYYY-MM-DD, HH:MM). */
export function parisNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
}

/** Demi-journée en cours (matin jusqu'à 13 h), si la session a lieu à ce moment. */
export function currentSlot(slots: Slot[], now = parisNow()): Slot | null {
  const half: Half = now.hm < '13:00' ? 'am' : 'pm';
  return slots.find((s) => s.day === now.day && s.half === half) || null;
}
