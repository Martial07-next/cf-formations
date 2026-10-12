import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionStatus, type SessionStatus } from '@/lib/status';
import { absenceText, type Absence } from '@/lib/absences';
import { missionText, outsideMission } from '@/lib/external';
import { loadDayTrainers, trainerOn } from '@/lib/day-trainers';
import { weekdaysBetween } from '@/lib/week';

export type SessionInput = {
  title: string;
  room_id: string;
  trainer_id: string | null;
  template_id: string | null;
  start_at: string;
  end_at: string;
  status: SessionStatus;
  max_trainees: number | null;
  notes: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Lit et valide le formulaire d'enregistrement d'une session :
 * date de début + date de fin (optionnelle, pour plusieurs jours) + horaires.
 */
export function parseSessionForm(formData: FormData): { ok: true; value: SessionInput } | { ok: false; error: string } {
  const get = (k: string) => String(formData.get(k) ?? '').trim();

  const title = get('title');
  const roomId = get('room_id');
  const startDate = get('start_date');
  const endDate = get('end_date') || startDate;
  const startTime = get('start_time');
  const endTime = get('end_time');
  const status = get('status') || 'planifiee';
  const maxRaw = get('max_trainees');

  if (!title) return { ok: false, error: 'Indique le nom de la formation.' };
  if (!roomId) return { ok: false, error: 'Choisis une salle.' };
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return { ok: false, error: 'Date invalide.' };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return { ok: false, error: 'Horaires invalides.' };
  if (endDate < startDate) return { ok: false, error: 'La date de fin doit être après la date de début.' };
  if (endTime <= startTime) return { ok: false, error: "L'heure de fin doit être après l'heure de début." };
  if (!isSessionStatus(status)) return { ok: false, error: 'Statut inconnu.' };

  const maxTrainees = maxRaw ? Number(maxRaw) : null;
  if (maxTrainees != null && (!Number.isInteger(maxTrainees) || maxTrainees < 0)) {
    return { ok: false, error: 'Nombre maximum de stagiaires invalide.' };
  }

  return {
    ok: true,
    value: {
      title,
      room_id: roomId,
      trainer_id: get('trainer_id') || null,
      template_id: get('template_id') || null,
      start_at: `${startDate}T${startTime}:00`,
      end_at: `${endDate}T${endTime}:00`,
      status,
      max_trainees: maxTrainees,
      notes: get('notes') || null,
    },
  };
}

/**
 * Vérifie qu'aucune autre session n'occupe la même salle (sauf la salle
 * virtuelle « À affecter ») ni le même formateur sur un créneau qui se
 * chevauche. Le trigger SQL (migration_phase7) fait la même vérification
 * pour la salle, en dernier rempart.
 */
export async function findSessionConflict(
  supabase: SupabaseClient,
  input: Pick<SessionInput, 'room_id' | 'trainer_id' | 'start_at' | 'end_at'>,
  excludeId?: string
): Promise<string | null> {
  let query = supabase
    .from('sessions')
    .select('id, title, room_id, trainer_id, start_at, end_at')
    .lt('start_at', input.end_at)
    .gt('end_at', input.start_at);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) return error.message;

  const { data: room } = await supabase.from('rooms').select('is_holding').eq('id', input.room_id).maybeSingle();
  if (!room?.is_holding) {
    const roomClash = data?.find((s) => s.room_id === input.room_id);
    if (roomClash) return `Conflit : la salle est déjà réservée pour « ${roomClash.title} » sur ce créneau.`;
  }
  if (input.trainer_id) {
    // Jours où ce formateur anime vraiment cette session (hors jours confiés à un remplaçant).
    const ownMap = excludeId ? await loadDayTrainers(supabase, [excludeId]) : {};
    const sessionDays = weekdaysBetween(input.start_at, input.end_at);
    const activeDays = (sessionDays.length ? sessionDays : [input.start_at.slice(0, 10)]).filter(
      (d) => !excludeId || !ownMap[excludeId]?.[d] || ownMap[excludeId][d].trainer_id === input.trainer_id
    );
    // Autres sessions où il est formateur ce jour-là (principal non remplacé, ou remplaçant).
    const others = data || [];
    const othersMap = await loadDayTrainers(supabase, others.map((s) => s.id));
    for (const s of others) {
      const days = weekdaysBetween(s.start_at, s.end_at);
      const clashDay = activeDays.find((d) => (days.length ? days : [s.start_at.slice(0, 10)]).includes(d) && trainerOn(othersMap, s, d) === input.trainer_id);
      if (clashDay) {
        return `Conflit : ce formateur anime déjà « ${s.title} » le ${clashDay.split('-').reverse().join('/')}.`;
      }
    }

    // Formateur externe : seulement pendant sa période d'intervention.
    const { data: tr } = await supabase.from('trainers').select('*').eq('id', input.trainer_id).maybeSingle();
    if (tr && outsideMission(tr as any, input.start_at.slice(0, 10), input.end_at.slice(0, 10))) {
      return `Formateur externe indisponible : ${tr.full_name} intervient ${missionText(tr as any)}.`;
    }

    // Congés / absences du formateur (la base bloque aussi, migration_phase10).
    const { data: off } = await supabase
      .from('trainer_absences')
      .select('id, trainer_id, start_date, end_date, kind')
      .eq('trainer_id', input.trainer_id)
      .lte('start_date', input.end_at.slice(0, 10))
      .gte('end_date', input.start_at.slice(0, 10))
      .order('start_date');
    // Congés tombant uniquement sur des jours confiés à un remplaçant : pas de blocage.
    const blocking = (off || []).filter((a: any) => activeDays.some((d) => d >= a.start_date && d <= a.end_date));
    if (blocking.length) {
      const { data: t } = await supabase.from('trainers').select('full_name').eq('id', input.trainer_id).maybeSingle();
      return `Formateur indisponible : ${t?.full_name ?? 'ce formateur'} est ${absenceText(blocking[0] as Absence)}.`;
    }
  }
  return null;
}

