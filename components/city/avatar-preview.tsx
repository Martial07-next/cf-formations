'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { AvatarLook } from '@/lib/city/types';
import { Figure } from './scene-kit';

function Spin({ look }: { look: AvatarLook }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => g.current && (g.current.rotation.y += dt * 0.8));
  return (
    <group ref={g} position={[0, -1, 0]}>
      <Figure look={look} />
    </group>
  );
}

/** Aperçu 3D du personnage, en rotation lente. */
export default function AvatarPreview({ look }: { look: AvatarLook }) {
  return (
    <div className="city-avatar-preview">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 4.2], fov: 30 }}>
        <color attach="background" args={['#17241b']} />
        <hemisphereLight args={['#ffffff', '#3b5a45', 1.1]} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} />
        <Spin look={look} />
      </Canvas>
    </div>
  );
}
