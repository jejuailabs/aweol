'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

const HALF = 26;

export type VillageSpot = 'school' | 'gallery' | 'shop' | 'map';

/**
 * 마을 건물.
 *
 * 아이들이 이미 아는 곳으로 이어진다 — 학교, 전시실, 상점, 지도.
 * 새 기능을 만드는 게 아니라, **흩어져 있던 입구를 걸어서 갈 수 있는 곳으로** 모은 것이다.
 * 메뉴로 가는 것과 걸어가서 문을 여는 건 아이에게 다른 경험이다.
 */
const BUILDINGS: {
  spot: VillageSpot; label: string; emoji: string;
  x: number; z: number; w: number; d: number; h: number;
  wall: string; roof: string;
}[] = [
  { spot: 'school', label: '학교', emoji: '🏫', x: 0, z: -16, w: 10, d: 6, h: 5, wall: '#F2E2C4', roof: '#C4674F' },
  { spot: 'gallery', label: '전시실', emoji: '🖼️', x: -14, z: -4, w: 7, d: 6, h: 4.2, wall: '#E4D6F0', roof: '#7B4B94' },
  { spot: 'shop', label: '상점', emoji: '🛒', x: 14, z: -4, w: 7, d: 6, h: 4.2, wall: '#FDE7C7', roof: '#E8A33C' },
  { spot: 'map', label: '지도', emoji: '🗺️', x: 0, z: 12, w: 6, d: 5, h: 3.8, wall: '#D6EEDC', roof: '#3BAF9F' },
];

const OBSTACLES: Obstacle[] = [
  ...BUILDINGS.map((b) => ({ x: b.x, z: b.z, halfW: b.w / 2 + 0.2, halfD: b.d / 2 + 0.2 })),
  // 나무들
  { x: -8, z: 6, halfW: 0.45, halfD: 0.45 },
  { x: 9, z: 8, halfW: 0.45, halfD: 0.45 },
  { x: -18, z: 10, halfW: 0.45, halfD: 0.45 },
  { x: 18, z: 12, halfW: 0.45, halfD: 0.45 },
  { x: -20, z: -12, halfW: 0.45, halfD: 0.45 },
  { x: 20, z: -14, halfW: 0.45, halfD: 0.45 },
];

const TREES: [number, number][] = [
  [-8, 6], [9, 8], [-18, 10], [18, 12], [-20, -12], [20, -14],
];

function Building({
  b, onEnter,
}: {
  b: typeof BUILDINGS[number];
  onEnter: (s: VillageSpot) => void;
}) {
  const [hot, setHot] = useState(false);

  return (
    <group position={[b.x, 0, b.z]}>
      {/* 몸통 */}
      <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[b.w, b.h, b.d]} />
        <meshStandardMaterial color={b.wall} roughness={0.85} />
      </mesh>
      {/* 지붕 */}
      <mesh position={[0, b.h + 0.55, 0]} rotation={[0, PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.max(b.w, b.d) * 0.75, 1.5, 4]} />
        <meshStandardMaterial color={b.roof} roughness={0.7} />
      </mesh>
      {/* 창문 */}
      {([-1, 1]).map((s) => (
        <mesh key={s} position={[s * b.w * 0.26, b.h * 0.6, b.d / 2 + 0.02]}>
          <planeGeometry args={[1.2, 1.1]} />
          <meshStandardMaterial color="#9FD4EE" emissive="#9FD4EE" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* 문 — 누르면 들어간다 */}
      <group
        onClick={(e) => { e.stopPropagation(); onEnter(b.spot); }}
        onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
      >
        <mesh position={[0, 1.1, b.d / 2 + 0.04]}>
          <boxGeometry args={[1.6, 2.2, 0.12]} />
          <meshStandardMaterial
            color="#8A5A3B"
            emissive="#E8A33C"
            emissiveIntensity={hot ? 0.4 : 0}
          />
        </mesh>
        <mesh position={[0.5, 1.1, b.d / 2 + 0.12]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#E8C86A" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* 간판 */}
      <Html position={[0, b.h + 1.7, 0]} center pointerEvents="none" zIndexRange={[5, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#5B4A3B', fontWeight: 900, fontSize: '17px',
            padding: '6px 16px', borderRadius: '12px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', border: '3px solid #B08860',
            boxShadow: '0 4px 0 #9C7448', userSelect: 'none',
          }}
        >
          {b.emoji} {b.label}
        </div>
      </Html>

      {hot && (
        <Html position={[0, 2.7, b.d / 2 + 0.3]} center pointerEvents="none" zIndexRange={[6, 0]}>
          <div
            style={{
              background: '#FFF8E7', color: '#6B5B43', fontWeight: 800, fontSize: '15px',
              padding: '5px 12px', borderRadius: '999px', whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif', border: '2px solid #EFE3CB',
            }}
          >
            들어가기
          </div>
        </Html>
      )}
    </group>
  );
}

function VillageGround() {
  return (
    <group>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2 + 10, HALF * 2 + 10]} />
        <meshStandardMaterial color="#8FD98A" roughness={0.95} />
      </mesh>

      {/* 길 — 건물들을 잇는다. 길이 없으면 어디로 가야 할지 모른다. */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.01, -2]}>
        <planeGeometry args={[4, 30]} />
        <meshStandardMaterial color="#D9C9A8" roughness={0.95} />
      </mesh>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.011, -4]}>
        <planeGeometry args={[30, 4]} />
        <meshStandardMaterial color="#D9C9A8" roughness={0.95} />
      </mesh>

      {TREES.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.28, 1.6, 8]} />
            <meshStandardMaterial color="#8A5A3B" />
          </mesh>
          <mesh position={[0, 2.2, 0]} castShadow>
            <sphereGeometry args={[1.2, 12, 12]} />
            <meshStandardMaterial color="#5FA85C" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* 마을 가장자리 — 여기까지라는 표시 */}
      {([0, 1, 2, 3] as const).map((side) => (
        <group key={side} rotation={[0, (side * PI) / 2, 0]} position={[0, 0, -HALF - 1]}>
          {Array.from({ length: 14 }).map((_, i) => (
            <mesh key={i} position={[-HALF + i * ((HALF * 2) / 13), 1.1, 0]} castShadow>
              <coneGeometry args={[0.8, 2.4, 7]} />
              <meshStandardMaterial color="#4E9A57" roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export default function VillageScene({
  schoolId, me, avatarId, avatarCustom, avatarTint, onEnter,
}: {
  schoolId: string;
  me: { uid: string; look: PeerLook } | null;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnter: (spot: VillageSpot) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 6));
  const avatarYaw = useRef(0);

  useEffect(() => {
    resetControls(0, 8, 0.4);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 5, maxDist: 20 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 8, 20], fov: 60, near: 0.1, far: 140 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE8F5' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[12, 18, 10]} intensity={1} color="#FFF4DC" castShadow />

        <VillageGround />
        {BUILDINGS.map((b) => (
          <Building key={b.spot} b={b} onEnter={onEnter} />
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -HALF, xMax: HALF, zMin: -HALF, zMax: HALF }}
          start={[0, 0, 6]}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={OBSTACLES}
        />

        {/*
          마을은 학교를 넘어 만나는 곳이라 방을 학교로 나누지 않는다.
          그래도 경로에 학교를 남겨두면 나중에 '우리 학교 마을' 로 좁힐 수 있다.
        */}
        {me && (
          <Peers
            schoolId={schoolId}
            roomKey="village"
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
          />
        )}

        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.3} />
      </Canvas>
    </div>
  );
}
