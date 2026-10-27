/**
 * Indicateurs de la ville : uniquement des données réelles du planning.
 * Formules documentées dans docs/cf-reseaux-city.md.
 */
import { toMin, type BuildingId, type CityState } from './types';

export type CityKpi = {
  sessions: number;
  validated: number;
  waiting: number;
  /** Émargés sur la demi-journée en cours (null : émargement non disponible). */
  present: number | null;
  presentPartial: boolean;
  half: 'am' | 'pm';
  trainers: number;
  roomsUsed: number;
  roomsAvailable: number;
  /** Salles occupées ÷ salles disponibles, en % (null sans salle disponible). */
  occupancy: number | null;
  liveSessions: number;
  upcoming: number;
  alerts: number;
  intra: number;
};

export function computeKpi(state: CityState, T: number, building: BuildingId | null): CityKpi {
  const inScope = (b: BuildingId | null) => !building || b === building;
  const sessions = state.sessions.filter((s) => (building ? s.building === building : true));
  const half: 'am' | 'pm' = T < 13 * 60 ? 'am' : 'pm';
  const presents = sessions.filter((s) => !s.external).map((s) => (half === 'am' ? s.presentAm : s.presentPm));
  const known = presents.filter((p): p is number => p !== null);
  const rooms = state.rooms.filter((r) => r.available && r.building && inScope(r.building));
  const used = new Set(sessions.map((s) => s.roomId).filter((id): id is string => !!id && rooms.some((r) => r.id === id)));
  return {
    sessions: sessions.length,
    validated: sessions.reduce((n, s) => n + s.validated, 0),
    waiting: sessions.reduce((n, s) => n + s.waiting, 0),
    present: known.length ? known.reduce((a, b) => a + b, 0) : null,
    presentPartial: known.length > 0 && known.length < presents.length,
    half,
    trainers: new Set(sessions.flatMap((s) => s.trainerIds)).size,
    roomsUsed: used.size,
    roomsAvailable: rooms.length,
    occupancy: rooms.length ? Math.round((used.size / rooms.length) * 100) : null,
    liveSessions: sessions.filter((s) => T >= toMin(s.start) && T <= toMin(s.end)).length,
    upcoming: state.upcoming,
    alerts: state.alerts.length,
    intra: building ? 0 : state.sessions.filter((s) => s.external).length,
  };
}
