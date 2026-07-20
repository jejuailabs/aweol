'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type AvatarCustom, type AvatarTint,
} from './walker';
import {
  HALF_STRAIGHT, LANE_HALF, PERIMETER, RADIUS, START_POS,
  LapCounter, offCenter, pointAt,
} from '@/lib/track';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

/** 트랙 바닥 — 중심선을 따라 짧은 판을 이어 붙여 곡선을 만든다 */
function TrackSurface() {
  const segments = 96;
  const pieces: { pos: [number, number, number]; rot: number; len: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const s0 = (i / segments) * PERIMETER;
    const s1 = ((i + 1) / segments) * PERIMETER;
    const [x0, z0] = pointAt(s0);
    const [x1, z1] = pointAt(s1);
    const dx = x1 - x0;
    const dz = z1 - z0;
    pieces.push({
      pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2],
      rot: Math.atan2(dx, dz),
      // 이음매가 벌어지지 않게 살짝 길게 자른다
      len: Math.sqrt(dx * dx + dz * dz) * 1.08,
    });
  }

  return (
    <group>
      {/* 잔디 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#8FD98A" roughness={0.95} />
      </mesh>

      {pieces.map((p, i) => (
        <group key={`seg-${i}`} position={p.pos} rotation={[0, p.rot, 0]}>
          {/* 흙길 */}
          <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
            <planeGeometry args={[LANE_HALF * 2, p.len]} />
            <meshStandardMaterial color="#D98E5A" roughness={0.95} />
          </mesh>
          {/* 양쪽 흰 선 — 이걸 넘으면 탈락이다. 판정선과 같은 자리에 그린다. */}
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[-LANE_HALF, 0.012, 0]}>
            <planeGeometry args={[0.14, p.len]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[LANE_HALF, 0.012, 0]}>
            <planeGeometry args={[0.14, p.len]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        </group>
      ))}

      {/* 출발선 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[-HALF_STRAIGHT, 0.014, RADIUS]}>
        <planeGeometry args={[0.3, LANE_HALF * 2]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>

      {/* 트랙 안쪽 잔디 (질러가면 안 되는 곳) */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[STRAIGHT_INNER, INNER_D]} />
        <meshStandardMaterial color="#7CC97A" roughness={0.95} />
      </mesh>
    </group>
  );
}

const STRAIGHT_INNER = HALF_STRAIGHT * 2;
const INNER_D = (RADIUS - LANE_HALF) * 2;

/**
 * 판정만 하는 부품.
 *
 * 아바타는 평소처럼 WalkerAvatar 가 움직이고, 여기서는 그 위치를 **읽기만** 한다.
 * 달리기용 아바타를 따로 만들면 조작감이 학교와 달라지고, 무엇보다
 * 같은 코드를 두 벌 관리하게 된다.
 */
function TrackJudge({
  avatarPos, running, onLap, onFoul,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  running: boolean;
  onLap: () => void;
  onFoul: () => void;
}) {
  const lap = useRef(new LapCounter());
  const wasRunning = useRef(false);

  useFrame(() => {
    if (!running) {
      if (wasRunning.current) { lap.current.reset(); wasRunning.current = false; }
      return;
    }
    wasRunning.current = true;

    const { x, z } = avatarPos.current;
    if (offCenter(x, z) > LANE_HALF) { onFoul(); return; }
    if (lap.current.update(x, z)) onLap();
  });

  return null;
}

export default function TrackScene({
  avatarId, avatarCustom, avatarTint, running, runId, onLap, onFoul,
}: {
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  /** 달리는 중인가. 아니면 판정하지 않는다 (준비 화면에서 선을 밟아도 탈락이 아니다) */
  running: boolean;
  /**
   * 경기 번호. 바뀌면 아바타를 출발선으로 되돌린다.
   *
   * **'출발!' 이 아니라 카운트다운이 시작될 때 옮겨야 한다.** 달리기 시작할 때 옮기면
   * 셋을 세는 동안 딴 데 서 있다가 갑자기 순간이동한다. 세는 동안 출발선에 서 있어야
   * 아이가 어디서 시작하는지 보고 마음의 준비를 한다.
   */
  runId: number;
  onLap: () => void;
  onFoul: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(START_POS[0], 0, START_POS[2]));

  useEffect(() => {
    resetControls(0, 7, 0.5);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 4, maxDist: 16 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [-14, 8, 16], fov: 60, near: 0.1, far: 120 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE8F5' }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[12, 16, 8]} intensity={1.05} color="#FFF4DC" castShadow />

        <TrackSurface />

        <WalkerAvatar
          key={runId}
          avatarPos={avatarPos}
          bounds={{ xMin: -30, xMax: 30, zMin: -22, zMax: 22 }}
          start={START_POS}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
        />
        <TrackJudge avatarPos={avatarPos} running={running} onLap={onLap} onFoul={onFoul} />
        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.2} />
      </Canvas>
    </div>
  );
}
