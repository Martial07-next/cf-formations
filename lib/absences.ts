export type Absence = {
  id: string;
  trainer_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  kind: 'conge' | 'absence' | 'maladie' | 'autre';
  note?: string | null;
};

export const ABSENCE_KINDS: { value: Absence['kind']; label: string }[] = [
  { value: 'conge', label: 'Congé' },
  { value: 'absence', label: 'Absence' },
  { value: 'maladie', label: 'Arrêt maladie' },
  { value: 'autre', label: 'Autre indisponibilité' },
];

export const ABSENCE_LABEL: Record<string, string> = Object.fromEntries(ABSENCE_KINDS.map((k) => [k.value, k.label]));

export function frDate(iso: string) {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

/** Première absence du formateur qui chevauche la période [fromDay, toDay]. */
export function absenceFor(absences: Absence[], trainerId: string | null | undefined, fromDay: string, toDay: string): Absence | null {
  if (!trainerId || !fromDay) return null;
  return (
    absences
      .filter((a) => a.trainer_id === trainerId && a.start_date <= (toDay || fromDay) && a.end_date >= fromDay)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null
  );
}

export function absenceText(a: Absence) {
  const what = a.kind === 'conge' ? 'en congé' : a.kind === 'maladie' ? 'en arrêt maladie' : 'absent';
  return a.start_date === a.end_date ? `${what} le ${frDate(a.start_date)}` : `${what} du ${frDate(a.start_date)} au ${frDate(a.end_date)}`;
}
