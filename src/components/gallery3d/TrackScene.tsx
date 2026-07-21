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
const HALF_PI = PI * 0.5;
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
          {/*
            **바깥 두 줄만 판정선이다.** 이 자리가 곧 LANE_HALF 라,
            여기를 넘으면 탈락한다. 굵게 그려 눈에 띄게 한다.
          */}
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[-LANE_HALF, 0.012, 0]}>
            <planeGeometry args={[0.18, p.len]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[LANE_HALF, 0.012, 0]}>
            <planeGeometry args={[0.18, p.len]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>

          {/*
            안쪽 세 줄은 **그림일 뿐 판정과 무관하다.** 진짜 트랙처럼 보이라고 그었다.
            판정선과 헷갈리지 않게 얇고 흐리게 — 밟아도 아무 일 없다.
          */}
          {([-0.5, 0, 0.5]).map((f) => (
            <mesh
              key={`lane-${f}`}
              rotation={[NEG_HALF_PI, 0, 0]}
              position={[LANE_HALF * f, 0.011, 0]}
            >
              <planeGeometry args={[0.07, p.len]} />
              <meshStandardMaterial color="#FFFFFF" transparent opacity={0.4} />
            </mesh>
          ))}
        </group>
      ))}

      {/*
        도는 방향 화살표.
        중심선을 따라 진행 방향(진행도가 커지는 쪽)을 가리키므로,
        판정 규칙이 바뀌면 화살표도 저절로 따라간다 — 손으로 맞출 일이 없다.
      */}
      {Array.from({ length: 12 }).map((_, i) => {
        const s0 = (i / 12) * PERIMETER;
        const [x0, z0] = pointAt(s0);
        const [x1, z1] = pointAt(s0 + 2);
        const rot = Math.atan2(x1 - x0, z1 - z0);
        return (
          <group key={`arrow-${i}`} position={[x0, 0.013, z0]} rotation={[0, rot, 0]}>
            <mesh rotation={[NEG_HALF_PI, 0, 0]}>
              <planeGeometry args={[0.5, 1.1]} />
              <meshStandardMaterial color="#FFF3D0" transparent opacity={0.75} />
            </mesh>
            <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0, 0.85]}>
              {/*
                thetaStart 를 -90도로 준다. 기본값이면 삼각형 꼭짓점이 +X 를 보는데,
                진행 방향은 이 그룹의 +Z 다 — 그대로 두면 화살표가 옆을 가리킨다.
              */}
              <circleGeometry args={[0.42, 3, -HALF_PI]} />
              <meshStandardMaterial color="#FFF3D0" transparent opacity={0.85} />
            </mesh>
          </group>
        );
      })}

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
  avatarPos, running, runId, onLap, onFoul,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  running: boolean;
  /** 선을 밟아 출발선으로 되돌아갈 때마다 올라간다 */
  runId: number;
  onLap: () => void;
  onFoul: () => void;
}) {
  const lap = useRef(new LapCounter());
  const wasRunning = useRef(false);
  const seenRun = useRef(runId);

  useFrame(() => {
    /*
      출발선으로 되돌아갔으면 한 바퀴 계산도 처음부터.
      안 그러면 밟기 직전까지 지난 체크포인트가 남아서, 되돌아간 뒤
      조금만 뛰어도 완주로 세어진다.
      (렌더 중에 ref 를 건드리면 안 되므로 여기서 본다)
    */
    if (seenRun.current !== runId) {
      seenRun.current = runId;
      lap.current.reset();
    }

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
        <TrackJudge avatarPos={avatarPos} running={running} runId={runId} onLap={onLap} onFoul={onFoul} />
        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.2} />
      </Canvas>
    </div>
  );
}
