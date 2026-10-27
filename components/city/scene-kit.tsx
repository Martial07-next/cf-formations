'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AvatarLook } from '@/lib/city/types';

/**
 * Briques communes de la scène : géométries partagées, matériaux mis en cache
 * (libérés à la fermeture de la ville), panneaux texte et personnages stylisés.
 */

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 10),
  capsule: new THREE.CapsuleGeometry(0.26, 0.62, 4, 10),
  halfSphere: new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
};

const materials = new Map<string, THREE.Material>();
/** Matériau standard partagé (couleur + options). */
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; ei?: number; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.ei ?? 0}|${opts.opacity ?? 1}`;
  let m = materials.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
      emissive: new THREE.Color(opts.emissive || '#000000'),
      emissiveIntensity: opts.ei ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    materials.set(key, m);
  }
  return m;
}

/** Libère géométries et matériaux partagés (fermeture de la ville). */
export function disposeKit() {
  materials.forEach((m) => m.dispose());
  materials.clear();
}

/** Pavé posé au sol à partir d'un rectangle (x, z, largeur, profondeur). */
export function Slab({ x, z, w, d, h = 0.05, y = 0, color, cast = false, receive = true, material }: { x: number; z: number; w: number; d: number; h?: number; y?: number; color?: string; cast?: boolean; receive?: boolean; material?: THREE.Material }) {
  return (
    <mesh geometry={GEO.box} material={material || mat(color || '#888')} position={[x + w / 2, y + h / 2, z + d / 2]} scale={[w, h, d]} castShadow={cast} receiveShadow={receive} />
  );
}

/** Texture de panneau (texte sur fond), dessinée localement : aucune police externe chargée. */
export function useSignTexture(lines: { text: string; size: number; color: string; weight?: number }[], bg: string, w = 1024, h = 256, accent?: string) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (accent) {
      g.fillStyle = accent;
      g.fillRect(0, h - h * 0.07, w, h * 0.07);
    }
    const total = lines.reduce((n, l) => n + l.size * 1.15, 0);
    let y = (h - total) / 2;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const l of lines) {
      g.font = `${l.weight || 700} ${l.size}px "Archivo", "Space Grotesk", Inter, Arial, sans-serif`;
      g.fillStyle = l.color;
      g.fillText(l.text, w / 2, y, w * 0.92);
      y += l.size * 1.15;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines), bg, w, h, accent]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

/** Panneau plat texturé. */
export function Sign({ position, rotation = [0, 0, 0], size, lines, bg, accent }: { position: [number, number, number]; rotation?: [number, number, number]; size: [number, number]; lines: { text: string; size: number; color: string; weight?: number }[]; bg: string; accent?: string }) {
  const ratio = size[0] / size[1];
  const tex = useSignTexture(lines, bg, 1024, Math.round(1024 / ratio), accent);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: tex || undefined, roughness: 0.6 }), [tex]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <planeGeometry args={size} />
    </mesh>
  );
}

/**
 * Personnage stylisé (pion) d'un formateur : silhouette, couleurs et accessoire
 * choisis par le formateur. Aucun trait réaliste.
 */
export function Figure({ look, vacation = false, lying = false, ghost = false }: { look: AvatarLook; vacation?: boolean; lying?: boolean; ghost?: boolean }) {
  const o = ghost ? 0.45 : 1;
  const top = vacation ? look.vacation : look.top;
  return (
    <group rotation={lying ? [-1.25, 0, 0] : [0, 0, 0]} position={lying ? [0, 0.62, 0.25] : [0, 0, 0]}>
      {/* jambes */}
      <mesh geometry={GEO.box} material={mat(vacation ? '#e8d9b5' : look.bottom, { opacity: o })} position={[-0.13, 0.36, 0]} scale={[0.2, 0.72, 0.24]} castShadow />
      <mesh geometry={GEO.box} material={mat(vacation ? '#e8d9b5' : look.bottom, { opacity: o })} position={[0.13, 0.36, 0]} scale={[0.2, 0.72, 0.24]} castShadow />
      {/* buste */}
      <mesh geometry={GEO.capsule} material={mat(top, { opacity: o })} position={[0, 1.08, 0]} scale={[1.05, 0.8, 0.85]} castShadow />
      {look.accessory === 'gilet' && !vacation && (
        <mesh geometry={GEO.capsule} material={mat('#ff8a00', { emissive: '#ff8a00', ei: 0.15, opacity: o })} position={[0, 1.08, 0]} scale={[1.12, 0.66, 0.92]} />
      )}
      {/* bras */}
      <mesh geometry={GEO.box} material={mat(top, { opacity: o })} position={[-0.36, 1.02, 0]} scale={[0.13, 0.55, 0.16]} rotation={[0, 0, 0.12]} />
      <mesh geometry={GEO.box} material={mat(top, { opacity: o })} position={[0.36, 1.02, 0]} scale={[0.13, 0.55, 0.16]} rotation={[0, 0, -0.12]} />
      {/* tête */}
      <mesh geometry={GEO.sphere} material={mat(look.skin, { rough: 0.7, opacity: o })} position={[0, 1.66, 0]} scale={0.44} castShadow />
      <Hair look={look} o={o} hidden={vacation} />
      {vacation ? (
        <>
          {/* chapeau de paille et lunettes de soleil */}
          <mesh geometry={GEO.cyl} material={mat('#e6c77a')} position={[0, 1.86, 0]} scale={[0.72, 0.03, 0.72]} />
          <mesh geometry={GEO.cyl} material={mat('#e6c77a')} position={[0, 1.95, 0]} scale={[0.36, 0.18, 0.36]} />
          <mesh geometry={GEO.box} material={mat('#111')} position={[0, 1.7, 0.2]} scale={[0.36, 0.07, 0.04]} />
        </>
      ) : (
        <Accessory look={look} o={o} />
      )}
    </group>
  );
}

function Hair({ look, o, hidden }: { look: AvatarLook; o: number; hidden: boolean }) {
  if (hidden || look.hair === 'rase' || look.accessory === 'casque' || look.accessory === 'casquette') return null;
  const m = mat(look.hairColor, { opacity: o });
  if (look.hair === 'long')
    return (
      <>
        <mesh geometry={GEO.halfSphere} material={m} position={[0, 1.7, 0]} scale={0.48} />
        <mesh geometry={GEO.box} material={m} position={[0, 1.5, -0.14]} scale={[0.42, 0.42, 0.16]} />
      </>
    );
  if (look.hair === 'chignon')
    return (
      <>
        <mesh geometry={GEO.halfSphere} material={m} position={[0, 1.7, 0]} scale={0.47} />
        <mesh geometry={GEO.sphere} material={m} position={[0, 1.86, -0.17]} scale={0.2} />
      </>
    );
  if (look.hair === 'boucle')
    return <mesh geometry={GEO.ico} material={m} position={[0, 1.78, -0.02]} scale={[0.26, 0.17, 0.26]} />;
  return <mesh geometry={GEO.halfSphere} material={m} position={[0, 1.72, 0]} scale={0.46} />;
}

function Accessory({ look, o }: { look: AvatarLook; o: number }) {
  if (look.accessory === 'casque')
    return (
      <>
        <mesh geometry={GEO.halfSphere} material={mat('#f4f1e6', { rough: 0.4, opacity: o })} position={[0, 1.74, 0]} scale={0.52} />
        <mesh geometry={GEO.cyl} material={mat('#f4f1e6', { rough: 0.4, opacity: o })} position={[0, 1.75, 0.04]} scale={[0.62, 0.02, 0.62]} />
      </>
    );
  if (look.accessory === 'casquette')
    return (
      <>
        <mesh geometry={GEO.halfSphere} material={mat(look.top, { opacity: o })} position={[0, 1.74, 0]} scale={0.47} />
        <mesh geometry={GEO.box} material={mat(look.top, { opacity: o })} position={[0, 1.76, 0.25]} scale={[0.34, 0.03, 0.22]} />
      </>
    );
  if (look.accessory === 'lunettes') return <mesh geometry={GEO.box} material={mat('#1b1b1b', { opacity: o })} position={[0, 1.7, 0.21]} scale={[0.36, 0.06, 0.03]} />;
  return null;
}
