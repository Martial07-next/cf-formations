'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BAT1, BAT2, BUNGALOW, ISO_DIR, VIEWS, type ViewKey } from '@/lib/city/layout';
import { beachSpots, carAt, walkerAt, type Plan, type WalkerAgent } from '@/lib/city/sim';
import type { BuildingId, CitySettings, CityState, CityTrainer, WorkshopFamily } from '@/lib/city/types';
import { Bat1, Bat2, Beach, Bungalow, Ground, Nature, Neighbours, Parkings, Roads } from './scene-world';
import { Figure, GEO, disposeKit, mat } from './scene-kit';

export type Badge = { title: string; line: string; active: boolean };
export type RoomChip = { building: BuildingId; x: number; z: number; title: string; line: string; busy: boolean; selected: boolean };

export type SceneProps = {
  state: CityState;
  plan: Plan;
  /** Heure de la scène, en minutes depuis minuit (temps réel, exploration ou simulation). */
  getT: () => number;
  /** Heure arrondie (lumière, fenêtres) : mise à jour au rythme de l'interface. */
  minute: number;
  selected: string | null;
  hovered: string | null;
  onHover: (k: string | null) => void;
  onSelect: (k: string | null) => void;
  onRoom: (b: BuildingId, num: number) => void;
  view: { key: ViewKey; n: number };
  settings: CitySettings;
  busy: Record<BuildingId, Set<number>>;
  families: Record<BuildingId, Record<number, WorkshopFamily[]>>;
  badges: Record<string, Badge>;
  chips: RoomChip[];
  onReady?: () => void;
};

const Q = { eleve: { dpr: [1, 2] as [number, number], shadow: 2048 }, standard: { dpr: [1, 1.5] as [number, number], shadow: 1024 }, economique: { dpr: [1, 1] as [number, number], shadow: 0 } };

export default function CityScene(props: SceneProps) {
  const { settings } = props;
  const q = Q[settings.quality];
  useEffect(() => () => disposeKit(), []);
  return (
    <Canvas
      dpr={q.dpr}
      shadows={q.shadow > 0}
      gl={{ antialias: settings.quality !== 'economique', powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 1, far: 2000, position: [420, 620, 640] }}
      onCreated={() => props.onReady?.()}
      onPointerMissed={() => props.onSelect(null)}
    >
      <World {...props} />
    </Canvas>
  );
}

function World(p: SceneProps) {
  const pick = { hovered: p.hovered, selected: p.selected, onHover: p.onHover, onSelect: (k: string) => p.onSelect(k) };
  const interior1 = p.selected === 'bat1';
  const interior2 = p.selected === 'bat2';
  const h = p.minute / 60;
  const night = h < 7 || h > 19.5;
  const decorative = !p.settings.reducedMotion && p.settings.quality !== 'economique';
  return (
    <>
      <Sky minute={p.minute} shadow={Q[p.settings.quality].shadow} />
      <Rig view={p.view} reduced={p.settings.reducedMotion} />
      <Ground waves={decorative} />
      <Roads />
      <Parkings p={pick} />
      <Nature quality={p.settings.quality} night={night} />
      <Neighbours />
      <Bat1 {...pick} interior={interior1} busy={p.busy.bat1} families={p.families.bat1} roomPick={(n) => p.onRoom('bat1', n)} />
      <Bungalow {...pick} />
      <Bat2 {...pick} interior={interior2} busy={p.busy.bat2} families={p.families.bat2} roomPick={(n) => p.onRoom('bat2', n)} />
      <Beach {...pick} />
      <Cars plan={p.plan} getT={p.getT} />
      <Walkers plan={p.plan} getT={p.getT} interior={{ bat1: interior1, bat2: interior2 }} reduced={p.settings.reducedMotion} />
      <TrainerActors plan={p.plan} state={p.state} getT={p.getT} interior={{ bat1: interior1, bat2: interior2 }} />
      <Resting trainers={p.state.trainers} />
      {decorative && <Traffic />}
      <Badges badges={p.badges} hovered={p.hovered} selected={p.selected} />
      {p.chips.map((c, i) => (
        <Html key={i} position={[c.x, 5.6, c.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`city-chip${c.busy ? ' busy' : ''}${c.selected ? ' sel' : ''}`}>
            <strong>{c.title}</strong>
            <span>{c.line}</span>
          </div>
        </Html>
      ))}
    </>
  );
}

// ---- Lumière et ciel selon l'heure ---------------------------------------
function Sky({ minute, shadow }: { minute: number; shadow: number }) {
  const h = minute / 60;
  const day = Math.max(0, Math.sin((Math.PI * (h - 6.5)) / 13.5));
  const warm = 1 - Math.min(1, Math.abs(h - 13) / 6);
  const bg = new THREE.Color('#1a2a3a').lerp(new THREE.Color(warm > 0.5 ? '#cfe6ef' : '#f1d9bd'), Math.min(1, day * 1.6));
  const sunColor = new THREE.Color('#ffb070').lerp(new THREE.Color('#fff6e6'), warm);
  const az = ((h - 6) / 14) * Math.PI;
  const sun: [number, number, number] = [Math.cos(az) * -160, 40 + day * 180, 80 + Math.sin(az) * -40];
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(-30, 0, 10);
    l.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 320, 900]} />
      <hemisphereLight args={['#eaf4ff', '#5d6b4a', 0.35 + day * 0.5]} />
      <ambientLight intensity={0.12 + (1 - day) * 0.18} color={day > 0.1 ? '#ffffff' : '#8aa0c8'} />
      <directionalLight
        ref={light}
        position={sun}
        intensity={0.25 + day * 1.9}
        color={sunColor}
        castShadow={shadow > 0}
        shadow-mapSize={[shadow || 512, shadow || 512]}
        shadow-camera-left={-170}
        shadow-camera-right={150}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-camera-near={10}
        shadow-camera-far={700}
        shadow-bias={-0.0004}
      />
    </>
  );
}

// ---- Caméra : vues prédéfinies, transitions douces --------------------------
function Rig({ view, reduced }: { view: { key: ViewKey; n: number }; reduced: boolean }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const anim = useRef<{ fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3; t0: number; dur: number } | null>(null);
  const clock = useThree((s) => s.clock);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const first = useRef(true);
  useEffect(() => {
    const v = VIEWS[view.key];
    const dir = new THREE.Vector3(...ISO_DIR).normalize();
    const tt = new THREE.Vector3(...v.target);
    // Écran en portrait (téléphone) : on recule pour garder le cadrage.
    const tp = tt.clone().add(dir.multiplyScalar(v.dist * Math.min(2.2, Math.max(1, 1.5 / aspect))));
    const ft = controls.current ? controls.current.target.clone() : new THREE.Vector3(-18, 0, 20);
    if (reduced) {
      camera.position.copy(tp);
      controls.current?.target.copy(tt);
      controls.current?.update();
      first.current = false;
      return;
    }
    anim.current = { fp: camera.position.clone(), ft, tp, tt, t0: clock.elapsedTime, dur: first.current ? 3.2 : 1.4 };
    first.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.key, view.n, reduced, camera, clock]);
  useFrame(() => {
    const a = anim.current;
    if (!a || !controls.current) return;
    const u = Math.min(1, (clock.elapsedTime - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - u, 3);
    camera.position.lerpVectors(a.fp, a.tp, e);
    controls.current.target.lerpVectors(a.ft, a.tt, e);
    controls.current.update();
    if (u >= 1) anim.current = null;
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      minDistance={10}
      maxDistance={520}
      maxPolarAngle={1.22}
      screenSpacePanning={false}
      onStart={() => (anim.current = null)}
    />
  );
}

// ---- Véhicules (estimation), instanciés --------------------------------------
const tmpM = new THREE.Matrix4();
const tmpL = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const WHEEL_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, q?: THREE.Quaternion) {
  tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromAxisAngle(UP, yaw), tmpS.set(1, 1, 1));
  tmpL.compose(new THREE.Vector3(ox, oy, oz), q || new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  mesh.setMatrixAt(i, tmpM.multiply(tmpL));
}

function Cars({ plan, getT }: { plan: Plan; getT: () => number }) {
  const n = Math.max(1, plan.cars.length);
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const blink = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!body.current) return;
    plan.cars.forEach((c, i) => body.current!.setColorAt(i, new THREE.Color(c.color)));
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [plan]);
  useFrame(({ clock }) => {
    if (!body.current || !cabin.current || !wheels.current || !blink.current) return;
    const T = getT();
    const on = Math.floor(clock.elapsedTime * 2.6) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const c = plan.cars[i];
      const pose = c ? carAt(c, T) : null;
      if (!pose) {
        body.current.setMatrixAt(i, ZERO);
        cabin.current.setMatrixAt(i, ZERO);
        for (let k = 0; k < 4; k++) wheels.current.setMatrixAt(i * 4 + k, ZERO);
        blink.current.setMatrixAt(i * 2, ZERO);
        blink.current.setMatrixAt(i * 2 + 1, ZERO);
        continue;
      }
      const { x, y, z, yaw } = pose;
      place(body.current, i, x, y, z, yaw, 0, 0.62, 0, 4.2, 0.7, 1.8);
      place(cabin.current, i, x, y, z, yaw, -0.25, 1.22, 0, 2.3, 0.55, 1.6);
      [[1.3, 0.82], [1.3, -0.82], [-1.3, 0.82], [-1.3, -0.82]].forEach(([ox, oz], k) => place(wheels.current!, i * 4 + k, x, y, z, yaw, ox, 0.34, oz, 0.66, 0.24, 0.66, WHEEL_Q));
      const b = pose.blink && on;
      [0.72, -0.72].forEach((oz, k) => (b ? place(blink.current!, i * 2 + k, x, y, z, yaw, -2.12, 0.78, oz, 0.08, 0.16, 0.3) : blink.current!.setMatrixAt(i * 2 + k, ZERO)));
    }
    body.current.instanceMatrix.needsUpdate = true;
    cabin.current.instanceMatrix.needsUpdate = true;
    wheels.current.instanceMatrix.needsUpdate = true;
    blink.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh frustumCulled={false} key={`b${n}`} ref={body} args={[GEO.box, undefined, n]} castShadow>
        <meshStandardMaterial roughness={0.35} metalness={0.35} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} key={`c${n}`} ref={cabin} args={[GEO.box, mat('#26333d', { rough: 0.15, metal: 0.6 }), n]} castShadow />
      <instancedMesh frustumCulled={false} key={`w${n}`} ref={wheels} args={[GEO.cyl, mat('#1c1c1c'), n * 4]} />
      <instancedMesh frustumCulled={false} key={`l${n}`} ref={blink} args={[GEO.box, mat('#ff9a1f', { emissive: '#ff8a00', ei: 2 }), n * 2]} />
    </group>
  );
}

// ---- Stagiaires (silhouettes génériques), instanciés --------------------------
function Walkers({ plan, getT, interior, reduced }: { plan: Plan; getT: () => number; interior: Record<BuildingId, boolean>; reduced: boolean }) {
  const list = useMemo(() => plan.walkers.filter((w) => !w.trainerId), [plan]);
  const n = Math.max(1, list.length);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const trainerPos = useMemo(() => new Map(plan.walkers.filter((w) => w.trainerId).map((w) => [w.sessionId, w.seat])), [plan]);
  useEffect(() => {
    list.forEach((w, i) => {
      bodyRef.current?.setColorAt(i, new THREE.Color(w.color));
      headRef.current?.setColorAt(i, new THREE.Color(w.skin));
    });
    if (bodyRef.current?.instanceColor) bodyRef.current.instanceColor.needsUpdate = true;
    if (headRef.current?.instanceColor) headRef.current.instanceColor.needsUpdate = true;
  }, [list]);
  useFrame(({ clock }) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const T = getT();
    for (let i = 0; i < n; i++) {
      const w = list[i];
      const pose = w ? walkerAt(w, T) : null;
      if (!pose || (pose.inside && !interior[w.site])) {
        body.setMatrixAt(i, ZERO);
        head.setMatrixAt(i, ZERO);
        continue;
      }
      let yaw = pose.yaw;
      if (pose.inside) {
        const t = trainerPos.get(w.sessionId);
        if (t) yaw = Math.atan2(-(t[1] - pose.z), t[0] - pose.x);
      }
      const bob = pose.walking && !reduced ? Math.abs(Math.sin(clock.elapsedTime * 7 + i)) * 0.08 : 0;
      const y = (pose.seated ? 0.05 : 0.25) + bob;
      place(body, i, pose.x, y, pose.z, yaw, 0, 0.62, 0, 1, pose.seated ? 0.75 : 1, 1);
      place(head, i, pose.x, y, pose.z, yaw, 0, pose.seated ? 1.18 : 1.38, 0, 0.4, 0.4, 0.4);
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh frustumCulled={false} key={`p${n}`} ref={bodyRef} args={[GEO.capsule, undefined, n]} castShadow>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} key={`h${n}`} ref={headRef} args={[GEO.sphere, undefined, n]}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

// ---- Formateurs : personnage personnalisé + prénom ---------------------------
function TrainerActors({ plan, state, getT, interior }: { plan: Plan; state: CityState; getT: () => number; interior: Record<BuildingId, boolean> }) {
  const byId = useMemo(() => new Map(state.trainers.map((t) => [t.id, t])), [state.trainers]);
  const agents = useMemo(() => plan.walkers.filter((w) => w.trainerId && byId.has(w.trainerId)), [plan, byId]);
  return (
    <>
      {agents.map((w) => (
        <TrainerActor key={w.id} w={w} t={byId.get(w.trainerId!)!} getT={getT} interior={interior[w.site]} />
      ))}
    </>
  );
}

function TrainerActor({ w, t, getT, interior }: { w: WalkerAgent; t: CityTrainer; getT: () => number; interior: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const tag = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const pose = walkerAt(w, getT());
    const show = Boolean(pose && (!pose.inside || interior));
    g.visible = show;
    if (tag.current) tag.current.style.display = show ? '' : 'none';
    if (!pose || !show) return;
    g.position.set(pose.x, 0.25 + (pose.walking ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.06 : 0), pose.z);
    // En salle : face aux stagiaires (S1, S3 : vers l'est ; S2 : vers l'ouest ; BAT 2 : vers le sud).
    g.rotation.y = pose.inside ? (w.site === 'bat2' ? 0 : w.seat[0] < 30 ? Math.PI / 2 : -Math.PI / 2) : pose.yaw + Math.PI / 2;
  });
  return (
    <group ref={ref} scale={1.12}>
      <Figure look={t.look} />
      <Html position={[0, 2.5, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tag} className="city-name">{t.label}</div>
      </Html>
    </group>
  );
}

/** Formateurs en congé (Beach Club) et non affectés (terrasse, état neutre). */
function Resting({ trainers }: { trainers: CityTrainer[] }) {
  const beach = trainers.filter((t) => t.status === 'conge');
  const idle = trainers.filter((t) => t.status === 'non_affecte');
  const spots = beachSpots(beach.length);
  return (
    <>
      {beach.slice(0, spots.length).map((t, i) => (
        <group key={t.id} position={[spots[i][0], 0.35, spots[i][1] + 0.4]} scale={1.35}>
          <Figure look={t.look} vacation lying />
          <Html position={[0, 2.2, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <div className="city-name beach">{t.label} · En congé</div>
          </Html>
        </group>
      ))}
      {idle.slice(0, 16).map((t, i) => (
        <group key={t.id} position={[BUNGALOW.x + 3.6 + (i % 8) * 1.6, 0.2, BUNGALOW.z + BUNGALOW.d + 1.6 + Math.floor(i / 8) * 1.4]} rotation={[0, Math.PI, 0]}>
          <Figure look={t.look} ghost />
        </group>
      ))}
    </>
  );
}

// ---- Circulation décorative (sans lien avec les données) --------------------
function Traffic() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        lane: i % 4,
        offset: i * 47,
        color: ['#d9d9d4', '#2a2d33', '#8d949c', '#1d3557', '#7a1f1f', '#e6e3da', '#3a5a40', '#5e6472'][i],
      })),
    []
  );
  useEffect(() => {
    cars.forEach((c, i) => ref.current?.setColorAt(i, new THREE.Color(c.color)));
    if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [cars]);
  useFrame(({ clock }) => {
    const r = ref.current;
    if (!r) return;
    cars.forEach((c, i) => {
      // Rocade : voies sud (x -37) et nord (x -29), sous le pont ; D425 à l'ouest du pont.
      const s = (clock.elapsedTime * 11 + c.offset) % (c.lane < 2 ? 250 : 158);
      const x = c.lane === 0 ? -37 : c.lane === 1 ? -29 : c.lane === 2 ? -230 + s : -72 - s;
      const z = c.lane === 0 ? -190 + s : c.lane === 1 ? 60 - s : c.lane === 2 ? -24.5 : -28.5;
      const yaw = c.lane === 0 ? -Math.PI / 2 : c.lane === 1 ? Math.PI / 2 : c.lane === 2 ? 0 : Math.PI;
      place(r, i, x, 0, z, yaw, 0, 0.75, 0, 4.2, 1.1, 1.8);
    });
    r.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh frustumCulled={false} ref={ref} args={[GEO.box, undefined, cars.length]} castShadow>
      <meshStandardMaterial roughness={0.4} metalness={0.3} />
    </instancedMesh>
  );
}

// ---- Étiquettes des bâtiments ------------------------------------------------
const BADGE_POS: Record<string, [number, number, number]> = {
  bat1: [BAT1.x + BAT1.w / 2, BAT1.h + 5, BAT1.z + BAT1.d / 2 - 2],
  bat2: [BAT2.x + BAT2.w / 2, BAT2.h + 6, BAT2.z + BAT2.d / 2 - 4],
  admin: [BUNGALOW.x + BUNGALOW.w / 2, BUNGALOW.h + 4.5, BUNGALOW.z + 2],
  beach: [18, 6, 74],
};
function Badges({ badges, hovered, selected }: { badges: Record<string, Badge>; hovered: string | null; selected: string | null }) {
  return (
    <>
      {Object.entries(badges).map(([k, b]) =>
        BADGE_POS[k] && selected !== k ? (
          <Html key={k} position={BADGE_POS[k]} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`city-badge${b.active ? ' active' : ''}${hovered === k ? ' hover' : ''}`}>
              <i aria-hidden />
              <strong>{b.title}</strong>
              <span>{b.line}</span>
            </div>
          </Html>
        ) : null
      )}
    </>
  );
}
