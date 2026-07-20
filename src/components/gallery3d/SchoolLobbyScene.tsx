'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

const W = 16;
const H = 4.6;
const D = 14;
const halfW = W * 0.5;
const halfD = D * 0.5;

export type LobbySpot = 'about' | 'notice' | 'suggest' | 'album';

/**
 * 게시물이 걸리는 자리들.
 *
 * 실제 학교 현관을 생각하고 배치했다 — 들어서면 정면에 교훈 액자,
 * 오른쪽 벽에 공지 게시판, 왼쪽 벽에 사진 액자들, 계단 옆에 건의함.
 * 한 벽에 다 몰면 들어오자마자 전부 보여서 돌아다닐 이유가 없다.
 */
const SPOTS: {
  key: LobbySpot; label: string; emoji: string; color: string;
  pos: [number, number, number]; rot: number;
}[] = [
  { key: 'about', label: '학교 소개', emoji: '🏫', color: '#6FBF73', pos: [-3.2, 2.1, -halfD + 0.12], rot: 0 },
  { key: 'notice', label: '공지', emoji: '📢', color: '#E8604C', pos: [halfW - 0.12, 2.1, -1.5], rot: NEG_HALF_PI },
  { key: 'album', label: '앨범', emoji: '🖼️', color: '#7B4B94', pos: [-halfW + 0.12, 2.1, -1.5], rot: HALF_PI },
  { key: 'suggest', label: '건의함', emoji: '💌', color: '#E8A33C', pos: [halfW - 0.12, 2.1, 3], rot: NEG_HALF_PI },
];

/** 신발장·화분에 부딪히게 한다. 벽으로 걸어들어가면 실내 느낌이 깨진다. */
const LOBBY_OBSTACLES: Obstacle[] = [
  { x: -halfW + 0.5, z: 3.5, halfW: 0.5, halfD: 2.2 },   // 왼쪽 신발장
  { x: halfW - 0.5, z: -4.5, halfW: 0.5, halfD: 1.6 },   // 오른쪽 진열장
  { x: 0, z: -halfD + 1.2, halfW: 2.6, halfD: 1.2 },     // 중앙 계단
  { x: -5.5, z: -1, halfW: 0.4, halfD: 0.4 },            // 화분
  { x: 5.5, z: 1, halfW: 0.4, halfD: 0.4 },              // 화분
];

// --------------- 구조 ---------------
function LobbyShell({ emblemUrl }: { emblemUrl?: string }) {
  return (
    <group>
      {/* 바닥 — 학교 현관 특유의 반질반질한 타일 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#E4DCCB" roughness={0.35} metalness={0.05} />
      </mesh>
      {/* 타일 줄눈 */}
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={`tz-${i}`} rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.004, -halfD + i * 1.75 + 0.875]}>
          <planeGeometry args={[W, 0.03]} />
          <meshStandardMaterial color="#CFC4AE" />
        </mesh>
      ))}
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={`tx-${i}`} rotation={[NEG_HALF_PI, 0, 0]} position={[-halfW + i * 2 + 1, 0.004, 0]}>
          <planeGeometry args={[0.03, D]} />
          <meshStandardMaterial color="#CFC4AE" />
        </mesh>
      ))}

      {/* 현관 매트 — 들어온 자리 표시 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.008, halfD - 2]}>
        <planeGeometry args={[4, 2]} />
        <meshStandardMaterial color="#7A6A52" roughness={0.95} />
      </mesh>

      {/* 천장 */}
      <mesh rotation={[HALF_PI, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#FBF6EA" />
      </mesh>
      {/* 천장 등 */}
      {([[-4, -3], [4, -3], [-4, 3], [4, 3]] as [number, number][]).map(([x, z]) => (
        <mesh key={`lamp-${x}-${z}`} position={[x, H - 0.06, z]} rotation={[HALF_PI, 0, 0]}>
          <planeGeometry args={[1.6, 0.5]} />
          <meshStandardMaterial color="#FFFDF2" emissive="#FFF6D8" emissiveIntensity={0.8} />
        </mesh>
      ))}

      {/* 벽 — 아래는 굽도리, 위는 밝은 벽 */}
      {([
        { pos: [0, H / 2, -halfD] as [number, number, number], rot: 0, w: W },
        { pos: [-halfW, H / 2, 0] as [number, number, number], rot: HALF_PI, w: D },
        { pos: [halfW, H / 2, 0] as [number, number, number], rot: NEG_HALF_PI, w: D },
      ]).map((wall, i) => (
        <group key={`wall-${i}`} position={wall.pos} rotation={[0, wall.rot, 0]}>
          <mesh receiveShadow>
            <planeGeometry args={[wall.w, H]} />
            <meshStandardMaterial color="#F2EADA" roughness={0.9} />
          </mesh>
          <mesh position={[0, -H / 2 + 0.45, 0.02]}>
            <planeGeometry args={[wall.w, 0.9]} />
            <meshStandardMaterial color="#C4A882" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* 뒤쪽 — 들어온 유리문 */}
      <group position={[0, H / 2, halfD]} rotation={[0, PI, 0]}>
        <mesh>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial color="#F2EADA" roughness={0.9} />
        </mesh>
        <mesh position={[0, -H / 2 + 1.4, 0.03]}>
          <planeGeometry args={[5, 2.8]} />
          <meshStandardMaterial color="#BFE8F5" transparent opacity={0.75} />
        </mesh>
        {([-1.25, 0, 1.25]).map((x) => (
          <mesh key={`mullion-${x}`} position={[x, -H / 2 + 1.4, 0.05]}>
            <boxGeometry args={[0.09, 2.8, 0.04]} />
            <meshStandardMaterial color="#8A8A8A" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* 중앙 계단 — 2층으로 올라가는 느낌만 */}
      <group position={[0, 0, -halfD + 1.2]}>
        {Array.from({ length: 5 }).map((_, i) => (
          <mesh key={`step-${i}`} position={[0, 0.14 + i * 0.28, 0.9 - i * 0.42]} castShadow receiveShadow>
            <boxGeometry args={[5.2, 0.28, 0.42]} />
            <meshStandardMaterial color="#D8CDB6" roughness={0.7} />
          </mesh>
        ))}
        {/* 난간 */}
        {([-2.7, 2.7]).map((x) => (
          <mesh key={`rail-${x}`} position={[x, 1.1, 0]} rotation={[0.6, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 2.6, 8]} />
            <meshStandardMaterial color="#A9865E" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* 신발장 — 학교 현관 하면 이것 */}
      <group position={[-halfW + 0.5, 0, 3.5]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.9, 2.2, 4.4]} />
          <meshStandardMaterial color="#C9A87C" roughness={0.8} />
        </mesh>
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 7 }).map((_, col) => (
            <mesh key={`sh-${row}-${col}`} position={[0.47, 0.42 + row * 0.5, -1.9 + col * 0.62]}>
              <planeGeometry args={[0.52, 0.4]} />
              <meshStandardMaterial color="#7A5C3E" side={THREE.DoubleSide} />
            </mesh>
          ))
        )}
      </group>

      {/* 트로피 진열장 */}
      <group position={[halfW - 0.5, 0, -4.5]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[0.9, 2.4, 3.2]} />
          <meshStandardMaterial color="#B08860" roughness={0.7} />
        </mesh>
        <mesh position={[-0.47, 1.4, 0]} rotation={[0, NEG_HALF_PI, 0]}>
          <planeGeometry args={[2.9, 1.7]} />
          <meshStandardMaterial color="#DFF3FA" transparent opacity={0.4} />
        </mesh>
        {([-1, 0, 1]).map((z, i) => (
          <group key={`tro-${z}`} position={[-0.25, 0.95 + (i % 2) * 0.62, z]}>
            <mesh>
              <cylinderGeometry args={[0.09, 0.13, 0.22, 10]} />
              <meshStandardMaterial color="#E8C86A" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.16, 0]}>
              <boxGeometry args={[0.2, 0.1, 0.2]} />
              <meshStandardMaterial color="#6B4226" />
            </mesh>
          </group>
        ))}
      </group>

      {/* 화분 */}
      {([[-5.5, -1], [5.5, 1]] as [number, number][]).map(([x, z]) => (
        <group key={`pot-${x}`} position={[x, 0, z]}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.24, 0.56, 12]} />
            <meshStandardMaterial color="#C97F5A" roughness={0.85} />
          </mesh>
          {([0, 1, 2]).map((i) => (
            <mesh key={i} position={[Math.sin(i * 2.1) * 0.18, 0.78 + i * 0.22, Math.cos(i * 2.1) * 0.18]} castShadow>
              <sphereGeometry args={[0.28 - i * 0.05, 10, 10]} />
              <meshStandardMaterial color={i === 0 ? '#5FA85C' : '#7CC97A'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 정면 벽 위 교표 */}
      <group position={[3.2, 2.6, -halfD + 0.1]}>
        <mesh>
          <circleGeometry args={[0.75, 32]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
        {emblemUrl && <LobbyEmblem url={emblemUrl} />}
      </group>
    </group>
  );
}

function LobbyEmblem({ url }: { url: string }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(url, (t) => {
      if (!alive) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    }, undefined, () => {});
    return () => { alive = false; };
  }, [url]);
  if (!tex) return null;
  return (
    <mesh position={[0, 0, 0.02]}>
      <circleGeometry args={[0.66, 32]} />
      <meshStandardMaterial map={tex} roughness={0.8} />
    </mesh>
  );
}

// --------------- 게시판 ---------------
function Board({
  spot, count, onOpen,
}: {
  spot: typeof SPOTS[number];
  /** 배지에 띄울 개수. 0이면 안 띄운다 */
  count: number;
  onOpen: (k: LobbySpot) => void;
}) {
  const [hot, setHot] = useState(false);

  return (
    <group position={spot.pos} rotation={[0, spot.rot, 0]}>
      {/* 판 */}
      <mesh
        castShadow
        onClick={(e) => { e.stopPropagation(); onOpen(spot.key); }}
        onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[2.6, 1.9, 0.12]} />
        <meshStandardMaterial
          color="#A97B4F"
          roughness={0.7}
          emissive={spot.color}
          emissiveIntensity={hot ? 0.35 : 0}
        />
      </mesh>
      {/* 속지 */}
      <mesh position={[0, 0, 0.07]}>
        <planeGeometry args={[2.34, 1.64]} />
        <meshStandardMaterial color="#FFF8E7" roughness={0.95} />
      </mesh>
      {/* 압정 */}
      {([[-1.0, 0.7], [1.0, 0.7]] as [number, number][]).map(([x, y]) => (
        <mesh key={`pin-${x}`} position={[x, y, 0.1]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color={spot.color} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}

      <Html position={[0, 0, 0.09]} transform occlude="blending" scale={0.34} zIndexRange={[10, 0]}>
        <button
          onClick={() => onOpen(spot.key)}
          onPointerEnter={() => setHot(true)}
          onPointerLeave={() => setHot(false)}
          style={{
            width: '300px', height: '210px', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'Pretendard, sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '10px',
            transform: hot ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div
            style={{
              width: '78px', height: '78px', borderRadius: '50%',
              background: spot.color + '28', border: `4px solid ${spot.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px',
            }}
          >
            {spot.emoji}
          </div>
          <div style={{ fontWeight: 900, fontSize: '30px', color: '#5B4A3B' }}>{spot.label}</div>
          {count > 0 && (
            <div
              style={{
                fontSize: '17px', fontWeight: 800, color: 'white',
                background: spot.color, borderRadius: '999px', padding: '4px 16px',
              }}
            >
              {count}개
            </div>
          )}
        </button>
      </Html>
    </group>
  );
}

// --------------- 조명 ---------------
function LobbyLighting() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 8]} intensity={0.7} color="#FFF4DC" castShadow />
      <pointLight position={[0, H - 0.5, 0]} intensity={0.4} color="#FFF8E7" distance={20} />
      <pointLight position={[0, 2, halfD - 2]} intensity={0.3} color="#DFF3FA" distance={10} />
    </>
  );
}

// --------------- 메인 ---------------
export default function SchoolLobbyScene({
  schoolName, emblemUrl, counts, avatarId, avatarCustom, avatarTint, onOpen,
}: {
  schoolName: string;
  emblemUrl?: string;
  /** 게시판 배지에 띄울 개수 */
  counts: Record<LobbySpot, number>;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onOpen: (k: LobbySpot) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, halfD - 2.5));

  useEffect(() => {
    // 들어서면 정면(계단·교훈 쪽)을 보게
    resetControls(0, 6.5, 0.3);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 3, maxDist: 12 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 3.2, 12], fov: 62, near: 0.1, far: 60 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#EFE7D6' }}
      >
        <LobbyLighting />
        <LobbyShell emblemUrl={emblemUrl} />

        {/* 학교 이름 현판 — 계단 위 */}
        <Html position={[0, 3.5, -halfD + 0.15]} transform scale={0.42} pointerEvents="none" zIndexRange={[5, 0]}>
          <div
            style={{
              background: '#FFF8E7', border: '4px solid #B08860', borderRadius: '14px',
              padding: '10px 34px', fontFamily: 'Pretendard, sans-serif', fontWeight: 900,
              fontSize: '30px', color: '#5B4A3B', whiteSpace: 'nowrap', userSelect: 'none',
              boxShadow: '0 5px 0 #9C7448',
            }}
          >
            {schoolName}
          </div>
        </Html>

        {SPOTS.map((s) => (
          <Board key={s.key} spot={s} count={counts[s.key] ?? 0} onOpen={onOpen} />
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -halfW + 0.9, xMax: halfW - 0.9, zMin: -halfD + 2.6, zMax: halfD - 0.9 }}
          start={[0, 0, halfD - 2.5]}
          maxSpeed={3.6}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          obstacles={LOBBY_OBSTACLES}
        />
        <DustPuffs />
        <FollowCamera
          avatarPos={avatarPos}
          lookHeight={1.2}
          introFrom={[0, 3.2, 12]}
          introLook={[0, 2, -4]}
          clamp={{ xMin: -halfW - 0.6, xMax: halfW + 0.6, zMin: -halfD - 0.6, zMax: halfD + 1.2, yMin: 1, yMax: 4.2 }}
        />
      </Canvas>
    </div>
  );
}
