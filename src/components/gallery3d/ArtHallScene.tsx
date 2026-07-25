'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import { BANNER_SLOTS, themeOf, type HallDoc, type ShowDoc } from '@/lib/art-hall';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 개인 전시관 **바깥** — 미술관 앞 광장.
 *
 * 학교(`SchoolScene`)와 **일부러 다르게 만든다.** 학교는 아기자기하고 둥글다 —
 * 무지개가 뜨고 구름이 흐른다. 미술관은 그러면 안 된다. 전시를 보러 온 사람에게
 * 필요한 것은 **조용하고 반듯한 앞마당**이다.
 *
 * 그래서 이 화면은 세 가지를 지킨다.
 * 1. **곧은 선.** 화강암 바닥의 눈금, 늘어선 기둥, 반듯한 계단.
 * 2. **차분한 색.** 회백색 돌과 유리. 원색은 배너에만 쓴다.
 * 3. **배너가 주인공.** 건물은 배경이고, 눈이 가야 하는 것은 지금 열린 전시다.
 *
 * 실제 미술관 앞이 그렇다 — 건물은 조용하고 배너만 크게 걸려 있다.
 */

/** 광장 크기 */
const PLAZA_W = 62;
const PLAZA_D = 54;
/** 건물 앞면이 서는 자리 */
const FACADE_Z = -22;
const FACADE_W = 42;
const FACADE_H = 14;

/**
 * 그림 한 장을 3D 판에 입힌다.
 *
 * **텍스처로 넣는다.** `Html` 로 `<img>` 를 띄우면 기둥 뒤에 서 있어도
 * 그림이 앞에 뜬다(DOM 은 3D 깊이를 모른다). 배너는 건물 앞에 늘어서 있어서
 * 서로 가리는 일이 잦다 — 그때 뒤엣것이 앞에 보이면 자리가 어디인지 알 수 없다.
 */
function ImagePlane({
  url, w, h, position, rotation,
}: {
  url: string;
  w: number;
  h: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) { setTex(null); return; }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
      },
      undefined,
      // 못 받아도 화면은 멀쩡해야 한다 — 그림만 안 걸린다
      () => {}
    );
    return () => { alive = false; };
  }, [url]);

  // 텍스처는 컴포넌트가 사라질 때 직접 버린다 (three 는 GC 를 안 탄다)
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  if (!tex) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.85} toneMapped={false} />
    </mesh>
  );
}

/**
 * 세로 배너 — **이 화면의 주인공.**
 *
 * 실제 미술관 앞에 걸린 그것이다: 두 기둥 사이에 길게 늘어뜨린 천,
 * 위에 전시 제목, 아래 대표 이미지 한 장.
 *
 * **눌러서 들어간다.** 눌러보라고 적어 놓고 안 눌리면 안 되므로,
 * 천과 이미지와 아래 팻말이 **전부 같은 손잡이**를 갖는다
 * (마을 건물 입구에서 배운 것과 같다).
 */
function Banner({
  x, show, accent, onEnter,
}: {
  x: number;
  show: ShowDoc & { id: string };
  accent: string;
  onEnter: () => void;
}) {
  const [hot, setHot] = useState(false);
  const cloth = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    // 아주 살짝 흔들린다 — 멈춘 천은 판자로 보인다
    if (cloth.current) {
      cloth.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + x) * 0.012;
    }
  });

  const press = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onEnter(); };
  const over = (e: { stopPropagation: () => void }) => {
    e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer';
  };
  const out = () => { setHot(false); document.body.style.cursor = 'auto'; };
  const grab = { onClick: press, onPointerOver: over, onPointerOut: out };

  const BW = 2.6;
  const BH = 7.4;

  return (
    <group position={[x, 0, -9]}>
      {/* 기둥 둘 + 받침 */}
      {([-BW / 2 - 0.28, BW / 2 + 0.28] as const).map((px) => (
        <group key={px}>
          <mesh position={[px, 5.1, 0]} castShadow {...grab}>
            <cylinderGeometry args={[0.11, 0.13, 10.2, 10]} />
            <meshStandardMaterial color="#6F6A64" metalness={0.45} roughness={0.4} />
          </mesh>
          <mesh position={[px, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.5, 0.28, 12]} />
            <meshStandardMaterial color="#57534E" metalness={0.3} roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* 위아래 가로대 */}
      {([9.9, 9.9 - BH] as const).map((py) => (
        <mesh key={py} position={[0, py, 0]} rotation={[0, 0, HALF_PI]} castShadow {...grab}>
          <cylinderGeometry args={[0.07, 0.07, BW + 0.7, 8]} />
          <meshStandardMaterial color="#6F6A64" metalness={0.45} roughness={0.4} />
        </mesh>
      ))}

      <group ref={cloth} position={[0, 9.9 - BH / 2, 0]}>
        {/* 천 — 가리키면 살짝 밝아진다 */}
        <mesh {...grab} castShadow>
          <planeGeometry args={[BW, BH]} />
          <meshStandardMaterial
            color={hot ? '#FFFFFF' : '#F7F5F1'}
            side={THREE.DoubleSide}
            roughness={0.92}
          />
        </mesh>
        {/* 위쪽 색 띠 — 전시관 색으로 */}
        <mesh position={[0, BH / 2 - 0.55, 0.012]}>
          <planeGeometry args={[BW, 1.1]} />
          <meshStandardMaterial color={accent} roughness={0.8} />
        </mesh>

        {/* 대표 이미지 한 장 — 이름만 걸면 무슨 전시인지 알 수 없다 */}
        {show.posterUrl && (
          <ImagePlane
            url={show.posterUrl}
            w={BW - 0.5}
            h={BW - 0.5}
            position={[0, -0.5, 0.014]}
          />
        )}

        {/* 제목 — 천 위에 얹는다 */}
        <Html
          position={[0, BH / 2 - 1.55, 0.02]}
          transform
          scale={0.22}
          pointerEvents="none"
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              width: '210px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none', color: '#2A2724',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#8A8378', letterSpacing: '0.08em' }}>
              {show.subtitle || 'EXHIBITION'}
            </div>
            <div style={{ fontSize: '30px', fontWeight: 900, lineHeight: 1.2, marginTop: '4px', wordBreak: 'keep-all' }}>
              {show.title}
            </div>
          </div>
        </Html>

        {/* 아래 안내 — 몇 점인지와 '들어가기' */}
        <Html
          position={[0, -BH / 2 + 0.75, 0.02]}
          transform
          scale={0.2}
          pointerEvents="none"
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              width: '220px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#8A8378' }}>
              작품 {show.workCount ?? 0}점
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: accent, marginTop: '3px' }}>
              보러 가기 ›
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

/** 분수 — 광장 한가운데. 물줄기가 오르내린다. */
function Fountain() {
  const jets = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = jets.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      const s = 0.72 + Math.sin(t * 1.7 + i * 1.1) * 0.28;
      c.scale.y = s;
      c.position.y = 1.05 + s * 0.55;
    });
  });

  return (
    <group position={[0, 0, 7]}>
      {/* 수반 */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[5, 5.3, 0.6, 40]} />
        <meshStandardMaterial color="#B8B2A8" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
        <circleGeometry args={[4.6, 40]} />
        <meshStandardMaterial color="#7EC8DE" roughness={0.16} metalness={0.1} />
      </mesh>
      {/* 가운데 기둥 */}
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.7, 1.4, 16]} />
        <meshStandardMaterial color="#C8C2B8" roughness={0.8} />
      </mesh>
      {/* 물줄기 */}
      <group ref={jets}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.1, 1.5, Math.sin(a) * 1.1]}>
              <cylinderGeometry args={[0.09, 0.16, 1.6, 8]} />
              <meshStandardMaterial color="#CFEEF8" transparent opacity={0.72} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** 광장 조각 — 미술관 앞에는 늘 하나쯤 서 있다 */
function Sculpture({ x, kind, accent }: { x: number; kind: 0 | 1; accent: string }) {
  return (
    <group position={[x, 0, 1]}>
      {/* 좌대 */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 2.2]} />
        <meshStandardMaterial color="#A9A399" roughness={0.9} />
      </mesh>
      {kind === 0 ? (
        /* 비틀린 고리 — 추상 조각 */
        <group position={[0, 2.5, 0]} rotation={[0.5, 0.7, 0.2]}>
          <mesh castShadow>
            <torusGeometry args={[1.15, 0.3, 12, 28]} />
            <meshStandardMaterial color={accent} roughness={0.35} metalness={0.55} />
          </mesh>
          <mesh rotation={[HALF_PI, 0.4, 0]} castShadow>
            <torusGeometry args={[0.8, 0.22, 10, 24]} />
            <meshStandardMaterial color="#D8D3CA" roughness={0.4} metalness={0.4} />
          </mesh>
        </group>
      ) : (
        /* 쌓아 올린 돌 — 제주 돌탑에서 온 모양 */
        <group position={[0, 1.05, 0]}>
          {([0, 1, 2, 3] as const).map((i) => (
            <mesh
              key={i}
              position={[Math.sin(i * 1.4) * 0.16, 0.42 + i * 0.72, Math.cos(i * 1.9) * 0.16]}
              rotation={[0, i * 0.8, 0]}
              castShadow
            >
              <dodecahedronGeometry args={[0.78 - i * 0.13, 0]} />
              <meshStandardMaterial color={i % 2 ? '#6E6862' : '#807A72'} roughness={1} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** 가로수 — 미술관 앞 플라타너스처럼 곧고 높게 */
function PlazaTree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.1, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.34, 4.2, 8]} />
        <meshStandardMaterial color="#7C6A56" roughness={0.92} />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow>
        <sphereGeometry args={[2, 9, 7]} />
        <meshStandardMaterial color="#5E9155" roughness={0.95} />
      </mesh>
      <mesh position={[0.85, 5.8, 0.35]} castShadow>
        <sphereGeometry args={[1.2, 8, 6]} />
        <meshStandardMaterial color="#6BA160" roughness={0.95} />
      </mesh>
      {/* 나무 밑동 화단 */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.24, 10]} />
        <meshStandardMaterial color="#8F8A80" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** 미술관 건물 — 계단·열주·유리 파사드 */
function Facade({ hall, accent }: { hall: HallDoc; accent: string }) {
  const t = themeOf(hall.theme);

  return (
    <group>
      {/* 본관 */}
      <mesh position={[0, FACADE_H / 2, FACADE_Z - 6]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W, FACADE_H, 14]} />
        <meshStandardMaterial color={t.facade} roughness={0.82} />
      </mesh>
      {/* 지붕 처마 — 그림자가 지면서 건물이 무거워진다 */}
      <mesh position={[0, FACADE_H + 0.5, FACADE_Z - 6]} castShadow>
        <boxGeometry args={[FACADE_W + 2.4, 1, 16]} />
        <meshStandardMaterial color="#8F8A80" roughness={0.8} />
      </mesh>

      {/* 유리 파사드 — 가운데를 크게 비운다 */}
      <mesh position={[0, 6.2, FACADE_Z + 0.06]}>
        <planeGeometry args={[19, 11]} />
        <meshStandardMaterial
          color="#9EC4D6"
          roughness={0.08}
          metalness={0.5}
          transparent
          opacity={0.82}
        />
      </mesh>
      {/* 유리 나눔선 — 통유리 한 장은 판때기로 보인다 */}
      {([-7.6, -3.8, 0, 3.8, 7.6] as const).map((gx) => (
        <mesh key={gx} position={[gx, 6.2, FACADE_Z + 0.09]}>
          <boxGeometry args={[0.14, 11, 0.06]} />
          <meshStandardMaterial color="#6F6A64" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {([2, 6.2, 10.4] as const).map((gy) => (
        <mesh key={gy} position={[0, gy, FACADE_Z + 0.09]}>
          <boxGeometry args={[19, 0.12, 0.06]} />
          <meshStandardMaterial color="#6F6A64" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* 열주 — 미술관을 미술관으로 보이게 하는 것 */}
      {([-17.5, -12.5, -7.5, 7.5, 12.5, 17.5] as const).map((cx) => (
        <group key={cx} position={[cx, 0, FACADE_Z + 2.6]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[1.9, 0.6, 1.9]} />
            <meshStandardMaterial color="#A9A399" roughness={0.9} />
          </mesh>
          <mesh position={[0, 5.9, 0]} castShadow>
            <cylinderGeometry args={[0.62, 0.7, 11, 16]} />
            <meshStandardMaterial color="#E0DCD4" roughness={0.86} />
          </mesh>
          <mesh position={[0, 11.6, 0]} castShadow>
            <boxGeometry args={[1.8, 0.5, 1.8]} />
            <meshStandardMaterial color="#D2CEC6" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* 열주가 받치는 보 */}
      <mesh position={[0, 12.2, FACADE_Z + 2.6]} castShadow>
        <boxGeometry args={[FACADE_W - 2, 1.2, 2.4]} />
        <meshStandardMaterial color="#D8D3CA" roughness={0.85} />
      </mesh>

      {/* 계단 — 다섯 단. 미술관은 늘 조금 올라가서 들어간다. */}
      {([0, 1, 2, 3, 4] as const).map((i) => (
        <mesh
          key={i}
          position={[0, 0.17 + i * 0.34, FACADE_Z + 7.4 - i * 1.15]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[FACADE_W - 4 + i * 1.4, 0.34, 1.2]} />
          <meshStandardMaterial color="#CFCAC2" roughness={0.9} />
        </mesh>
      ))}

      {/* 현관 안쪽 어둠 — 문이 뚫려 있다는 느낌 */}
      <mesh position={[0, 3.2, FACADE_Z + 0.04]}>
        <planeGeometry args={[8, 6.4]} />
        <meshStandardMaterial color="#2A2A2E" roughness={0.9} />
      </mesh>

      {/* 전시관 이름 — 건물 앞면 위쪽에 새긴 것처럼 */}
      <Html
        position={[0, 12.9, FACADE_Z + 3.9]}
        transform
        scale={0.62}
        pointerEvents="none"
        zIndexRange={[7, 0]}
      >
        <div
          style={{
            fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
            color: '#4A453E', fontWeight: 900, fontSize: '26px',
            letterSpacing: '0.14em', whiteSpace: 'nowrap',
          }}
        >
          {hall.title}
        </div>
      </Html>

      {/* 관장 이름 — 작게 */}
      <Html
        position={[0, 11.9, FACADE_Z + 3.9]}
        transform
        scale={0.4}
        pointerEvents="none"
        zIndexRange={[7, 0]}
      >
        <div
          style={{
            fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
            color: accent, fontWeight: 700, fontSize: '18px',
            letterSpacing: '0.2em', whiteSpace: 'nowrap',
          }}
        >
          {hall.placeName || hall.ownerName}
        </div>
      </Html>
    </group>
  );
}

export default function ArtHallScene({
  hall, shows, avatarId, avatarCustom, avatarTint, onEnterShow, onExit, children,
}: {
  hall: HallDoc;
  shows: (ShowDoc & { id: string })[];
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnterShow: (showId: string) => void;
  onExit: () => void;
  /** 화면 위에 얹는 것 (3D 밖이라 여기로 받는다) */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 20));
  const avatarYaw = useRef(0);

  const t = themeOf(hall.theme);
  /** 배너 색 — 전시관 분위기에 맞춰 하나만 고른다 */
  const accent = hall.theme === 'dark' ? '#C9A227' : hall.theme === 'wood' ? '#A8572B' : '#2F5D8A';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 16, 0.3);
    return attachCameraControls(el, { minDist: 8, maxDist: 40 });
  }, []);

  /** 배너가 걸리는 자리 — 가운데를 비우고 좌우로 벌린다(현관 길을 막지 않는다) */
  const banners = useMemo(() => {
    const list = shows.slice(0, BANNER_SLOTS);
    if (list.length === 0) return [];
    // 좌우 대칭으로 벌린다. 한 개면 왼쪽에 하나만 — 가운데는 현관 길이다.
    const span = 22;
    const step = list.length === 1 ? 0 : (span * 2) / (list.length - 1);
    return list.map((s, i) => ({
      show: s,
      x: list.length === 1 ? -13 : -span + step * i,
    }));
  }, [shows]);

  /** 몸이 못 지나가는 것들 */
  const obstacles = useMemo<Obstacle[]>(() => [
    // 분수
    { x: 0, z: 7, halfW: 5.4, halfD: 5.4 },
    // 조각 좌대
    { x: -21, z: 1, halfW: 1.2, halfD: 1.2 },
    { x: 21, z: 1, halfW: 1.2, halfD: 1.2 },
    // 건물 앞면 (계단 위로는 못 올라간다 — 안은 전시실이 따로 있다)
    { x: 0, z: FACADE_Z + 1, halfW: FACADE_W / 2, halfD: 8 },
    // 열주
    ...[-17.5, -12.5, -7.5, 7.5, 12.5, 17.5].map((cx) => ({
      x: cx, z: FACADE_Z + 2.6, halfW: 1, halfD: 1,
    })),
    // 배너 기둥
    ...banners.map((b) => ({ x: b.x, z: -9, halfW: 1.9, halfD: 0.4 })),
    // 가로수
    ...[-26, 26].flatMap((tx) => [-6, 4, 14].map((tz) => ({
      x: tx, z: tz, halfW: 1.5, halfD: 1.5,
    }))),
  ], [banners]);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 12, 34], fov: 52, near: 0.5, far: 400 }}
        dpr={[1, 2]}
        style={{
          position: 'absolute', inset: 0,
          // 미술관 하늘은 옅다. 쨍한 파랑은 학교 몫이다.
          background: hall.theme === 'dark'
            ? 'linear-gradient(180deg, #2E3440 0%, #4A5464 60%, #6E7686 100%)'
            : 'linear-gradient(180deg, #A8C4D8 0%, #CFDEE8 55%, #E8EEF2 100%)',
        }}
      >
        <hemisphereLight args={['#E8F0F6', '#9E9890', 0.7]} />
        <ambientLight intensity={t.ambient * 0.5} />
        <directionalLight
          position={[26, 40, 22]}
          intensity={hall.theme === 'dark' ? 0.6 : 1.05}
          color="#FFF6E6"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
          shadow-bias={-0.0005}
        />

        {/* 광장 바닥 — 화강암 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[PLAZA_W + 60, PLAZA_D + 60]} />
          <meshStandardMaterial color="#B5AFA6" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[PLAZA_W, PLAZA_D]} />
          <meshStandardMaterial color="#C9C4BB" roughness={0.9} />
        </mesh>
        {/*
          바닥 눈금 — **곧은 선이 미술관을 만든다.**
          잔디밭이면 공원이고, 눈금 있는 돌바닥이면 광장이다.
        */}
        {Array.from({ length: 11 }, (_, i) => (
          <mesh
            key={`gx${i}`}
            position={[-PLAZA_W / 2 + (i * PLAZA_W) / 10, 0.03, 0]}
            rotation={[NEG_HALF_PI, 0, 0]}
          >
            <planeGeometry args={[0.12, PLAZA_D]} />
            <meshStandardMaterial color="#A9A399" roughness={0.95} />
          </mesh>
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <mesh
            key={`gz${i}`}
            position={[0, 0.03, -PLAZA_D / 2 + (i * PLAZA_D) / 8]}
            rotation={[NEG_HALF_PI, 0, 0]}
          >
            <planeGeometry args={[PLAZA_W, 0.12]} />
            <meshStandardMaterial color="#A9A399" roughness={0.95} />
          </mesh>
        ))}

        <Facade hall={hall} accent={accent} />
        <Fountain />
        <Sculpture x={-21} kind={0} accent={accent} />
        <Sculpture x={21} kind={1} accent={accent} />

        {/* 가로수 — 양옆으로 줄지어 */}
        {[-26, 26].map((tx) =>
          [-6, 4, 14].map((tz) => <PlazaTree key={`${tx}-${tz}`} x={tx} z={tz} />)
        )}

        {/* 벤치 — 앉아서 배너를 올려다보는 자리 */}
        {([-11, 11] as const).map((bx) => (
          <group key={bx} position={[bx, 0, 15]}>
            <mesh position={[0, 0.46, 0]} castShadow>
              <boxGeometry args={[3.4, 0.16, 0.9]} />
              <meshStandardMaterial color="#9A8570" roughness={0.9} />
            </mesh>
            {([-1.4, 1.4] as const).map((lx) => (
              <mesh key={lx} position={[lx, 0.19, 0]} castShadow>
                <boxGeometry args={[0.22, 0.38, 0.8]} />
                <meshStandardMaterial color="#6E6862" roughness={0.85} />
              </mesh>
            ))}
          </group>
        ))}

        {/* 전시 배너 */}
        {banners.map((b) => (
          <Banner
            key={b.show.id}
            x={b.x}
            show={b.show}
            accent={accent}
            onEnter={() => onEnterShow(b.show.id)}
          />
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -30, xMax: 30, zMin: -14, zMax: 26 }}
          start={[0, 0, 20]}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={obstacles}
        />
        <FollowCamera avatarPos={avatarPos} lookHeight={2} />
      </Canvas>

      <button
        onClick={onExit}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 지도로
      </button>

      {children}
    </div>
  );
}
