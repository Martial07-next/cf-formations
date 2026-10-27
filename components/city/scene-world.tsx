'use client';

import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import {
  ASPHALT,
  BAT1,
  BAT1_ANNEX,
  BAT1_ROOMS,
  BAT2,
  BAT2_ZONES,
  BEACH,
  BRIDGE,
  BUNGALOW,
  CHAMP_DE_TIR,
  D425,
  HAUTE_RIVE,
  LAMPS,
  LOUNGERS,
  NEIGHBOURS,
  ROCADE,
  ROUNDABOUT,
  SLOTS,
  TREES,
  type Rect,
} from '@/lib/city/layout';
import type { WorkshopFamily } from '@/lib/city/types';
import { GEO, Sign, Slab, mat } from './scene-kit';

/** Décor fixe : sol, routes, végétation, bâtiments, Beach Club. */

const C = {
  grass: '#9db487',
  grass2: '#8fa979',
  field: '#cdbd8c',
  asphalt: '#5b5f63',
  road: '#4a4e52',
  walk: '#c9c4b8',
  line: '#f2f0e8',
  dark: '#17241b',
  electric: '#08fa64',
  cream: '#fffdf3',
};

type Pick = {
  hovered: string | null;
  selected: string | null;
  onHover: (k: string | null) => void;
  onSelect: (k: string) => void;
};
const handlers = (key: string, p: Pick) => ({
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    p.onHover(key);
    document.body.style.cursor = 'pointer';
  },
  onPointerOut: () => {
    p.onHover(null);
    document.body.style.cursor = '';
  },
  onClick: (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    p.onSelect(key);
  },
});

/** Volume invisible de sélection, avec contour lumineux au survol. */
function HitBox({ r, h, k, p, outline = true }: { r: Rect; h: number; k: string; p: Pick; outline?: boolean }) {
  const on = outline && (p.hovered === k || p.selected === k);
  return (
    <mesh geometry={GEO.box} position={[r.x + r.w / 2, h / 2, r.z + r.d / 2]} scale={[r.w + 0.4, h + 0.3, r.d + 0.4]} {...handlers(k, p)}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      {on && <Edges color={C.electric} lineWidth={2} threshold={15} />}
    </mesh>
  );
}

// ---- Sol, routes ----------------------------------------------------------
export function Ground({ waves }: { waves: boolean }) {
  return (
    <group>
      <Slab x={-270} z={-130} w={460} d={192} h={0.4} y={-0.4} color={C.grass} />
      {/* champs entre la rocade et le BAT 1, et à l'ouest */}
      <Slab x={-24} z={-120} w={29} d={95} h={0.02} color={C.field} />
      <Slab x={-24} z={-21} w={29} d={78} h={0.02} color={C.field} />
      <Slab x={-240} z={-110} w={70} d={78} h={0.02} color={C.field} />
      {Array.from({ length: 9 }, (_, i) => (
        <Slab key={i} x={-23} z={-20 + i * 8.5} w={27} d={0.35} h={0.03} color="#bfae7c" />
      ))}
      <Sea waves={waves} />
    </group>
  );
}

function Sea({ waves }: { waves: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(460, 110, 60, 16);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(({ clock }) => {
    if (!waves || !ref.current) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.12 + t * 1.1) * 0.12 + Math.cos(z * 0.18 + t * 0.8) * 0.1);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh ref={ref} geometry={geo} position={[-40, -0.35, 117]} receiveShadow>
      <meshStandardMaterial color="#3fa7c9" roughness={0.25} metalness={0.1} transparent opacity={0.92} />
    </mesh>
  );
}

function Dashes({ from, to, z, x, along = 'x', gap = 6, len = 3, y = 0.06 }: { from: number; to: number; z?: number; x?: number; along?: 'x' | 'z'; gap?: number; len?: number; y?: number }) {
  const n = Math.max(1, Math.floor((to - from) / gap));
  const m = useMemo(() => new THREE.Matrix4(), []);
  return (
    <instancedMesh frustumCulled={false}
      ref={(r) => {
        if (!r) return;
        for (let i = 0; i < n; i++) {
          const p = from + i * gap;
          m.compose(
            new THREE.Vector3(along === 'x' ? p : x!, y, along === 'x' ? z! : p),
            new THREE.Quaternion(),
            new THREE.Vector3(along === 'x' ? len : 0.22, 0.02, along === 'x' ? 0.22 : len)
          );
          r.setMatrixAt(i, m);
        }
        r.instanceMatrix.needsUpdate = true;
      }}
      args={[GEO.box, mat(C.line), n]}
    />
  );
}

export function Roads() {
  const zr = D425.z - D425.w / 2;
  const rampLenW = Math.hypot(BRIDGE.x0 - BRIDGE.rampW, BRIDGE.h);
  const rampLenE = Math.hypot(BRIDGE.rampE - BRIDGE.x1, BRIDGE.h);
  const angW = Math.atan2(BRIDGE.h, BRIDGE.x0 - BRIDGE.rampW);
  const angE = Math.atan2(BRIDGE.h, BRIDGE.rampE - BRIDGE.x1);
  const road = mat(C.road, { rough: 0.95 });
  return (
    <group>
      {/* Rocade Minière (D621), 2 × 2 voies avec terre-plein */}
      <Slab x={ROCADE.x - ROCADE.w / 2} z={ROCADE.z0} w={ROCADE.w} d={ROCADE.z1 - ROCADE.z0 - 100} h={0.06} material={road} />
      <Slab x={ROCADE.x - 0.6} z={ROCADE.z0} w={1.2} d={ROCADE.z1 - ROCADE.z0 - 100} h={0.18} color={C.grass2} />
      <Dashes from={ROCADE.z0} to={ROCADE.z1 - 100} x={ROCADE.x - 4} along="z" />
      <Dashes from={ROCADE.z0} to={ROCADE.z1 - 100} x={ROCADE.x + 4} along="z" />
      {/* D425 : ouest, rampe, pont, rampe, est */}
      <Slab x={D425.x0} z={zr} w={BRIDGE.rampW - D425.x0} d={D425.w} h={0.07} material={road} />
      <Dashes from={D425.x0} to={BRIDGE.rampW} z={D425.z} />
      <mesh geometry={GEO.box} material={road} position={[(BRIDGE.rampW + BRIDGE.x0) / 2, BRIDGE.h / 2, D425.z]} rotation={[0, 0, angW]} scale={[rampLenW, 0.5, D425.w]} receiveShadow castShadow />
      <mesh geometry={GEO.box} material={road} position={[(BRIDGE.x1 + BRIDGE.rampE) / 2, BRIDGE.h / 2, D425.z]} rotation={[0, 0, -angE]} scale={[rampLenE, 0.5, D425.w]} receiveShadow castShadow />
      <Slab x={BRIDGE.x0} z={zr} w={BRIDGE.x1 - BRIDGE.x0} d={D425.w} y={BRIDGE.h - 0.7} h={0.8} color="#8a8d8f" cast />
      <Slab x={BRIDGE.x0} z={zr} w={BRIDGE.x1 - BRIDGE.x0} d={D425.w} y={BRIDGE.h + 0.08} h={0.04} material={road} />
      <Dashes from={BRIDGE.x0} to={BRIDGE.x1} z={D425.z} y={BRIDGE.h + 0.12} />
      {[zr - 0.15, zr + D425.w - 0.15].map((z) => (
        <Slab key={z} x={BRIDGE.x0} z={z} w={BRIDGE.x1 - BRIDGE.x0} d={0.3} y={BRIDGE.h + 0.1} h={1} color="#c9ccce" />
      ))}
      {[BRIDGE.x0 + 2, ROCADE.x - 1, BRIDGE.x1 - 4].map((x) => (
        <Slab key={x} x={x} z={zr + 1} w={2} d={D425.w - 2} h={BRIDGE.h - 0.7} color="#a3a6a8" cast />
      ))}
      <Slab x={BRIDGE.rampE} z={zr} w={ROUNDABOUT.x - ROUNDABOUT.r - BRIDGE.rampE} d={D425.w} h={0.07} material={road} />
      <Dashes from={BRIDGE.rampE + 10} to={ROUNDABOUT.x - ROUNDABOUT.r - 2} z={D425.z} />
      <Slab x={ROUNDABOUT.x + ROUNDABOUT.r} z={zr} w={D425.x1 - ROUNDABOUT.x - ROUNDABOUT.r} d={D425.w} h={0.07} material={road} />
      {/* Rond-point */}
      <mesh position={[ROUNDABOUT.x, 0.08, ROUNDABOUT.z]} rotation={[-Math.PI / 2, 0, 0]} material={road} receiveShadow>
        <ringGeometry args={[ROUNDABOUT.r - 4.6, ROUNDABOUT.r + 1.2, 40]} />
      </mesh>
      <mesh geometry={GEO.cyl} material={mat(C.grass2)} position={[ROUNDABOUT.x, 0.25, ROUNDABOUT.z]} scale={[(ROUNDABOUT.r - 4.6) * 2, 0.5, (ROUNDABOUT.r - 4.6) * 2]} receiveShadow />
      <Slab x={ROUNDABOUT.x - 3} z={ROUNDABOUT.z + ROUNDABOUT.r - 0.5} w={6} d={40} h={0.07} material={road} />
      {/* Rue du Champ de Tir et voie du Parc de la Haute Rive */}
      <Slab x={CHAMP_DE_TIR.x - CHAMP_DE_TIR.w / 2} z={CHAMP_DE_TIR.z0} w={CHAMP_DE_TIR.w} d={CHAMP_DE_TIR.z1 - CHAMP_DE_TIR.z0} h={0.07} material={road} />
      <Dashes from={CHAMP_DE_TIR.z0 + 8} to={CHAMP_DE_TIR.z1} x={CHAMP_DE_TIR.x} along="z" />
      <Slab x={CHAMP_DE_TIR.x + CHAMP_DE_TIR.w / 2} z={-21} w={2} d={81} h={0.16} color={C.walk} />
      <Slab x={HAUTE_RIVE.x - HAUTE_RIVE.w / 2} z={HAUTE_RIVE.z0} w={HAUTE_RIVE.w} d={HAUTE_RIVE.z1 - HAUTE_RIVE.z0} h={0.07} material={road} />
      <Slab x={HAUTE_RIVE.x + HAUTE_RIVE.w / 2} z={-21} w={1.8} d={44} h={0.16} color={C.walk} />
      {/* Cartouches de routes (comme sur la carte) */}
      <RoadTag x={-120} z={-33.5} text="D425" />
      <RoadTag x={60} z={-33.5} text="D425" />
      <RoadTag x={ROCADE.x + 11} z={40} text="D621" rot />
      <Sign position={[ROCADE.x + 11, 0.12, 52]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} size={[22, 2.4]} lines={[{ text: 'ROCADE MINIÈRE', size: 150, color: '#ffffff' }]} bg="#9db487" />
    </group>
  );
}

function RoadTag({ x, z, text, rot }: { x: number; z: number; text: string; rot?: boolean }) {
  return <Sign position={[x, 0.14, z]} rotation={[-Math.PI / 2, 0, rot ? Math.PI / 2 : 0]} size={[6, 2]} lines={[{ text, size: 180, color: '#2a2200' }]} bg="#f7d21c" />;
}

// ---- Parkings -------------------------------------------------------------
export function Parkings({ p }: { p: Pick }) {
  const lines = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number }[] = [];
    for (const s of SLOTS) {
      const a = s.approach[s.approach.length - 2];
      const alongX = Math.abs(a[0] - s.x) > Math.abs(a[1] - s.z);
      if (alongX) {
        out.push({ x: s.x - 2.5, z: s.z - 1.35, w: 5, d: 0.12 });
        out.push({ x: s.x - 2.5, z: s.z + 1.35, w: 5, d: 0.12 });
      } else {
        out.push({ x: s.x - 1.35, z: s.z - 2.5, w: 0.12, d: 5 });
        out.push({ x: s.x + 1.35, z: s.z - 2.5, w: 0.12, d: 5 });
      }
    }
    return out;
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  return (
    <group>
      {ASPHALT.map((r, i) => (
        <Slab key={i} {...r} h={0.08} color={C.asphalt} />
      ))}
      <instancedMesh frustumCulled={false}
        args={[GEO.box, mat(C.line), lines.length]}
        ref={(r) => {
          if (!r) return;
          lines.forEach((l, i) => {
            m.compose(new THREE.Vector3(l.x + l.w / 2, 0.1, l.z + l.d / 2), new THREE.Quaternion(), new THREE.Vector3(l.w, 0.02, l.d));
            r.setMatrixAt(i, m);
          });
          r.instanceMatrix.needsUpdate = true;
        }}
      />
      {/* Zones cliquables : parkings */}
      <HitBox r={{ x: 57.5, z: -13, w: 28, d: 44 }} h={0.6} k="parking1" p={p} />
      <HitBox r={{ x: -119, z: 14.5, w: 31, d: 15 }} h={0.6} k="parking2" p={p} />
      {/* Allée piétonne (croquis : pointillés entre l'annexe et les places) */}
      <Slab x={29.6} z={13} w={1.2} d={9.2} h={0.12} color={C.walk} />
      <Slab x={-104.8} z={12} w={1.6} d={13} h={0.1} color={C.walk} />
    </group>
  );
}

// ---- Végétation, éclairage, voisins ---------------------------------------
export function Nature({ quality, night }: { quality: 'eleve' | 'standard' | 'economique'; night: boolean }) {
  const trees = quality === 'economique' ? TREES.filter((_, i) => i % 2 === 0) : TREES;
  const m = useMemo(() => new THREE.Matrix4(), []);
  const set = (r: THREE.InstancedMesh | null, f: (i: number) => [THREE.Vector3, THREE.Vector3]) => {
    if (!r) return;
    for (let i = 0; i < r.count; i++) {
      const [p, s] = f(i);
      m.compose(p, new THREE.Quaternion(), s);
      r.setMatrixAt(i, m);
    }
    r.instanceMatrix.needsUpdate = true;
  };
  return (
    <group>
      <instancedMesh frustumCulled={false} args={[GEO.cyl6, mat('#6b5136'), trees.length]} castShadow ref={(r) => set(r, (i) => [new THREE.Vector3(trees[i][0], 1.1, trees[i][1]), new THREE.Vector3(0.45, 2.2, 0.45)])} />
      <instancedMesh frustumCulled={false}
        args={[GEO.ico, mat('#5d8a4e'), trees.length]}
        castShadow
        ref={(r) => set(r, (i) => { const k = 1.6 + ((i * 37) % 10) / 10; return [new THREE.Vector3(trees[i][0], 2.6 + k * 0.6, trees[i][1]), new THREE.Vector3(k, k * 1.15, k)]; })}
      />
      {/* Haie le long de la D425 (BAT 1) */}
      <Slab x={16} z={-23.4} w={62} d={1.4} h={1.2} color="#4f7a44" cast />
      <Slab x={-121} z={-22} w={46} d={1.2} h={1} color="#4f7a44" cast />
      {/* Lampadaires */}
      <instancedMesh frustumCulled={false} args={[GEO.cyl6, mat('#3d4246', { metal: 0.4, rough: 0.5 }), LAMPS.length]} ref={(r) => set(r, (i) => [new THREE.Vector3(LAMPS[i][0], 2.6, LAMPS[i][1]), new THREE.Vector3(0.14, 5.2, 0.14)])} />
      <instancedMesh frustumCulled={false}
        args={[GEO.box, mat(night ? '#fff2c2' : '#d8d8d2', { emissive: '#ffd98a', ei: night ? 2.2 : 0 }), LAMPS.length]}
        ref={(r) => set(r, (i) => [new THREE.Vector3(LAMPS[i][0], 5.25, LAMPS[i][1]), new THREE.Vector3(0.7, 0.16, 0.34)])}
      />
    </group>
  );
}

export function Neighbours() {
  return (
    <group>
      {NEIGHBOURS.map((b, i) => (
        <group key={i}>
          <Slab x={b.x} z={b.z} w={b.w} d={b.d} h={b.h} color={i % 2 ? '#d2d0ca' : '#c4c8cc'} cast />
          <Slab x={b.x + 0.3} z={b.z + 0.3} w={b.w - 0.6} d={b.d - 0.6} y={b.h} h={0.12} color="#7d8186" />
          <Slab x={b.x - 3} z={b.z + b.d} w={b.w + 6} d={8} h={0.06} color={C.asphalt} />
        </group>
      ))}
    </group>
  );
}

// ---- Bâtiments -----------------------------------------------------------
type BuildingProps = Pick & {
  interior: boolean;
  busy: Set<number>;
  families: Record<number, WorkshopFamily[]>;
  roomPick: (num: number) => void;
};

/** Fenêtres le long d'une façade. */
function Windows({ x0, x1, z, x, along, y = 1.2, h = 1.6, every = 3.2, glow, side }: { x0: number; x1: number; z?: number; x?: number; along: 'x' | 'z'; y?: number; h?: number; every?: number; glow: (pos: number) => boolean; side: number }) {
  const items: number[] = [];
  for (let p = x0 + every / 2; p < x1 - 0.8; p += every) items.push(p);
  return (
    <>
      {items.map((p) => (
        <mesh
          key={p}
          geometry={GEO.box}
          material={glow(p) ? mat('#ffe9a8', { emissive: '#ffd36b', ei: 0.55, rough: 0.3 }) : mat('#2d3b45', { rough: 0.2, metal: 0.5 })}
          position={along === 'x' ? [p, y + h / 2, z! + side * 0.17] : [x! + side * 0.17, y + h / 2, p]}
          scale={along === 'x' ? [1.9, h, 0.08] : [0.08, h, 1.9]}
        />
      ))}
    </>
  );
}

function RoofFade({ children, interior }: { children: (m: THREE.MeshStandardMaterial) => React.ReactNode; interior: boolean }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4e53', roughness: 0.95, transparent: true }), []);
  useFrame((_, dt) => {
    const target = interior ? 0 : 1;
    material.opacity += (target - material.opacity) * Math.min(1, dt * 4);
    material.visible = material.opacity > 0.02;
    material.depthWrite = material.opacity > 0.9;
  });
  return <>{children(material)}</>;
}

/** Représentation des familles d'équipements (formations possibles dans la salle). */
function Props({ families, r }: { families: WorkshopFamily[]; r: Rect }) {
  return (
    <>
      {families.slice(0, 3).map((f, i) => {
        const x = r.x + r.w - 1.4 - i * 1.6;
        const z = r.z + 1.3;
        if (f === 'irve')
          return (
            <group key={f} position={[x, 0, z]}>
              <mesh geometry={GEO.box} material={mat('#e9ece8')} position={[0, 0.75, 0]} scale={[0.6, 1.5, 0.35]} castShadow />
              <mesh geometry={GEO.box} material={mat(C.electric, { emissive: C.electric, ei: 0.8 })} position={[0, 1.15, 0.18]} scale={[0.4, 0.25, 0.02]} />
            </group>
          );
        if (f === 'aerien')
          return (
            <group key={f} position={[x, 0, z]}>
              <mesh geometry={GEO.cyl} material={mat('#8b6b48')} position={[0, 1.6, 0]} scale={[0.18, 3.2, 0.18]} castShadow />
              <mesh geometry={GEO.box} material={mat('#555')} position={[0, 2.9, 0]} scale={[1.3, 0.1, 0.1]} />
            </group>
          );
        if (f === 'souterrain')
          return (
            <group key={f} position={[x, 0, z]}>
              <mesh geometry={GEO.box} material={mat('#6b5a45')} position={[0, 0.12, 0]} scale={[1.2, 0.12, 0.6]} />
              <mesh geometry={GEO.cyl} material={mat('#9c7b4e')} position={[0, 0.45, 0.6]} rotation={[Math.PI / 2, 0, 0]} scale={[0.8, 0.4, 0.8]} />
            </group>
          );
        if (f === 'fibre')
          return <mesh key={f} geometry={GEO.box} material={mat('#1d1f22', { metal: 0.3 })} position={[x, 0.9, z]} scale={[0.6, 1.8, 0.6]} castShadow />;
        return (
          <group key={f} position={[x, 0, z]}>
            <mesh geometry={GEO.box} material={mat('#b9bec2', { metal: 0.3, rough: 0.5 })} position={[0, 0.9, 0]} scale={[0.9, 1.8, 0.45]} castShadow />
            <mesh geometry={GEO.box} material={mat('#f5c518')} position={[0, 1.5, 0.23]} scale={[0.18, 0.18, 0.02]} />
          </group>
        );
      })}
    </>
  );
}

export function Bat1(props: BuildingProps) {
  const { interior, busy, families, roomPick } = props;
  const b = BAT1;
  const wall = mat('#e6e2d8', { rough: 0.9 });
  const glowAt = (side: 'n' | 's' | 'w' | 'e', pos: number) => {
    const room = BAT1_ROOMS.find((r) => r.number && (side === 'n' || side === 's' ? pos >= r.rect.x && pos <= r.rect.x + r.rect.w : pos >= r.rect.z && pos <= r.rect.z + r.rect.d) && (side === 'n' ? r.rect.z === b.z : side === 's' ? r.rect.z + r.rect.d >= b.z + b.d - 0.2 : side === 'w' ? r.rect.x === b.x : r.rect.x + r.rect.w >= b.x + b.w - 0.2));
    return Boolean(room?.number && busy.has(room.number));
  };
  return (
    <group>
      {/* dalle, soubassement */}
      <Slab x={b.x} z={b.z} w={b.w} d={b.d} h={0.25} color="#cfcac0" />
      {/* murs extérieurs (porte d'entrée laissée libre au sud) */}
      <Slab x={b.x} z={b.z} w={b.w} d={0.3} h={b.h} material={wall} cast />
      <Slab x={b.x} z={b.z + b.d - 0.3} w={14.1 - 1.6} d={0.3} h={b.h} material={wall} cast />
      <Slab x={b.x + 14.1 + 1.6} z={b.z + b.d - 0.3} w={b.w - 14.1 - 1.6} d={0.3} h={b.h} material={wall} cast />
      <Slab x={b.x + 12.5} z={b.z + b.d - 0.3} w={3.2} d={0.3} y={2.6} h={b.h - 2.6} material={wall} />
      <Slab x={b.x} z={b.z} w={0.3} d={b.d} h={b.h} material={wall} cast />
      <Slab x={b.x + b.w - 0.3} z={b.z} w={0.3} d={b.d} h={b.h} material={wall} cast />
      <Slab x={b.x - 0.05} z={b.z - 0.05} w={b.w + 0.1} d={b.d + 0.1} h={0.55} color="#4b524c" />
      <Windows x0={b.x} x1={b.x + b.w} z={b.z} along="x" side={-1} glow={(p) => glowAt('n', p)} />
      <Windows x0={b.x} x1={b.x + 12} z={b.z + b.d} along="x" side={1} glow={(p) => glowAt('s', p)} />
      <Windows x0={b.x + 17} x1={b.x + b.w} z={b.z + b.d} along="x" side={1} glow={(p) => glowAt('s', p)} />
      <Windows x0={b.z} x1={b.z + b.d} x={b.x} along="z" side={-1} glow={(p) => glowAt('w', p)} />
      <Windows x0={b.z} x1={b.z + b.d} x={b.x + b.w} along="z" side={1} glow={(p) => glowAt('e', p)} />
      {/* entrée : porte vitrée, auvent et enseigne */}
      <Slab x={b.x + 12.5} z={b.z + b.d - 0.2} w={3.2} d={0.1} h={2.6} color="#3b4b55" />
      <Slab x={b.x + 11.8} z={b.z + b.d} w={4.6} d={1.8} y={2.75} h={0.18} color={C.dark} cast />
      <Sign position={[b.x + 14.1, 3.45, b.z + b.d + 0.17]} size={[6, 0.9]} lines={[{ text: 'CF RÉSEAUX', size: 120, color: C.cream, weight: 800 }]} bg={C.dark} accent={C.electric} />
      {/* cloisons intérieures (croquis) */}
      {BAT1_ROOMS.map((r) => (
        <group key={r.key}>
          <Slab x={r.rect.x} z={r.rect.z} w={r.rect.w} d={0.15} h={2.8} color="#efece4" />
          <Slab x={r.rect.x} z={r.rect.z} w={0.15} d={r.rect.d} h={2.8} color="#efece4" />
        </group>
      ))}
      {/* sols des salles : cliquables, éclairés quand la salle est occupée */}
      {interior &&
        BAT1_ROOMS.map((r) => (
          <group key={`f${r.key}`}>
            <mesh
              geometry={GEO.box}
              position={[r.rect.x + r.rect.w / 2, 0.27, r.rect.z + r.rect.d / 2]}
              scale={[r.rect.w - 0.3, 0.02, r.rect.d - 0.3]}
              material={r.number && busy.has(r.number) ? mat('#d8f7e2', { emissive: C.electric, ei: 0.18 }) : mat(r.number ? '#e9e5dc' : '#dcd8cf')}
              onClick={(e) => {
                if (!r.number) return;
                e.stopPropagation();
                roomPick(r.number);
              }}
            />
            {r.number && <Props families={families[r.number] || []} r={r.rect} />}
            {r.key === 'CUIS' && <Slab x={r.rect.x + 1} z={r.rect.z + 0.5} w={6} d={0.7} h={0.95} color="#b8bcbf" />}
          </group>
        ))}
      {/* toit plat foncé, acrotère, équipements techniques */}
      <RoofFade interior={interior}>
        {(m) => (
          <group>
            <Slab x={b.x} z={b.z} w={b.w} d={b.d} y={b.h} h={0.22} material={m} cast={!interior} />
            {!interior && (
              <>
                <Slab x={b.x} z={b.z} w={b.w} d={0.4} y={b.h} h={0.55} color="#d6d1c6" />
                <Slab x={b.x} z={b.z + b.d - 0.4} w={b.w} d={0.4} y={b.h} h={0.55} color="#d6d1c6" />
                <Slab x={b.x} z={b.z} w={0.4} d={b.d} y={b.h} h={0.55} color="#d6d1c6" />
                <Slab x={b.x + b.w - 0.4} z={b.z} w={0.4} d={b.d} y={b.h} h={0.55} color="#d6d1c6" />
                <Slab x={b.x + 6} z={b.z + 4} w={3} d={2.2} y={b.h} h={1.1} color="#9aa0a4" cast />
                <Slab x={b.x + 24} z={b.z + 5} w={2.4} d={2.4} y={b.h} h={0.9} color="#9aa0a4" cast />
                {[[10, 14], [20, 10], [28, 17]].map(([dx, dz]) => (
                  <Slab key={dx} x={b.x + dx} z={b.z + dz} w={1.6} d={1.6} y={b.h} h={0.4} color="#dfe7ea" />
                ))}
              </>
            )}
          </group>
        )}
      </RoofFade>
      {!interior && <HitBox r={b} h={b.h + 0.6} k="bat1" p={props} />}
      {/* Annexe (bloc du croquis non nommé) */}
      <Slab x={BAT1_ANNEX.x} z={BAT1_ANNEX.z} w={BAT1_ANNEX.w} d={BAT1_ANNEX.d} h={BAT1_ANNEX.h} color="#cdd1cf" cast />
      <Slab x={BAT1_ANNEX.x} z={BAT1_ANNEX.z} w={BAT1_ANNEX.w} d={BAT1_ANNEX.d} y={BAT1_ANNEX.h} h={0.15} color="#6a7075" />
      {/* Totem à l'entrée du site */}
      <Totem x={16.8} z={-12} label="BAT 1" />
    </group>
  );
}

export function Bungalow(p: Pick) {
  const b = BUNGALOW;
  return (
    <group>
      <Slab x={b.x} z={b.z} w={b.w} d={b.d} y={0.3} h={b.h} color="#eceee9" cast />
      <Slab x={b.x - 0.1} z={b.z - 0.1} w={b.w + 0.2} d={b.d + 0.2} y={b.h + 0.3} h={0.25} color="#8f969b" cast />
      <Slab x={b.x} z={b.z} w={b.w} d={b.d} h={0.3} color="#7b8186" />
      {Array.from({ length: 8 }, (_, i) => (
        <Slab key={i} x={b.x + 0.2 + i * (b.w / 8)} z={b.z - 0.08} w={0.14} d={0.1} y={0.3} h={b.h} color="#b7bcc0" />
      ))}
      {[3, 7.5, 16, 20.5].map((dx) => (
        <Slab key={dx} x={b.x + dx} z={b.z - 0.12} w={2.2} d={0.1} y={1.3} h={1.3} color="#2d3b45" />
      ))}
      <Slab x={b.x + 11.6} z={b.z - 0.12} w={1.4} d={0.1} y={0.3} h={2.3} color={C.dark} />
      <Slab x={b.x + 11} z={b.z - 1.5} w={2.6} d={1.4} h={0.3} color="#9a9f9c" />
      <Sign position={[b.x + b.w / 2, b.h + 1.15, b.z - 0.05]} size={[14, 1.4]} lines={[{ text: 'ADMINISTRATION CF RÉSEAUX', size: 92, color: C.cream, weight: 800 }]} bg={C.dark} accent={C.electric} />
      <Slab x={b.x + b.w / 2 - 6.5} z={b.z - 0.1} w={0.2} d={0.2} y={b.h} h={0.6} color={C.dark} />
      <Slab x={b.x + b.w / 2 + 6.3} z={b.z - 0.1} w={0.2} d={0.2} y={b.h} h={0.6} color={C.dark} />
      <HitBox r={b} h={b.h + 1.8} k="admin" p={p} />
      {/* terrasse commune */}
      <Slab x={b.x + 3} z={b.z + b.d + 0.5} w={14} d={3.2} h={0.15} color="#b99b74" />
    </group>
  );
}

export function Bat2(props: BuildingProps) {
  const { interior, busy, families } = props;
  const b = BAT2;
  const clad = mat('#c9d0d6', { rough: 0.6, metal: 0.25 });
  const glowZone = (pos: number) => BAT2_ZONES.some((z) => pos >= z.rect.z && pos <= z.rect.z + z.rect.d && busy.has(z.number));
  return (
    <group>
      <Slab x={b.x} z={b.z} w={b.w} d={b.d} h={0.25} color="#c7c3ba" />
      <Slab x={b.x} z={b.z} w={b.w} d={0.3} h={b.h} material={clad} cast />
      <Slab x={b.x} z={b.z + b.d - 0.3} w={b.w / 2 - 1.6} d={0.3} h={b.h} material={clad} cast />
      <Slab x={b.x + b.w / 2 + 1.6} z={b.z + b.d - 0.3} w={b.w / 2 - 1.6} d={0.3} h={b.h} material={clad} cast />
      <Slab x={b.x + b.w / 2 - 1.6} z={b.z + b.d - 0.3} w={3.2} d={0.3} y={2.7} h={b.h - 2.7} material={clad} />
      <Slab x={b.x} z={b.z} w={0.3} d={b.d} h={b.h} material={clad} cast />
      <Slab x={b.x + b.w - 0.3} z={b.z} w={0.3} d={b.d} h={b.h} material={clad} cast />
      {/* nervures horizontales du bardage */}
      {[1.4, 2.8, 4.2].map((y) => (
        <group key={y}>
          <Slab x={b.x - 0.06} z={b.z - 0.06} w={b.w + 0.12} d={0.1} y={y} h={0.07} color="#aab2b9" />
          <Slab x={b.x - 0.06} z={b.z - 0.06} w={0.1} d={b.d + 0.12} y={y} h={0.07} color="#aab2b9" />
          <Slab x={b.x + b.w - 0.04} z={b.z - 0.06} w={0.1} d={b.d + 0.12} y={y} h={0.07} color="#aab2b9" />
        </group>
      ))}
      <Windows x0={b.z} x1={b.z + b.d} x={b.x + b.w} along="z" side={1} y={1.5} h={1.3} every={4} glow={glowZone} />
      <Windows x0={b.z} x1={b.z + b.d} x={b.x} along="z" side={-1} y={1.5} h={1.3} every={4} glow={glowZone} />
      {/* porte sectionnelle (côté est) et entrée vitrée au sud */}
      <Slab x={b.x + b.w - 0.1} z={b.z + 3} w={0.12} d={4.2} h={3.6} color="#8c949b" />
      <Slab x={b.x + b.w / 2 - 1.6} z={b.z + b.d - 0.2} w={3.2} d={0.1} h={2.7} color="#3b4b55" />
      <Slab x={b.x + b.w / 2 - 2.4} z={b.z + b.d} w={4.8} d={1.6} y={2.85} h={0.16} color={C.dark} cast />
      <Sign position={[b.x + b.w / 2, 3.7, b.z + b.d + 0.17]} size={[7, 1]} lines={[{ text: 'CF RÉSEAUX · BAT 2', size: 104, color: C.cream, weight: 800 }]} bg={C.dark} accent={C.electric} />
      {interior &&
        BAT2_ZONES.map((z) => (
          <group key={z.number}>
            <mesh
              geometry={GEO.box}
              position={[z.rect.x + z.rect.w / 2, 0.27, z.rect.z + z.rect.d / 2]}
              scale={[z.rect.w - 0.4, 0.02, z.rect.d - 0.4]}
              material={busy.has(z.number) ? mat('#d8f7e2', { emissive: C.electric, ei: 0.18 }) : mat('#e3dfd6')}
              onClick={(e) => {
                e.stopPropagation();
                props.roomPick(z.number);
              }}
            />
            <Props families={families[z.number] || []} r={z.rect} />
          </group>
        ))}
      {/* toit en deux pans, 12 puits de lumière */}
      <RoofFade interior={interior}>
        {(m) => (
          <group>
            <mesh geometry={GEO.box} material={m} position={[b.x + b.w / 4, b.h + 0.55, b.z + b.d / 2]} rotation={[0, 0, -0.09]} scale={[b.w / 2 + 0.3, 0.24, b.d + 0.4]} castShadow={!interior} />
            <mesh geometry={GEO.box} material={m} position={[b.x + (3 * b.w) / 4, b.h + 0.55, b.z + b.d / 2]} rotation={[0, 0, 0.09]} scale={[b.w / 2 + 0.3, 0.24, b.d + 0.4]} castShadow={!interior} />
            {!interior && (
              <>
                <Slab x={b.x + b.w / 2 - 0.2} z={b.z - 0.2} w={0.4} d={b.d + 0.4} y={b.h + 0.9} h={0.18} color="#2f3337" />
                {Array.from({ length: 12 }, (_, i) => {
                  const half = i < 6 ? 0 : 1;
                  const k = i % 6;
                  const x = b.x + 2.6 + half * (b.w / 2) + (k % 2) * 4.8;
                  const z = b.z + 5 + Math.floor(k / 2) * 10;
                  return <Slab key={i} x={x} z={z} w={2.4} d={1.6} y={b.h + 0.55 + (half ? 0.2 : 0.2) + (k % 2 ? (half ? 0.22 : -0.22) : 0)} h={0.25} color="#eef3ef" />;
                })}
              </>
            )}
          </group>
        )}
      </RoofFade>
      {!interior && <HitBox r={b} h={b.h + 1.2} k="bat2" p={props} />}
      <Totem x={-76.3} z={-17} label="BAT 2" />
    </group>
  );
}

function Totem({ x, z, label }: { x: number; z: number; label: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.box} material={mat(C.dark)} position={[0, 1.4, 0]} scale={[0.5, 2.8, 1.4]} castShadow />
      <mesh geometry={GEO.box} material={mat(C.electric, { emissive: C.electric, ei: 0.6 })} position={[0.26, 2.5, 0]} scale={[0.02, 0.12, 1.2]} />
      <Sign position={[0.27, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} size={[1.3, 1.6]} lines={[{ text: 'CF', size: 300, color: C.cream, weight: 800 }, { text: 'RÉSEAUX', size: 170, color: C.cream, weight: 800 }, { text: label, size: 150, color: C.electric, weight: 700 }]} bg={C.dark} />
    </group>
  );
}

// ---- Beach Club ----------------------------------------------------------
export function Beach(p: Pick) {
  const palms: [number, number][] = [[BEACH.x - 19, BEACH.z - 6], [BEACH.x + 19, BEACH.z - 8], [BEACH.x - 8, BEACH.z - 15], [BEACH.x + 10, BEACH.z - 14]];
  return (
    <group>
      <mesh geometry={GEO.cyl} material={mat('#ecd9a6', { rough: 1 })} position={[BEACH.x, -0.15, BEACH.z]} scale={[BEACH.r * 2, 0.5, BEACH.r * 1.5]} receiveShadow />
      <mesh position={[BEACH.x, -0.1, BEACH.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BEACH.r * 0.98, BEACH.r * 1.05, 48]} />
        <meshBasicMaterial color="#f4fbff" transparent opacity={0.55} />
      </mesh>
      {LOUNGERS.map(([x, z], i) => (
        <group key={i} position={[x, 0.1, z]}>
          <mesh geometry={GEO.box} material={mat('#fffdf3')} position={[0, 0.35, 0.3]} scale={[0.9, 0.12, 1.9]} castShadow />
          <mesh geometry={GEO.box} material={mat('#fffdf3')} position={[0, 0.7, -0.75]} rotation={[0.9, 0, 0]} scale={[0.9, 0.1, 0.9]} />
          {[-0.35, 0.35].map((dx) => (
            <mesh key={dx} geometry={GEO.box} material={mat('#9c7b4e')} position={[dx, 0.15, 0.3]} scale={[0.08, 0.3, 1.8]} />
          ))}
          {i % 2 === 0 && (
            <group position={[1.6, 0, -0.4]}>
              <mesh geometry={GEO.cyl} material={mat('#e8e4da')} position={[0, 1.4, 0]} scale={[0.08, 2.8, 0.08]} />
              <mesh geometry={GEO.cone} material={mat(i % 4 === 0 ? '#08fa64' : '#fffdf3')} position={[0, 2.9, 0]} scale={[1.9, 0.7, 1.9]} castShadow />
              <mesh geometry={GEO.cyl} material={mat('#17241b')} position={[0, 2.56, 0]} scale={[3.8, 0.04, 3.8]} />
            </group>
          )}
        </group>
      ))}
      {palms.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {Array.from({ length: 5 }, (_, k) => (
            <mesh key={k} geometry={GEO.cyl6} material={mat('#8b6b48')} position={[k * 0.18, 0.7 + k * 1.3, 0]} scale={[0.5 - k * 0.05, 1.4, 0.5 - k * 0.05]} castShadow />
          ))}
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} geometry={GEO.box} material={mat('#3f8a3a')} position={[0.9 + Math.cos((k / 6) * Math.PI * 2) * 1.4, 6.6, Math.sin((k / 6) * Math.PI * 2) * 1.4]} rotation={[0, -(k / 6) * Math.PI * 2, -0.35]} scale={[3, 0.12, 0.8]} castShadow />
          ))}
        </group>
      ))}
      <group position={[BEACH.x, 0, BEACH.z - 17]}>
        <mesh geometry={GEO.box} material={mat('#8b6b48')} position={[-3.6, 1.6, 0]} scale={[0.25, 3.2, 0.25]} />
        <mesh geometry={GEO.box} material={mat('#8b6b48')} position={[3.6, 1.6, 0]} scale={[0.25, 3.2, 0.25]} />
        <Sign position={[0, 2.9, 0.15]} size={[8, 1.6]} lines={[{ text: 'CF RÉSEAUX', size: 120, color: C.cream, weight: 800 }, { text: 'BEACH CLUB', size: 130, color: C.electric, weight: 800 }]} bg={C.dark} />
      </group>
      <HitBox r={{ x: BEACH.x - BEACH.r, z: BEACH.z - BEACH.r * 0.75, w: BEACH.r * 2, d: BEACH.r * 1.5 }} h={1.2} k="beach" p={p} outline={false} />
    </group>
  );
}
