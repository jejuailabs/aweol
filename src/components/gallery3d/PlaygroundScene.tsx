'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import Peers, { ItRing } from './Peers';
import type { Peer, PeerLook } from '@/lib/presence';
import { TAG_DIST } from '@/lib/tag-game';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

/** 놀이터 크기 (울타리 안쪽) */
const HALF = 13;

/** 숨거나 돌아갈 것들 — 아무것도 없는 벌판이면 그냥 쫓기만 한다 */
const PROPS: { x: number; z: number; kind: 'tree' | 'rock' | 'hay' }[] = [
  { x: -7, z: -5, kind: 'tree' },
  { x: 6, z: -7, kind: 'tree' },
  { x: 8, z: 5, kind: 'tree' },
  { x: -6, z: 7, kind: 'tree' },
  { x: 0, z: -8, kind: 'rock' },
  { x: -9, z: 2, kind: 'rock' },
  { x: 9, z: -1, kind: 'hay' },
  { x: 2, z: 6, kind: 'hay' },
  { x: -2, z: 0, kind: 'hay' },
];

const OBSTACLES: Obstacle[] = PROPS.map((p) => ({
  x: p.x, z: p.z,
  halfW: p.kind === 'tree' ? 0.45 : 0.7,
  halfD: p.kind === 'tree' ? 0.45 : 0.7,
}));

function Ground() {
  return (
    <group>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF * 2 + 6, HALF * 2 + 6]} />
        <meshStandardMaterial color="#8FD98A" roughness={0.95} />
      </mesh>
      {/* 잔디 무늬 — 넓은 초록만 있으면 움직이는 느낌이 안 난다 */}
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={`s-${i}`} rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.003, -HALF + i * 2]}>
          <planeGeometry args={[HALF * 2, 0.9]} />
          <meshStandardMaterial color="#84CE7F" roughness={0.95} />
        </mesh>
      ))}

      {/* 울타리 — 여기까지가 놀이터라는 표시 */}
      {([0, 1, 2, 3] as const).map((side) => {
        const rot = (side * PI) / 2;
        return (
          <group key={`f-${side}`} rotation={[0, rot, 0]} position={[0, 0, -HALF - 0.5]}>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[HALF * 2 + 1, 0.1, 0.1]} />
              <meshStandardMaterial color="#C9A87C" />
            </mesh>
            <mesh position={[0, 0.34, 0]}>
              <boxGeometry args={[HALF * 2 + 1, 0.1, 0.1]} />
              <meshStandardMaterial color="#C9A87C" />
            </mesh>
            {Array.from({ length: 10 }).map((_, i) => (
              <mesh key={i} position={[-HALF + i * ((HALF * 2) / 9), 0.4, 0]}>
                <boxGeometry args={[0.12, 0.9, 0.12]} />
                <meshStandardMaterial color="#B08860" />
              </mesh>
            ))}
          </group>
        );
      })}

      {PROPS.map((p, i) => (
        <group key={`p-${i}`} position={[p.x, 0, p.z]}>
          {p.kind === 'tree' && (
            <>
              <mesh position={[0, 0.7, 0]} castShadow>
                <cylinderGeometry args={[0.18, 0.24, 1.4, 8]} />
                <meshStandardMaterial color="#8A5A3B" />
              </mesh>
              <mesh position={[0, 1.9, 0]} castShadow>
                <sphereGeometry args={[1, 12, 12]} />
                <meshStandardMaterial color="#5FA85C" roughness={0.95} />
              </mesh>
            </>
          )}
          {p.kind === 'rock' && (
            <mesh position={[0, 0.4, 0]} castShadow>
              <dodecahedronGeometry args={[0.66, 0]} />
              <meshStandardMaterial color="#9AA0A6" roughness={0.9} />
            </mesh>
          )}
          {p.kind === 'hay' && (
            <mesh position={[0, 0.5, 0]} rotation={[NEG_HALF_PI, 0, 0]} castShadow>
              <cylinderGeometry args={[0.62, 0.62, 1, 12]} />
              <meshStandardMaterial color="#E0C070" roughness={0.95} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * 잡았는지 보는 부품.
 *
 * **내가 술래일 때만 본다.** 모두가 서로를 판정하면 같은 순간에 여러 명이
 * '내가 잡았다' 를 쓰게 된다. 술래 하나만 판정하면 그런 일이 없다.
 */
function TagJudge({
  isIt, avatarPos, peersRef, onTag,
}: {
  isIt: boolean;
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  peersRef: React.MutableRefObject<Peer[]>;
  onTag: (uid: string, name: string) => void;
}) {
  useFrame(() => {
    if (!isIt) return;
    const me = avatarPos.current;
    for (const p of peersRef.current) {
      const dx = p.x - me.x;
      const dz = p.z - me.z;
      if (dx * dx + dz * dz < TAG_DIST * TAG_DIST) {
        onTag(p.uid, p.name);
        return;   // 한 번에 한 명만
      }
    }
  });
  return null;
}

export default function PlaygroundScene({
  schoolId, roomKey, me, itUid, playing, speedBoost,
  avatarId, avatarCustom, avatarTint, onTag,
}: {
  schoolId: string;
  roomKey: string;
  me: { uid: string; look: PeerLook } | null;
  itUid: string | null;
  playing: boolean;
  /** 바람의 신발을 썼나 */
  speedBoost?: boolean;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onTag: (uid: string, name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 8));
  const avatarYaw = useRef(0);
  const peersRef = useRef<Peer[]>([]);

  const iAmIt = !!me && itUid === me.uid;

  useEffect(() => {
    resetControls(0, 7, 0.42);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 4, maxDist: 16 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 6, 16], fov: 60, near: 0.1, far: 90 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE8F5' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 14, 8]} intensity={1} color="#FFF4DC" castShadow />

        <Ground />

        <group>
          <WalkerAvatar
            avatarPos={avatarPos}
            bounds={{ xMin: -HALF, xMax: HALF, zMin: -HALF, zMax: HALF }}
            start={[0, 0, 8]}
            /**
             * 술래는 조금 빠르다 — 안 그러면 영영 못 잡는다.
             * 신발은 그 위에 얹는다. 다만 **술래보다 훨씬 빨라지지는 않게** 했다.
             * 아이템 하나로 아무도 못 잡으면 나머지 아이들이 재미없어진다.
             */
            maxSpeed={(iAmIt ? 5.4 : 4.8) + (speedBoost ? 0.8 : 0)}
            avatarId={avatarId}
            avatarCustom={avatarCustom}
            avatarTint={avatarTint}
            avatarYaw={avatarYaw}
            obstacles={OBSTACLES}
          />
          {/* 내가 술래면 내 머리 위에도 표시가 있어야 한다 */}
          {iAmIt && <MyItRing avatarPos={avatarPos} />}
        </group>

        {me && (
          <Peers
            schoolId={schoolId}
            roomKey={roomKey}
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
            itUid={itUid}
            onPeersChange={(list) => { peersRef.current = list; }}
          />
        )}

        <TagJudge
          isIt={iAmIt && playing}
          avatarPos={avatarPos}
          peersRef={peersRef}
          onTag={onTag}
        />

        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.2} />
      </Canvas>
    </div>
  );
}

/** 내 머리 위 술래 표시 — 내 아바타를 따라다녀야 한다 */
function MyItRing({ avatarPos }: { avatarPos: React.MutableRefObject<THREE.Vector3> }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    g.current.position.x = avatarPos.current.x;
    g.current.position.z = avatarPos.current.z;
  });
  return (
    <group ref={g}>
      <ItRing />
    </group>
  );
}
