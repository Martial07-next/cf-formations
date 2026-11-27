import { createClient } from '@/lib/supabase/server';
import { compareRooms } from '@/lib/buildings';
import { addDays, isoDate, mondayOf } from '@/lib/week';
import { ForecastView } from '@/components/forecast/forecast-view';
import { PlanningTabs } from '@/components/forecast/planning-tabs';
import { prepositionDigiforma, rankByUse, type DfForecast, type Forecast } from '@/lib/forecast';
import { loadPlaceRefs, matchRoom, matchTrainer } from '@/lib/digiforma-place';
import { matchModule } from '@/lib/catalog-match';
import { isPlaceholder } from '@/lib/digiforma-people';
import { isCompanyPeriod, isOffPeriod } from '@/lib/digiforma-sync';

/** Semaines suivies pour les sessions Digiforma à placer (liste « À venir »). */
const DF_WEEKS = 8;

/**
 * Onglet « Prévisionnel » du planning (bureau seulement) : jours à gauche,
 * salles en haut, comme le planning. On y voit :
 *  · les sessions Digiforma à placer, pré-positionnées dans une salle libre ;
 *  · les prévisions de l'IA (historique) et celles ajoutées à la main ;
 *  · en grisé, les vraies sessions du planning.
 */
export async function ForecastPage({ week }: { week?: string }) {
  const supabase = await createClient();
  const safe = week && !isNaN(new Date(week).getTime()) ? new Date(week) : new Date();
  const monday = mondayOf(safe);
  const mondayIso = isoDate(monday);
  const friday = isoDate(addDays(monday, 4));
  const today = isoDate(new Date());
  const dfFrom = mondayIso < today ? mondayIso : today;
  const dfTo = isoDate(addDays(mondayOf(new Date()), DF_WEEKS * 7));
  const rangeTo = friday > dfTo ? friday : dfTo;
  const yearAgo = isoDate(addDays(new Date(), -365));

  const [{ data: rooms }, { data: trainers }, { data: templates }, fc, { data: real }, { data: dfRows }, { data: hist }, { data: roomTpl }, placeRefs] = await Promise.all([
    supabase.from('rooms').select('id, name, capacity, is_holding, status, location').order('name'),
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
    supabase.from('templates').select('id, title').order('title'),
    supabase.from('forecast_sessions').select('*').neq('status', 'ignore').gte('end_date', today).order('start_date').limit(1000),
    supabase
      .from('sessions')
      .select('id, title, status, room_id, start_at, end_at, trainers(full_name)')
      .lte('start_at', `${rangeTo}T23:59:59`)
      .gte('end_at', `${dfFrom < mondayIso ? dfFrom : mondayIso}T00:00:00`)
      .order('start_at')
      .limit(2000),
    supabase
      .from('digiforma_modules')
      .select('*')
      .is('placed_session_id', null)
      .is('covered_by', null)
      .lte('start_at', `${rangeTo}T23:59:59`)
      .gte('end_at', `${dfFrom < mondayIso ? dfFrom : mondayIso}T00:00:00`)
      .order('start_at')
      .limit(400),
    supabase.from('sessions').select('template_id, room_id, trainer_id').gte('start_at', yearAgo).neq('status', 'brouillon').not('template_id', 'is', null).limit(5000),
    supabase.from('room_templates').select('room_id, template_id'),
    loadPlaceRefs(supabase as any),
  ]);
  const realRooms = ((rooms as any[]) || []).filter((r) => !r.is_holding && r.status !== 'exterieur').sort(compareRooms);
  const realRoomIds = new Set(realRooms.map((r) => r.id));
  const catalog = ((templates as any[]) || []).map((t) => ({ id: t.id as string, title: t.title as string }));
  const forecasts = (fc.data as Forecast[]) || [];
  const realList = ((real as any[]) || []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    status: s.status as string,
    room_id: s.room_id as string | null,
    start_date: String(s.start_at).slice(0, 10),
    end_date: String(s.end_at).slice(0, 10),
    trainer: (Array.isArray(s.trainers) ? s.trainers[0] : s.trainers)?.full_name || null,
  }));

  // Sessions Digiforma à placer : avec de vrais stagiaires, pas un stage ni des vacances.
  const mods = ((dfRows as any[]) || [])
    .filter((m) => !isCompanyPeriod(m.name || '') && !isOffPeriod(m.name || ''))
    .map((m) => {
      const people = ((Array.isArray(m.trainees) ? m.trainees : []) as any[]).filter((t) => !isPlaceholder(t));
      const title = (m.whole_session ? m.df_session_name : m.name || m.df_session_name) || 'Module Digiforma';
      const match = matchModule(m.whole_session ? m.df_session_name || '' : m.name || m.df_session_name || '', m.df_session_name || '', catalog);
      const trainersDf = Array.isArray(m.df_trainers) ? m.df_trainers : null;
      return {
        key: m.key as string,
        title,
        parent: m.whole_session ? null : ((m.df_session_name as string) || null),
        start_date: String(m.start_at).slice(0, 10),
        end_date: String(m.end_at).slice(0, 10),
        start_time: String(m.start_at).slice(11, 16) || '08:00',
        end_time: String(m.end_at).slice(11, 16) || '16:00',
        trainees: people.length,
        template_id: match.templateId && match.confidence !== 'none' ? match.templateId : null,
        df_room_id: matchRoom(placeRefs, m.df_room),
        df_trainer_id: matchTrainer(placeRefs, trainersDf),
        df_place: [m.df_room ? `salle ${m.df_room}` : null, trainersDf?.[0]?.name ? trainersDf.map((t: any) => t.name).join(', ') : null].filter(Boolean).join(' · ') || null,
      };
    })
    .filter((m) => m.trainees > 0);
  const hrows = (hist as any[]) || [];
  const equipped: Record<string, string[]> = {};
  for (const r of (roomTpl as any[]) || []) (equipped[r.template_id] ||= []).push(r.room_id);
  const dfForecasts: DfForecast[] = prepositionDigiforma(mods, {
    rooms: realRooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity ?? null })),
    busy: [
      ...realList.filter((s) => s.room_id && realRoomIds.has(s.room_id)),
      ...forecasts.filter((f) => f.status === 'prevu' && f.room_id),
    ],
    tplRooms: rankByUse(hrows.filter((r) => realRoomIds.has(r.room_id)).map((r) => ({ key: r.template_id, value: r.room_id }))),
    tplTrainers: rankByUse(hrows.map((r) => ({ key: r.template_id, value: r.trainer_id }))),
    equipped,
  });

  return (
    <main>
      <div className="planning-stack">
        <PlanningTabs active="previsionnel" />
        <ForecastView
          mondayIso={mondayIso}
          todayIso={today}
          rooms={realRooms.map((r) => ({ id: r.id, name: r.name }))}
          trainers={((trainers as any[]) || []).filter((t) => (t.status || 'actif') !== 'inactif').map((t) => ({ id: t.id, name: t.full_name, color: t.color || null }))}
          templates={catalog}
          forecasts={forecasts}
          digiforma={dfForecasts}
          dfWeeks={DF_WEEKS}
          migrationMissing={Boolean(fc.error)}
          real={realList}
        />
      </div>
    </main>
  );
}
