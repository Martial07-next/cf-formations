'use client';

import { ASPHALT, BAT1, BAT1_ANNEX, BAT1_ROOMS, BAT2, BAT2_ZONES, BEACH, BUNGALOW, D425, ROCADE, SLOTS, type Rect } from '@/lib/city/layout';
import type { BuildingId, CityState } from '@/lib/city/types';

/**
 * Plan 2D de secours (navigateur sans WebGL) : mêmes bâtiments, mêmes salles,
 * mêmes indicateurs que la 3D.
 */
export function CityPlan2D({ state, busy, onSelect, selected }: { state: CityState; busy: Record<BuildingId, Set<number>>; onSelect: (k: string) => void; selected: string | null }) {
  const R = ({ r, fill, stroke, k, label }: { r: Rect; fill: string; stroke?: string; k?: string; label?: string }) => (
    <g onClick={k ? () => onSelect(k) : undefined} style={k ? { cursor: 'pointer' } : undefined}>
      <rect x={r.x} y={r.z} width={r.w} height={r.d} fill={fill} stroke={stroke || 'none'} strokeWidth={k && selected === k ? 0.9 : 0.3} rx={0.4} />
      {label && (
        <text x={r.x + r.w / 2} y={r.z + r.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.6} fontWeight={700} fill="#17241b">
          {label}
        </text>
      )}
    </g>
  );
  const conge = state.trainers.filter((t) => t.status === 'conge');
  return (
    <div className="city-2d">
      <p className="city-2d-note">Ton navigateur n’affiche pas la 3D (WebGL indisponible) : voici le plan de la ville avec les mêmes informations.</p>
      <svg viewBox="-135 -40 245 160" role="img" aria-label="Plan des bâtiments CF Réseaux">
        <rect x={-135} y={-40} width={245} height={160} fill="#9db487" />
        <rect x={-135} y={D425.z - D425.w / 2} width={245} height={D425.w} fill="#4a4e52" />
        <rect x={ROCADE.x - ROCADE.w / 2} y={-40} width={ROCADE.w} height={110} fill="#4a4e52" />
        <text x={-60} y={D425.z + 1} fontSize={3} fill="#fff">D425</text>
        <text x={ROCADE.x - 3} y={40} fontSize={3} fill="#fff" transform={`rotate(-90 ${ROCADE.x} 40)`}>D621</text>
        {ASPHALT.map((r, i) => <R key={i} r={r} fill="#6b6f73" />)}
        {SLOTS.map((s) => <rect key={s.id} x={s.x - 1.1} y={s.z - 1.1} width={2.2} height={2.2} fill="none" stroke="#e8e6df" strokeWidth={0.2} />)}
        <R r={BAT1} fill="#e6e2d8" stroke="#08fa64" k="bat1" />
        {BAT1_ROOMS.map((r) => (
          <R key={r.key} r={r.rect} fill={r.number && busy.bat1.has(r.number) ? '#b9f5cf' : '#efece4'} stroke="#9aa39c" label={r.number ? `S${r.number}` : undefined} />
        ))}
        <R r={BAT1_ANNEX} fill="#cdd1cf" />
        <R r={BUNGALOW} fill="#17241b" k="admin" />
        <text x={BUNGALOW.x + BUNGALOW.w / 2} y={BUNGALOW.z + BUNGALOW.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.2} fontWeight={700} fill="#fffdf3">ADMINISTRATION</text>
        <R r={BAT2} fill="#c9d0d6" stroke="#08fa64" k="bat2" />
        {BAT2_ZONES.map((z) => (
          <R key={z.number} r={z.rect} fill={busy.bat2.has(z.number) ? '#b9f5cf' : '#dde2e6'} label={`S${z.number}`} />
        ))}
        <circle cx={BEACH.x} cy={Math.min(BEACH.z, 105)} r={8} fill="#ecd9a6" onClick={() => onSelect('beach')} style={{ cursor: 'pointer' }} />
        <text x={BEACH.x} y={Math.min(BEACH.z, 105)} textAnchor="middle" fontSize={2.4} fontWeight={700} fill="#17241b">Beach Club · {conge.length}</text>
      </svg>
    </div>
  );
}
