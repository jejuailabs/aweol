'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
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

/** 문 사이 간격 */
const DOOR_GAP = 3.2;
/** 복도 폭 */
const HALL_W = 5;
const WALL_H = 3.6;

/**
 * 층 배치 규칙.
 *
 * **한 층에 두 학년**, 복도를 사이에 두고 왼쪽·오른쪽으로 나눈다.
 * 1층 = 1·2학년, 2층 = 3·4학년, 3층 = 5·6학년.
 * 반이 늘면 복도가 길어지고, 학년이 늘면 층이 올라간다 — 손으로 고칠 것이 없다.
 */
export function floorOfGrade(grade: number) { return Math.ceil(grade / 2); }
export function gradesOnFloor(floor: number) { return [floor * 2 - 1, floor * 2]; }
export function floorCount(gradeCount: number) { return Math.max(1, Math.ceil(gradeCount / 2)); }

export interface FloorClass {
  id: string;
  grade: number;
  classNumber: number;
  /** 담임 이름 (문패에 작게) */
  teacherName?: string;
}

/** 교실 문 하나 */
function ClassDoor({
  x, side, label, sub, mine, onEnter,
}: {
  x: number;
  /** -1 왼쪽 벽, +1 오른쪽 벽 */
  side: -1 | 1;
  label: string;
  sub?: string;
  /** 내 반인가 — 눈에 띄게 한다 */
  mine: boolean;
  onEnter: () => void;
}) {
  const [hot, setHot] = useState(false);
  const wallX = side * (HALL_W / 2);
  const face = -side;

  return (
    <group position={[x, 0, wallX]} rotation={[0, side === -1 ? 0 : PI, 0]}>
      {/* 문틀 */}
      <mesh position={[0, 1.15, 0.06 * -face]}>
        <boxGeometry args={[1.5, 2.3, 0.12]} />
        <meshStandardMaterial color={mine ? '#E8A33C' : '#B08860'} roughness={0.7} />
      </mesh>
      {/* 문 */}
      <group
        onClick={(e) => { e.stopPropagation(); onEnter(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
      >
        <mesh position={[0, 1.05, 0.14 * -face]}>
          <boxGeometry args={[1.24, 2.05, 0.1]} />
          <meshStandardMaterial
            color={mine ? '#F0C070' : '#C9A87C'}
            roughness={0.6}
            emissive={mine ? '#E8A33C' : '#E8A33C'}
            emissiveIntensity={hot ? 0.5 : mine ? 0.22 : 0}
          />
        </mesh>
        {/* 문 유리창 */}
        <mesh position={[0, 1.55, 0.2 * -face]}>
          <planeGeometry args={[0.8, 0.6]} />
          <meshStandardMaterial color="#BFE8F5" transparent opacity={0.7} />
        </mesh>
        {/* 손잡이 */}
        <mesh position={[0.42, 1.0, 0.2 * -face]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#E8C86A" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* 문패 */}
      <Html
        position={[0, 2.45, 0.18 * -face]}
        transform
        rotation={[0, side === -1 ? 0 : 0, 0]}
        scale={0.3}
        pointerEvents="none"
        zIndexRange={[5, 0]}
      >
        <div
          style={{
            background: mine ? '#FFE9A8' : '#FFF8E7',
            color: '#5B4A3B', fontWeight: 900, fontSize: '34px',
            padding: '8px 24px', borderRadius: '12px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif',
            border: `4px solid ${mine ? '#E8A33C' : '#B08860'}`,
            boxShadow: `0 6px 0 ${mine ? '#C9832A' : '#9C7448'}`,
            textAlign: 'center', userSelect: 'none',
          }}
        >
          {mine ? '⭐ ' : ''}{label}
          {sub && (
            <div style={{ fontSize: '20px', fontWeight: 700, opacity: 0.75, marginTop: '2px' }}>
              {sub}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

function Corridor({ length }: { length: number }) {
  const half = length / 2;
  return (
    <group>
      {/* 바닥 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[length, HALL_W]} />
        <meshStandardMaterial color="#E4DCCB" roughness={0.4} />
      </mesh>
      {/* 가운데 줄 — 복도가 길어 보이게 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[length, 0.12]} />
        <meshStandardMaterial color="#CFC4AE" />
      </mesh>
      {/* 천장 */}
      <mesh rotation={[HALF_PI, 0, 0]} position={[0, WALL_H, 0]}>
        <planeGeometry args={[length, HALL_W]} />
        <meshStandardMaterial color="#FBF6EA" />
      </mesh>
      {/* 천장 등 */}
      {Array.from({ length: Math.max(2, Math.round(length / 6)) }).map((_, i, arr) => (
        <mesh
          key={i}
          position={[-half + (i + 0.5) * (length / arr.length), WALL_H - 0.05, 0]}
          rotation={[HALF_PI, 0, 0]}
        >
          <planeGeometry args={[1.6, 0.4]} />
          <meshStandardMaterial color="#FFFDF2" emissive="#FFF6D8" emissiveIntensity={0.8} />
        </mesh>
      ))}
      {/* 양쪽 벽 */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[0, WALL_H / 2, side * (HALL_W / 2)]} rotation={[0, side === -1 ? 0 : PI, 0]}>
          <mesh receiveShadow>
            <planeGeometry args={[length, WALL_H]} />
            <meshStandardMaterial color="#F2EADA" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -WALL_H / 2 + 0.4, 0.02]}>
            <planeGeometry args={[length, 0.8]} />
            <meshStandardMaterial color="#C4A882" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* 복도 끝 창문 */}
      {([-1, 1] as const).map((end) => (
        <group key={`end-${end}`} position={[end * half, 0, 0]} rotation={[0, end === 1 ? NEG_HALF_PI : HALF_PI, 0]}>
          <mesh position={[0, WALL_H / 2, 0]}>
            <planeGeometry args={[HALL_W, WALL_H]} />
            <meshStandardMaterial color="#F2EADA" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 1.9, 0.03]}>
            <planeGeometry args={[2.4, 1.4]} />
            <meshStandardMaterial color="#BFE8F5" emissive="#BFE8F5" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 계단 — 위층·아래층으로 */
function Stairs({
  x, dir, label, onUse,
}: {
  x: number;
  /** 'up' 이면 올라가는 모양, 'down' 이면 내려가는 모양 */
  dir: 'up' | 'down';
  label: string;
  onUse: () => void;
}) {
  const [hot, setHot] = useState(false);
  const sign = dir === 'up' ? 1 : -1;
  return (
    <group
      position={[x, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onUse(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, 0.13 + i * 0.26 * (dir === 'up' ? 1 : 0), -1.4 + i * 0.5]} castShadow>
          <boxGeometry args={[3, 0.26, 0.5]} />
          <meshStandardMaterial
            color="#D8CDB6"
            emissive="#E8A33C"
            emissiveIntensity={hot ? 0.3 : 0}
            roughness={0.7}
          />
        </mesh>
      ))}
      <Html position={[0, 2.2, 0]} center pointerEvents="none" zIndexRange={[6, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#5B4A3B', fontWeight: 900, fontSize: '18px',
            padding: '8px 18px', borderRadius: '999px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', border: '3px solid #B08860',
            boxShadow: '0 4px 0 #9C7448', userSelect: 'none',
          }}
        >
          {sign > 0 ? '⬆️' : '⬇️'} {label}
        </div>
      </Html>
    </group>
  );
}

export default function SchoolFloorScene({
  floor, totalFloors, classes, perGrade, myClassId, schoolId, me,
  avatarId, avatarCustom, avatarTint, onEnterClass, onGoFloor, onExit,
}: {
  floor: number;
  totalFloors: number;
  classes: FloorClass[];
  perGrade: number;
  myClassId?: string | null;
  schoolId: string;
  me: { uid: string; look: PeerLook } | null;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnterClass: (classId: string) => void;
  onGoFloor: (floor: number) => void;
  onExit: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 0));
  const avatarYaw = useRef(0);

  const [lowGrade, highGrade] = gradesOnFloor(floor);
  const left = useMemo(
    () => classes.filter((c) => c.grade === lowGrade).sort((a, b) => a.classNumber - b.classNumber),
    [classes, lowGrade]
  );
  const right = useMemo(
    () => classes.filter((c) => c.grade === highGrade).sort((a, b) => a.classNumber - b.classNumber),
    [classes, highGrade]
  );

  // 복도 길이는 반이 많은 쪽에 맞춘다
  const doors = Math.max(left.length, right.length, perGrade, 1);
  const length = doors * DOOR_GAP + 8;
  const half = length / 2;
  const doorX = (i: number) => -half + 4 + i * DOOR_GAP;

  /** 계단은 벽처럼 막는다 — 걸어서 통과하면 층 느낌이 깨진다 */
  const obstacles: Obstacle[] = [
    { x: half - 2, z: 0, halfW: 1.6, halfD: 1.8 },
    { x: -half + 2, z: 0, halfW: 1.6, halfD: 1.8 },
  ];

  useEffect(() => {
    resetControls(HALF_PI, 7, 0.35);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 4, maxDist: 14 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [-half + 6, 3, 9], fov: 60, near: 0.1, far: 120 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#EFE7D6' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 10, 6]} intensity={0.6} color="#FFF4DC" castShadow />

        <Corridor length={length} />

        {left.map((c, i) => (
          <ClassDoor
            key={c.id}
            x={doorX(i)}
            side={-1}
            label={`${c.grade}-${c.classNumber}`}
            sub={c.teacherName || undefined}
            mine={c.id === myClassId}
            onEnter={() => onEnterClass(c.id)}
          />
        ))}
        {right.map((c, i) => (
          <ClassDoor
            key={c.id}
            x={doorX(i)}
            side={1}
            label={`${c.grade}-${c.classNumber}`}
            sub={c.teacherName || undefined}
            mine={c.id === myClassId}
            onEnter={() => onEnterClass(c.id)}
          />
        ))}

        {/* 아래층(또는 현관)으로 */}
        <Stairs
          x={-half + 2}
          dir="down"
          label={floor === 1 ? '현관' : `${floor - 1}층`}
          onUse={() => (floor === 1 ? onExit() : onGoFloor(floor - 1))}
        />
        {/* 위층 */}
        {floor < totalFloors && (
          <Stairs x={half - 2} dir="up" label={`${floor + 1}층`} onUse={() => onGoFloor(floor + 1)} />
        )}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -half + 3.4, xMax: half - 3.4, zMin: -HALL_W / 2 + 0.6, zMax: HALL_W / 2 - 0.6 }}
          start={[-half + 5, 0, 0]}
          maxSpeed={4}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={obstacles}
        />

        {me && (
          <Peers
            schoolId={schoolId}
            // 층마다 방이 따로 — 3층 복도에 1층 아이가 서 있으면 안 된다
            roomKey={`floor-${floor}`}
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
