import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionStatus, type SessionStatus } from '@/lib/status';

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
    .select('id, title, room_id, trainer_id')
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
    const trainerClash = data?.find((s) => s.trainer_id === input.trainer_id);
    if (trainerClash) return `Conflit : ce formateur anime déjà « ${trainerClash.title} » sur ce créneau.`;
  }
  return null;
}
