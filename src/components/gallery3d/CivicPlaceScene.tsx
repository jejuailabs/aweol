'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import type { CivicPlace } from '@/lib/civic-places';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 우리 동네 기관 안 — **걸어다니며 배운다.**
 *
 * 창을 하나 띄워 글을 읽히면 그건 그냥 안내문이다. 학교 로비(`SchoolLobbyScene`)에서
 * 배운 대로, **걸어가서 앞에 서면 말을 거는** 방식으로 만든다.
 * 아이가 창구 앞에 서면 그 사람이 자기 일을 말해준다.
 *
 * **방은 한 벌만 만든다.** 우체국·읍사무소·경찰서가 저마다 다른 건물이면 기관을
 * 하나 늘릴 때마다 3D 를 새로 만들어야 한다. 벽 색과 창구 이름만 바뀌면
 * **표에 한 줄 더 쓰는 것으로 기관이 하나 늘어난다** — 그게 이 구조의 요점이다.
 */

const ROOM_W = 16;
const ROOM_D = 14;
const WALL_H = 4.2;

/** 창구·안내판처럼 몸이 못 지나가는 것들 */
const OBSTACLES: Obstacle[] = [
  // 창구 카운터 (안쪽 가로로 길게)
  { x: 0, z: -4.2, halfW: 5.5, halfD: 0.8 },
  // 대기 의자 두 줄
  { x: -3.5, z: 2.4, halfW: 2.25, halfD: 0.6 },
  { x: 3.5, z: 2.4, halfW: 2.25, halfD: 0.6 },
];

/** 사람이 서 있는 자리 (창구 안쪽) */
function deskXs(count: number): number[] {
  if (count <= 1) return [0];
  const span = 8.4;
  const gap = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + gap * i);
}

/** 직원 — 창구 안쪽에 서서, 가까이 오면 자기 일을 말한다 */
function Clerk({
  x, emoji, name, job, avatarPos,
}: {
  x: number;
  emoji: string;
  name: string;
  job: string;
  avatarPos: React.RefObject<THREE.Vector3>;
}) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    /**
     * 거리 판정은 **화면 그리기와 따로 돈다.**
     * `useFrame` 안에서 상태를 바꾸면 1초에 60번 다시 그리게 된다 —
     * 사람이 걸어오는 속도에는 5번이면 충분하다.
     */
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;
      const d = Math.hypot(p.x - x, p.z - (-3.0));
      setNear((was) => (was === d < 3.2 ? was : d < 3.2));
    }, 200);
    return () => clearInterval(t);
  }, [avatarPos, x]);

  return (
    <group position={[x, 0, -5.0]}>
      {/* 몸 */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.8, 4, 12]} />
        <meshStandardMaterial color="#5B6B8A" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#F2D3B3" roughness={0.9} />
      </mesh>

      <Html position={[0, 2.35, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[8, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#5B4A3B', fontWeight: 800, fontSize: '13px',
            padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
          }}
        >
          {emoji} {name}
        </div>
      </Html>

      {/*
        가까이 갔을 때만 말한다. 셋이 한꺼번에 떠들면 아무것도 안 읽힌다 —
        학교 창문 문패에서 배운 것과 같다.
      */}
      {near && (
        <Html position={[0, 3.1, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[9, 0]}>
          <div
            style={{
              background: 'rgba(255,250,240,0.98)', color: '#3A3226',
              fontSize: '13px', lineHeight: 1.5, fontWeight: 600,
              padding: '10px 14px', borderRadius: '14px', width: '230px',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
              border: '2px solid #EFE3CB', boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}
          >
            {job}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function CivicPlaceScene({
  place, avatarId, avatarCustom, avatarTint, onExit,
}: {
  place: CivicPlace;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom;
  avatarTint?: AvatarTint;
  onExit: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 4.5));
  const avatarYaw = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 11);
    return attachCameraControls(el, { minDist: 6, maxDist: 20 });
  }, []);

  const xs = deskXs(place.people.length);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 6, 12], fov: 55, near: 0.1, far: 200 }}
        style={{ background: '#EAF1F8' }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 14, 6]} intensity={0.8} castShadow />

        {/* 바닥 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[ROOM_W, ROOM_D]} />
          <meshStandardMaterial color="#E9E3D6" roughness={0.95} />
        </mesh>

        {/* 벽 셋 (앞은 열어둔다 — 막으면 답답하고 나가는 길이 안 보인다) */}
        <mesh position={[0, WALL_H / 2, -ROOM_D / 2]} receiveShadow>
          <planeGeometry args={[ROOM_W, WALL_H]} />
          <meshStandardMaterial color={place.color} roughness={0.9} />
        </mesh>
        <mesh position={[-ROOM_W / 2, WALL_H / 2, 0]} rotation={[0, PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, WALL_H]} />
          <meshStandardMaterial color="#F4EFE4" roughness={0.95} />
        </mesh>
        <mesh position={[ROOM_W / 2, WALL_H / 2, 0]} rotation={[0, -PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, WALL_H]} />
          <meshStandardMaterial color="#F4EFE4" roughness={0.95} />
        </mesh>

        {/* 창구 카운터 */}
        <mesh position={[0, 0.55, -4.2]} castShadow receiveShadow>
          <boxGeometry args={[11, 1.1, 1.6]} />
          <meshStandardMaterial color="#B98D5F" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.16, -4.2]}>
          <boxGeometry args={[11.2, 0.12, 1.8]} />
          <meshStandardMaterial color="#8A6038" roughness={0.6} />
        </mesh>

        {/* 안내판 — 여기가 어디이고 무엇을 하는 곳인가 */}
        <Html position={[0, 3.1, -ROOM_D / 2 + 0.15]} center style={{ pointerEvents: 'none' }} zIndexRange={[7, 0]}>
          <div
            style={{
              background: 'rgba(255,255,255,0.96)', color: '#3A3226',
              padding: '12px 18px', borderRadius: '14px', width: '300px',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none', textAlign: 'center',
              border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: '19px', fontWeight: 900 }}>{place.emoji} {place.label}</div>
            <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5, color: '#6B5B43' }}>
              {place.oneLine}
            </div>
          </div>
        </Html>

        {/* 직원들 — 창구 안쪽 */}
        {place.people.map((p, i) => (
          <Clerk
            key={p.name}
            x={xs[i]}
            emoji={p.emoji}
            name={p.name}
            job={p.job}
            avatarPos={avatarPos}
          />
        ))}

        {/* 대기 의자 */}
        {[-3.5, 3.5].map((x) => (
          <group key={x} position={[x, 0, 2.4]}>
            <mesh position={[0, 0.42, 0]} castShadow>
              <boxGeometry args={[4.5, 0.18, 1.2]} />
              <meshStandardMaterial color="#C9A97E" roughness={0.8} />
            </mesh>
            {[-1.6, 0, 1.6].map((dx) => (
              <mesh key={dx} position={[dx, 0.2, 0]} castShadow>
                <boxGeometry args={[0.2, 0.4, 1.1]} />
                <meshStandardMaterial color="#A07E55" roughness={0.85} />
              </mesh>
            ))}
          </group>
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -ROOM_W / 2 + 1, xMax: ROOM_W / 2 - 1, zMin: -ROOM_D / 2 + 1, zMax: ROOM_D / 2 - 1 }}
          start={[0, 0, 4.5]}
          maxSpeed={4.2}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={OBSTACLES}
        />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.4} />
      </Canvas>

      <button
        onClick={onExit}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 마을로
      </button>

      {/*
        여기 와야 되는 일 — **창구 사람 말과 다른 것**이다.
        사람은 '내가 무슨 일을 하는가' 를 말하고, 여기는 '네가 무엇을 할 수 있는가' 다.
      */}
      <div className="pos-hint absolute left-3 right-3 z-20 mx-auto max-w-[420px] rounded-2xl px-4 py-3 pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.94)', color: '#5B4A3B' }}
      >
        <div className="text-[13px] font-black mb-1">여기서 할 수 있는 일</div>
        <ul className="text-[12px] leading-relaxed list-disc pl-4">
          {place.todo.map((t) => <li key={t}>{t.replace(/\*\*/g, '')}</li>)}
        </ul>
      </div>
    </div>
  );
}
