'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';
import {
  nextTravelMode, speedOf, warpTargets, type TravelMode, type WarpTarget,
} from '@/lib/village-travel';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

type XZ = [number, number];

export interface VillageData {
  c: [number, number];
  r: number;
  b: { p: XZ[]; h: number; n?: string }[];
  rd: { p: XZ[]; w: number }[];
  a: { p: XZ[]; k: 'water' | 'park' }[];
  poi: { x: number; z: number; k: string; n?: string }[];
}

/**
 * 실제 동네를 걸어다니는 화면.
 *
 * 지도 API 를 부르지 않는다 — 학교를 만들 때 구워둔 JSON 파일 하나를 읽어 그린다.
 * 좌표는 이미 '학교를 원점으로 한 미터' 라서 그대로 3D 에 꽂으면 된다.
 */

/** 건물 바닥 다각형을 세운다 */
function Buildings({ list }: { list: VillageData['b'] }) {
  const geos = useMemo(
    () =>
      list.map((b) => {
        const shape = new THREE.Shape();
        b.p.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
        // Shape 는 XY 평면에 그려지므로 눕혀서 XZ 로 보낸다
        geo.rotateX(-PI / 2);
        return geo;
      }),
    [list]
  );

  // 지오메트리는 컴포넌트가 사라질 때 직접 버려야 한다 (three 는 GC 를 안 탄다)
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  return (
    <group>
      {geos.map((geo, i) => {
        const b = list[i];
        // 이름 있는 건물은 눈에 띄게. 나머지는 배경처럼.
        const named = !!b.n;
        return (
          <group key={i}>
            <mesh geometry={geo} castShadow receiveShadow>
              <meshStandardMaterial
                color={named ? '#F0DFC0' : '#E4DDD0'}
                roughness={0.9}
              />
            </mesh>
            {named && (
              <Html
                position={[b.p[0][0], b.h + 2, b.p[0][1]]}
                center
                pointerEvents="none"
                zIndexRange={[4, 0]}
              >
                <div
                  style={{
                    background: 'rgba(255,248,231,0.94)', color: '#5B4A3B',
                    fontWeight: 800, fontSize: '14px', padding: '3px 10px',
                    borderRadius: '999px', whiteSpace: 'nowrap',
                    fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                  }}
                >
                  {b.n}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** 길 — 폴리라인을 따라 판을 이어 붙인다 */
function Roads({ list }: { list: VillageData['rd'] }) {
  const pieces = useMemo(() => {
    const out: { pos: [number, number, number]; rot: number; len: number; w: number }[] = [];
    for (const r of list) {
      for (let i = 0; i < r.p.length - 1; i++) {
        const [x0, z0] = r.p[i];
        const [x1, z1] = r.p[i + 1];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.5) continue;
        out.push({
          pos: [(x0 + x1) / 2, 0, (z0 + z1) / 2],
          rot: Math.atan2(dx, dz),
          // 이음매가 벌어지지 않게 살짝 길게
          len: len * 1.06,
          w: r.w,
        });
      }
    }
    return out;
  }, [list]);

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={[NEG_HALF_PI, 0, p.rot]} receiveShadow>
          <planeGeometry args={[p.w, p.len]} />
          <meshStandardMaterial color="#D6C9AE" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** 물·공원 — 바닥에 색만 깐다 */
function Areas({ list }: { list: VillageData['a'] }) {
  const geos = useMemo(
    () =>
      list.map((a) => {
        const shape = new THREE.Shape();
        a.p.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-PI / 2);
        return geo;
      }),
    [list]
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);

  return (
    <group>
      {geos.map((geo, i) => (
        <mesh key={i} geometry={geo} position={[0, 0.02, 0]} receiveShadow>
          <meshStandardMaterial
            color={list[i].k === 'water' ? '#8FD3F0' : '#9FDD97'}
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 자동차.
 *
 * 아바타를 **태우는 게 아니라 발밑에 깔아** 둔다. 아바타를 숨기고 차만 두면
 * 내 캐릭터가 사라진 것처럼 보이고, 다른 사람 눈에도 내가 안 보인다.
 * 그래서 아바타는 그대로 두고 차 위에 서 있는 모양으로 간다 — 아이들 게임에서
 * 흔한 방식이고, 아바타 꾸미기(모자·색)가 계속 보인다는 게 크다.
 */
function Car({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <group position={[0, 0.02, 0]}>
      {/* 몸통 */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.25, 0.42, 2.1]} />
        <meshStandardMaterial color="#E8604C" roughness={0.55} />
      </mesh>
      {/* 지붕 */}
      <mesh position={[0, 0.68, -0.12]} castShadow>
        <boxGeometry args={[1.0, 0.36, 1.0]} />
        <meshStandardMaterial color="#F7C8C0" roughness={0.5} />
      </mesh>
      {/* 바퀴 — 좌우 앞뒤 네 개 */}
      {([[-0.62, 0.7], [0.62, 0.7], [-0.62, -0.7], [0.62, -0.7]] as const).map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.2, z]} rotation={[0, 0, PI * 0.5]}>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 12]} />
          <meshStandardMaterial color="#3A3226" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** 차를 아바타 자리에 붙여 따라다니게 한다 (아바타와 같은 위치·같은 방향) */
function CarRig({
  avatarPos, avatarYaw, show,
}: {
  avatarPos: React.RefObject<THREE.Vector3>;
  avatarYaw: React.RefObject<number>;
  show: boolean;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const p = avatarPos.current;
    if (!g.current || !p) return;
    g.current.position.set(p.x, 0, p.z);
    g.current.rotation.y = avatarYaw.current ?? 0;
  });
  return <group ref={g}><Car show={show} /></group>;
}

/**
 * 학교에서 얼마나 멀어졌는지 지켜보다가 걷기↔자동차를 바꾼다.
 *
 * 매 프레임 세면 1초에 60번 판단하게 되니 **네 프레임에 한 번**만 본다.
 * 어차피 사람이 그 사이에 20m 를 가지 못한다.
 */
function TravelWatcher({
  avatarPos, mode, onMode,
}: {
  avatarPos: React.RefObject<THREE.Vector3>;
  mode: TravelMode;
  onMode: (m: TravelMode) => void;
}) {
  const tick = useRef(0);
  useFrame(() => {
    tick.current += 1;
    if (tick.current % 4 !== 0) return;
    const p = avatarPos.current;
    if (!p) return;
    const next = nextTravelMode(Math.hypot(p.x, p.z), mode);
    if (next !== mode) onMode(next);
  });
  return null;
}

export default function VillageMapScene({
  data, schoolId, schoolName, me, avatarId, avatarCustom, avatarTint, onEnterSchool,
}: {
  data: VillageData;
  schoolId: string;
  schoolName: string;
  me: { uid: string; look: PeerLook } | null;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnterSchool: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 30));
  const avatarYaw = useRef(0);
  const [schoolHot, setSchoolHot] = useState(false);
  /** 걷는 중인가 차를 탔는가. 학교에서 멀어지면 저절로 차를 탄다. */
  const [mode, setMode] = useState<TravelMode>('walk');
  const [warpOpen, setWarpOpen] = useState(false);
  /** 워프한 직후 잠깐 띄우는 말 */
  const [warpedTo, setWarpedTo] = useState('');

  const targets: WarpTarget[] = useMemo(
    () => warpTargets(data.poi, schoolName),
    [data.poi, schoolName]
  );

  /**
   * 워프 — 아바타를 그 자리로 **옮기기만** 한다.
   *
   * 화면을 바꾸지 않으니 되돌아올 것도 없고, 다른 친구들 눈에도 그냥
   * 순간이동한 것으로 보인다(위치는 어차피 매 순간 공유된다).
   */
  const warpTo = (t: WarpTarget) => {
    // 목적지 한가운데에 떨어지면 건물에 끼일 수 있어 살짝 앞에 세운다
    avatarPos.current.set(t.x, 0, t.z + 6);
    setWarpOpen(false);
    setWarpedTo(t.name);
    setTimeout(() => setWarpedTo(''), 2200);
  };

  /**
   * 건물은 통과할 수 없게 한다.
   * 다각형 그대로 판정하면 무거우니 **감싸는 네모**로 줄인다 —
   * 아이가 벽에 살짝 못 붙는 정도지 걸어다니는 데는 지장이 없다.
   */
  const obstacles: Obstacle[] = useMemo(
    () =>
      data.b.map((b) => {
        const xs = b.p.map((p) => p[0]);
        const zs = b.p.map((p) => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        return {
          x: (minX + maxX) / 2,
          z: (minZ + maxZ) / 2,
          halfW: (maxX - minX) / 2,
          halfD: (maxZ - minZ) / 2,
        };
      }),
    [data.b]
  );

  useEffect(() => {
    resetControls(0, 12, 0.45);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 6, maxDist: 40 });
  }, []);

  const R = data.r;

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 24, 60], fov: 58, near: 0.5, far: 1600 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE8F5' }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[120, 200, 100]} intensity={0.95} color="#FFF4DC" />

        {/* 바닥 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[R * 2 + 200, R * 2 + 200]} />
          <meshStandardMaterial color="#A8DDA0" roughness={0.95} />
        </mesh>

        <Areas list={data.a} />
        <Roads list={data.rd} />
        <Buildings list={data.b} />

        {/* 학교 자리 — 원점이 곧 학교다. 여기를 눌러 들어간다. */}
        <group
          position={[0, 0, 0]}
          onClick={(e) => { e.stopPropagation(); onEnterSchool(); }}
          onPointerOver={(e) => { e.stopPropagation(); setSchoolHot(true); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setSchoolHot(false); document.body.style.cursor = 'auto'; }}
        >
          <mesh position={[0, 0.06, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
            <circleGeometry args={[8, 32]} />
            <meshStandardMaterial color={schoolHot ? '#FFE9A8' : '#FFF4D0'} roughness={0.9} />
          </mesh>
          <Html position={[0, 9, 0]} center pointerEvents="none" zIndexRange={[6, 0]}>
            <div
              style={{
                background: '#FFF8E7', color: '#5B4A3B', fontWeight: 900, fontSize: '17px',
                padding: '7px 18px', borderRadius: '12px', whiteSpace: 'nowrap',
                fontFamily: 'Pretendard, sans-serif', border: '3px solid #B08860',
                boxShadow: '0 4px 0 #9C7448', userSelect: 'none',
              }}
            >
              🏫 {schoolName}{schoolHot ? ' — 들어가기' : ''}
            </div>
          </Html>
        </group>

        {/* 시설 표시 */}
        {data.poi.filter((p) => p.n).slice(0, 30).map((p, i) => (
          <Html key={i} position={[p.x, 3, p.z]} center pointerEvents="none" zIndexRange={[3, 0]}>
            <div
              style={{
                background: 'rgba(255,255,255,0.85)', color: '#6B5B43',
                fontWeight: 700, fontSize: '13px', padding: '2px 7px',
                borderRadius: '999px', whiteSpace: 'nowrap',
                fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
              }}
            >
              📍 {p.n}
            </div>
          </Html>
        ))}

        <TravelWatcher avatarPos={avatarPos} mode={mode} onMode={setMode} />
        <CarRig avatarPos={avatarPos} avatarYaw={avatarYaw} show={mode === 'car'} />

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -R, xMax: R, zMin: -R, zMax: R }}
          start={[0, 0, 30]}
          maxSpeed={speedOf(mode)}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={obstacles}
        />

        {me && (
          <Peers
            schoolId={schoolId}
            // 동네는 학교마다 다르니 방도 학교마다 나눈다
            roomKey="village"
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
          />
        )}

        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.4} />
      </Canvas>

      {/*
        아래는 캔버스 밖 화면이다 — 3D 안에 넣으면 아바타 뒤로 가려지고
        휴대폰에서는 너무 작아진다.
      */}

      {/* 자동차 모드 알림 — 왜 갑자기 빨라졌는지 알려준다 */}
      {mode === 'car' && (
        <div
          className="pos-top-safe absolute left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] font-black"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
        >
          🚗 자동차 모드 — 학교에서 멀어져서 빨라졌어요
        </div>
      )}

      {/* 워프한 직후 */}
      {warpedTo && (
        <div
          className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-3 text-[15px] font-black"
          style={{ background: 'rgba(24,20,16,0.82)', color: '#FFF8E7' }}
        >
          {/* 이름 뒤에 바로 붙인다 — '한담해변 에 도착' 처럼 띄면 어색하다 */}
          ✨ {warpedTo}에 도착!
        </div>
      )}

      {/* 워프 열기 */}
      <button
        onClick={() => setWarpOpen((v) => !v)}
        className="pos-above-nav absolute right-4 z-30 rounded-full px-5 py-3 text-[15px] font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        {warpOpen ? '✕ 닫기' : '🗺️ 순간이동'}
      </button>

      {warpOpen && (
        <div
          className="absolute inset-0 z-30"
          style={{ background: 'rgba(24,20,16,0.45)' }}
          onClick={() => setWarpOpen(false)}
        >
          <div
            className="pos-above-nav absolute left-4 right-4 rounded-3xl p-4 mx-auto max-w-[420px]"
            style={{ background: 'rgba(255,250,240,0.97)', border: '3px solid rgba(255,255,255,0.7)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-black mb-1" style={{ color: '#3A3226' }}>
              🗺️ 어디로 갈까?
            </div>
            <p className="text-[13px] mb-3 leading-relaxed" style={{ color: '#8A7A5F' }}>
              누르면 그 자리로 바로 이동해요. 걸어서 돌아올 수도 있어요.
            </p>
            <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => warpTo(t)}
                  className="flex items-center gap-2 rounded-2xl px-4 py-3 text-left"
                  style={{ background: 'white' }}
                >
                  <span className="text-lg">{t.id === 'school' ? '🏫' : '📍'}</span>
                  <span className="flex-1 min-w-0 truncate text-[15px] font-bold" style={{ color: '#3A3226' }}>
                    {t.name}
                  </span>
                  <span className="text-[13px] shrink-0" style={{ color: '#A89880' }}>
                    {t.dist < 1 ? '여기' : `${Math.round(t.dist)}m`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
