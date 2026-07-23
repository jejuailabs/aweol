'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type AvatarCustom, type AvatarTint,
} from './walker';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

/** 광장 크기 (한 변의 절반) */
export const PLAZA_HALF = 11;
/** 가운데 금 — 이 폭 안은 어느 쪽도 아니다 */
export const MIDDLE = 1.0;

/**
 * 광장 — **몸으로 답하는 곳.**
 *
 * 왼쪽이 O, 오른쪽이 X. 가운데는 금이라 어느 쪽도 아니다.
 * 금 위에 서 있으면 답을 안 낸 것이고, 답을 안 내면 떨어진다 —
 * **끝까지 고민하다 못 고르는 것도 답이다.**
 */
export function sideOf(x: number): 'O' | 'X' | null {
  if (x < -MIDDLE / 2) return 'O';
  if (x > MIDDLE / 2) return 'X';
  return null;
}

/** 바닥 절반 — 고른 쪽이 밝아진다 */
function Half({ side, active, dim }: { side: 'O' | 'X'; active: boolean; dim: boolean }) {
  const x = side === 'O' ? -(PLAZA_HALF + MIDDLE / 2) / 2 : (PLAZA_HALF + MIDDLE / 2) / 2;
  const w = PLAZA_HALF - MIDDLE / 2;
  const base = side === 'O' ? '#3BAF9F' : '#E8604C';
  return (
    <group>
      <mesh position={[x, 0.02, 0]} rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[w, PLAZA_HALF * 2]} />
        <meshStandardMaterial
          color={base}
          roughness={0.95}
          transparent
          opacity={dim ? 0.22 : active ? 0.85 : 0.45}
        />
      </mesh>
      {/* 큰 글자 — 멀리서도 어느 쪽인지 보여야 뛴다 */}
      <mesh position={[x, 0.04, -PLAZA_HALF * 0.55]} rotation={[NEG_HALF_PI, 0, 0]}>
        <ringGeometry
          args={side === 'O' ? [1.4, 2.0, 40] : [0, 0.001, 3]}
        />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} />
      </mesh>
      {side === 'X' && (
        <group position={[x, 0.04, -PLAZA_HALF * 0.55]} rotation={[NEG_HALF_PI, 0, 0]}>
          {[PI / 4, -PI / 4].map((r) => (
            <mesh key={r} rotation={[0, 0, r]}>
              <planeGeometry args={[4.0, 0.5]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} />
            </mesh>
          ))}
        </group>
      )}
      <Html position={[x, 3.2, -PLAZA_HALF * 0.55]} center style={{ pointerEvents: 'none' }} zIndexRange={[3, 0]}>
        <div
          style={{
            fontSize: '64px', fontWeight: 900, color: 'white',
            textShadow: '0 4px 12px rgba(0,0,0,.35)', userSelect: 'none',
            fontFamily: 'Pretendard, sans-serif', opacity: dim ? 0.35 : 1,
          }}
        >
          {side}
        </div>
      </Html>
    </group>
  );
}

/** 떨어진 아이들이 앉는 자리 — 광장 뒤 */
function Bleachers() {
  return (
    <group position={[0, 0, PLAZA_HALF + 1.6]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.35 + i * 0.5, i * 1.1]} castShadow receiveShadow>
          <boxGeometry args={[PLAZA_HALF * 2, 0.35, 1.0]} />
          <meshStandardMaterial color={i % 2 ? '#C9A97E' : '#B8946A'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export default function PlazaScene({
  avatarId, avatarCustom, avatarTint,
  /** 내가 지금 서 있는 쪽이 바뀌면 알려준다 */
  onSide,
  /** 떨어졌나 — 떨어지면 바닥이 흐려지고 못 고른다 */
  out = false,
  children,
}: {
  avatarId?: string | null;
  avatarCustom?: AvatarCustom;
  avatarTint?: AvatarTint;
  onSide?: (side: 'O' | 'X' | null) => void;
  out?: boolean;
  /** 화면 위에 얹는 것(문제·남은 시간). 3D 밖이라 여기로 받는다 */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, PLAZA_HALF - 2));
  const avatarYaw = useRef(0);
  const [side, setSide] = useState<'O' | 'X' | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 13);
    return attachCameraControls(el, { minDist: 7, maxDist: 22 });
  }, []);

  /**
   * 어느 쪽에 서 있는지 지켜본다.
   *
   * **화면 그리기와 따로 돈다.** `useFrame` 안에서 상태를 바꾸면 1초에 60번
   * 다시 그린다 — 아이가 걸어서 금을 넘는 데는 초당 다섯 번이면 넘친다.
   * (관공서 직원 말풍선에서 쓴 것과 같은 방식이다)
   */
  useEffect(() => {
    const t = setInterval(() => {
      const s = sideOf(avatarPos.current.x);
      setSide((was) => (was === s ? was : s));
    }, 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { onSide?.(side); }, [side, onSide]);

  const bounds = useMemo(
    () => ({ xMin: -PLAZA_HALF, xMax: PLAZA_HALF, zMin: -PLAZA_HALF, zMax: PLAZA_HALF + 4 }),
    []
  );

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas shadows camera={{ position: [0, 8, 14], fov: 55, near: 0.1, far: 200 }} style={{ background: '#DCEBF7' }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 16, 8]} intensity={0.85} castShadow />

        {/* 바닥 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[PLAZA_HALF * 2 + 8, PLAZA_HALF * 2 + 12]} />
          <meshStandardMaterial color="#E6E0D2" roughness={0.98} />
        </mesh>

        <Half side="O" active={side === 'O'} dim={out} />
        <Half side="X" active={side === 'X'} dim={out} />

        {/* 가운데 금 */}
        <mesh position={[0, 0.03, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
          <planeGeometry args={[MIDDLE, PLAZA_HALF * 2]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.75} />
        </mesh>

        <Bleachers />

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={bounds}
          start={[0, 0, PLAZA_HALF - 2]}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
        />
        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.4} />
      </Canvas>

      {children}
    </div>
  );
}
