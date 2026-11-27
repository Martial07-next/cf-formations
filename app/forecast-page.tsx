import { createClient } from '@/lib/supabase/server';
import { compareRooms } from '@/lib/buildings';
import { addDays, isoDate, mondayOf } from '@/lib/week';
import { ForecastView } from '@/components/forecast/forecast-view';
import { PlanningTabs } from '@/components/forecast/planning-tabs';
import type { Forecast } from '@/lib/forecast';

/**
 * Onglet « Prévisionnel » du planning (bureau seulement) : semaine par salle,
 * avec les prévisions (IA ou ajoutées à la main) et, en grisé, les vraies sessions.
 */
export async function ForecastPage({ week }: { week?: string }) {
  const supabase = await createClient();
  const safe = week && !isNaN(new Date(week).getTime()) ? new Date(week) : new Date();
  const monday = mondayOf(safe);
  const mondayIso = isoDate(monday);
  const friday = isoDate(addDays(monday, 4));
  const today = isoDate(new Date());

  const [{ data: rooms }, { data: trainers }, { data: templates }, fc, { data: real }] = await Promise.all([
    supabase.from('rooms').select('id, name, is_holding, status, location').order('name'),
    supabase.from('trainers').select('id, full_name, color, status').order('full_name'),
    supabase.from('templates').select('id, title').order('title'),
    supabase.from('forecast_sessions').select('*').neq('status', 'ignore').gte('end_date', today).order('start_date').limit(1000),
    supabase
      .from('sessions')
      .select('id, title, status, room_id, start_at, end_at, trainers(full_name)')
      .lte('start_at', `${friday}T23:59:59`)
      .gte('end_at', `${mondayIso}T00:00:00`)
      .order('start_at'),
  ]);
  const realRooms = ((rooms as any[]) || []).filter((r) => !r.is_holding && r.status !== 'exterieur').sort(compareRooms);

  return (
    <main>
      <div className="planning-stack">
      <PlanningTabs active="previsionnel" />
      <ForecastView
        mondayIso={mondayIso}
        todayIso={today}
        rooms={realRooms.map((r) => ({ id: r.id, name: r.name }))}
        trainers={((trainers as any[]) || []).filter((t) => (t.status || 'actif') !== 'inactif').map((t) => ({ id: t.id, name: t.full_name, color: t.color || null }))}
        templates={((templates as any[]) || []).map((t) => ({ id: t.id, title: t.title }))}
        forecasts={(fc.data as Forecast[]) || []}
        migrationMissing={Boolean(fc.error)}
        real={((real as any[]) || []).map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          room_id: s.room_id,
          start_date: String(s.start_at).slice(0, 10),
          end_date: String(s.end_at).slice(0, 10),
          trainer: (Array.isArray(s.trainers) ? s.trainers[0] : s.trainers)?.full_name || null,
        }))}
      />
      </div>
    </main>
  );
}
