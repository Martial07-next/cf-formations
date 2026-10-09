import { frDate } from '@/lib/absences';

/** Formateur externe : intervient seulement pendant sa période (dates facultatives). */
export type MissionInfo = { is_external?: boolean | null; mission_start?: string | null; mission_end?: string | null };

/** Période d'intervention lisible, ex. « du 01/03/2026 au 30/06/2026 ». */
export function missionText(t: MissionInfo) {
  if (t.mission_start && t.mission_end) return `du ${frDate(t.mission_start)} au ${frDate(t.mission_end)}`;
  if (t.mission_start) return `à partir du ${frDate(t.mission_start)}`;
  if (t.mission_end) return `jusqu’au ${frDate(t.mission_end)}`;
  return 'sans période définie';
}

/** Vrai si la période [fromDay, toDay] sort de la période d'intervention d'un externe. */
export function outsideMission(t: MissionInfo | null | undefined, fromDay: string, toDay: string) {
  if (!t?.is_external || !fromDay) return false;
  const to = toDay || fromDay;
  return Boolean((t.mission_start && fromDay < t.mission_start) || (t.mission_end && to > t.mission_end));
}
