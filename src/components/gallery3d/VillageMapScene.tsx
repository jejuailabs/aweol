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
import VillageMiniMap from './VillageMiniMap';
import type { PeerLook } from '@/lib/presence';
import {
  speedOf, warpTargets, vehicleById, VEHICLES, type WarpTarget,
} from '@/lib/village-travel';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

type XZ = [number, number];

export interface VillageData {
  c: [number, number];
  r: number;
  /**
   * 건물. `k` 는 **무엇인가** — OSM 의 amenity·historic·tourism
   * (townhall, post_office, police, memorial …). 없을 수 있다.
   * 나중에 관공서에 들어가 하는 일을 배우는 기능의 재료다.
   */
  b: { p: XZ[]; h: number; n?: string; k?: string }[];
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

/** 꾸민 건물 지붕에 쓰는 색. 이름을 씨앗 삼아 고른다. */
const ROOF_COLORS = ['#C4674F', '#7B4B94', '#E8A33C', '#3BAF9F', '#4A90D9'];

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

  /**
   * 이름 있는 건물 몇 채만 꾸민다.
   *
   * 수백 채를 다 꾸미면 프레임이 떨어진다. 이름 있는 곳은 어차피 몇 안 되고
   * 눈길이 가는 곳이라, **거기에만** 지붕·창문·간판을 얹는다.
   * 나머지는 상자 그대로 배경처럼 둔다.
   */
  const decor = useMemo(
    () =>
      list.map((b) => {
        if (!b.n) return null;
        const xs = b.p.map((p) => p[0]);
        const zs = b.p.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minZ = Math.min(...zs), maxZ = Math.max(...zs);
        return {
          cx: (minX + maxX) / 2,
          cz: (minZ + maxZ) / 2,
          w: maxX - minX,
          d: maxZ - minZ,
          // 이름을 씨앗 삼아 색을 고른다 — 같은 건물은 늘 같은 색
          hue: [...b.n].reduce((a, c) => a + c.charCodeAt(0), 0) % ROOF_COLORS.length,
        };
      }),
    [list]
  );

  return (
    <group>
      {geos.map((geo, i) => {
        const b = list[i];
        const named = !!b.n;
        const d = decor[i];
        return (
          <group key={i}>
            <mesh geometry={geo} castShadow receiveShadow>
              <meshStandardMaterial
                color={named ? '#F4E8D0' : '#E4DDD0'}
                roughness={0.9}
              />
            </mesh>

            {named && d && (
              <group position={[d.cx, 0, d.cz]}>
                {/* 지붕 — 건물 위에 얹는 판 */}
                <mesh position={[0, b.h + 0.12, 0]} castShadow>
                  <boxGeometry args={[d.w + 0.5, 0.35, d.d + 0.5]} />
                  <meshStandardMaterial color={ROOF_COLORS[d.hue]} roughness={0.75} />
                </mesh>
                {/* 창문 두 줄 — 앞면에 붙인다 */}
                {([0.35, 0.62] as const).map((fy) =>
                  ([-0.28, 0.28] as const).map((fx) => (
                    <mesh
                      key={`${fy}-${fx}`}
                      position={[fx * d.w, b.h * fy, d.d / 2 + 0.05]}
                    >
                      <planeGeometry args={[Math.min(1.1, d.w * 0.26), 1]} />
                      <meshStandardMaterial
                        color="#9FD4EE"
                        emissive="#9FD4EE"
                        emissiveIntensity={0.25}
                      />
                    </mesh>
                  ))
                )}
                {/* 문 */}
                <mesh position={[0, b.h * 0.16, d.d / 2 + 0.05]}>
                  <planeGeometry args={[Math.min(1.2, d.w * 0.28), b.h * 0.32]} />
                  <meshStandardMaterial color="#8A5A3B" />
                </mesh>
              </group>
            )}

            {named && (
              <Html
                position={[b.p[0][0], b.h + 2, b.p[0][1]]}
                center
                style={{ pointerEvents: 'none' }}
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
          /**
           * **바닥(y=0)과 같은 높이에 두면 안 된다.**
           * 두 면이 정확히 겹치면 깊이 버퍼가 어느 쪽이 앞인지 못 정해서
           * 카메라가 움직일 때마다 길이 **깜박거린다**(z-fighting).
           * 물·공원(`Areas`)이 0.02 에 있으므로 길은 그 위 0.04 에 깐다 —
           * 길이 공원을 가로지르는 것이 실제 모습이기도 하다.
           */
          pos: [(x0 + x1) / 2, 0.04, (z0 + z1) / 2],
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
/** 탈것 종류마다 색을 달리해 눈에 구별된다 */
const VEHICLE_COLORS: Record<string, { body: string; roof: string }> = {
  car: { body: '#E8604C', roof: '#F7C8C0' },
  'vehicle-scooter': { body: '#3BAF9F', roof: '#BFE8E0' },
  'vehicle-rocket': { body: '#7B4B94', roof: '#D8C4E4' },
};

function Car({ show, vehicleId }: { show: boolean; vehicleId: string | null }) {
  if (!show) return null;
  const c = VEHICLE_COLORS[vehicleId ?? 'car'] ?? VEHICLE_COLORS.car;
  return (
    <group position={[0, 0.02, 0]}>
      {/* 몸통 */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.25, 0.42, 2.1]} />
        <meshStandardMaterial color={c.body} roughness={0.55} />
      </mesh>
      {/* 지붕 */}
      <mesh position={[0, 0.68, -0.12]} castShadow>
        <boxGeometry args={[1.0, 0.36, 1.0]} />
        <meshStandardMaterial color={c.roof} roughness={0.5} />
      </mesh>
      {/* 로켓카는 뒤에 불꽃 */}
      {vehicleId === 'vehicle-rocket' && (
        <mesh position={[0, 0.3, 1.2]} rotation={[PI * 0.5, 0, 0]}>
          <coneGeometry args={[0.22, 0.6, 8]} />
          <meshStandardMaterial color="#FF8A3C" emissive="#FF6B00" emissiveIntensity={0.7} />
        </mesh>
      )}
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
  avatarPos, avatarYaw, show, vehicleId,
}: {
  avatarPos: React.RefObject<THREE.Vector3>;
  avatarYaw: React.RefObject<number>;
  show: boolean;
  vehicleId: string | null;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const p = avatarPos.current;
    if (!g.current || !p) return;
    g.current.position.set(p.x, 0, p.z);
    g.current.rotation.y = avatarYaw.current ?? 0;
  });
  return <group ref={g}><Car show={show} vehicleId={vehicleId} /></group>;
}

/*
  거리를 보고 걷기↔자동차를 저절로 바꾸던 `TravelWatcher` 는 지웠다.

  **편의로 넣은 자동 판단이 사람이 누른 것을 되돌렸다** — 멀리 나가서 '내리기' 를
  눌러도 다음 프레임에 거리 감시자가 다시 태워서 영영 못 내렸다.
  타고 내리는 것은 아이가 정한다.
*/

export default function VillageMapScene({
  data, schoolId, schoolName, me, avatarId, avatarCustom, avatarTint, onEnterSchool,
  ownedVehicles = [], vehicleId = null, onPickVehicle,
}: {
  data: VillageData;
  schoolId: string;
  schoolName: string;
  me: { uid: string; look: PeerLook } | null;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnterSchool: () => void;
  /** 이 아이가 가진 탈것 id 들(기본 자동차 말고 산 것) */
  ownedVehicles?: string[];
  /** 지금 고른 탈것 id. null 이면 기본 자동차. */
  vehicleId?: string | null;
  /** 탈것을 바꾸면 부른다. 저장은 부모(서버 호출)가 한다. */
  onPickVehicle?: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 30));
  const avatarYaw = useRef(0);
  /** 워프할 자리. WalkerAvatar 가 다음 프레임에 집어간다. */
  const teleport = useRef<THREE.Vector3 | null>(null);
  const [schoolHot, setSchoolHot] = useState(false);
  /**
   * 차를 탔나 — **버튼이 정한다. 그게 전부다.**
   *
   * 예전에는 학교에서 멀어지면 저절로 타지게 해뒀는데, 그 자동 판단이
   * 사람이 누른 것을 계속 되돌렸다: 멀리 나가서 '내리기' 를 눌러도 다음 프레임에
   * 거리 감시자가 다시 차를 태워서 **영영 못 내렸다.**
   *
   * 편의로 넣은 것이 사람 뜻을 이기면 그건 편의가 아니다. 타고 내리는 것은
   * 아이가 정한다 — 멀리서 걷고 싶으면 걷는 것이다.
   */
  const [riding, setRiding] = useState(false);
  const [warpOpen, setWarpOpen] = useState(false);
  /**
   * 지도를 연 **그 순간의 내 자리**.
   *
   * 아바타 좌표는 매 프레임 바뀌는 ref 라 그리는 중에 읽으면 안 된다
   * (읽는 시점마다 값이 달라 화면이 어긋난다). 지도는 어차피 멈춘 그림이므로
   * 여는 순간 한 번 베껴 둔다.
   */
  const [mePos, setMePos] = useState({ x: 0, z: 0 });
  /** 워프한 직후 잠깐 띄우는 말 */
  const [warpedTo, setWarpedTo] = useState('');

  /**
   * 화면에 띄울 이름표.
   *
   * 워프 목록과 같은 고르기(이름 있고, 서로 멀리 떨어진 것)를 쓴다.
   * 다만 더 촘촘히 — 걸어다니며 보는 것이라 워프보다는 많아도 된다.
   */
  const labelSpots = useMemo(
    () => warpTargets(data.poi, '', { max: 13, minGapM: 45 }).filter((t) => t.id !== 'school'),
    [data.poi]
  );

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
    teleport.current = new THREE.Vector3(t.x, 0, t.z + 6);
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

  /** 지금 고른 탈것. 속도·색이 여기서 나온다. */
  const vehicle = vehicleById(vehicleId);
  const [vehOpen, setVehOpen] = useState(false);

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
          {/*
            간판은 **학교 자리 바로 위**에 뜬다. 그래서 탭을 삼키면
            "학교 자리를 누르면 들어가요" 가 간판을 누른 사람에게는 거짓말이 된다.
            drei 의 `pointerEvents` prop 은 `transform` 모드에서만 먹는다 —
            `center` 모드에서는 **아무 일도 안 한다.** 그래서 style 로 직접 준다.
          */}
          <Html position={[0, 9, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
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

        {/*
          시설 이름표.
          30개를 다 띄웠더니 서로 겹쳐서 하나도 못 읽었다. 가까운 것만,
          그리고 **서로 떨어진 것만** 남긴다 — 워프 목록을 고를 때와 같은 방식이다.
          이름이 길면 잘라 쓴다(영문 병기까지 다 쓰면 화면을 가로지른다).
        */}
        {labelSpots.map((p, i) => (
          <Html key={i} position={[p.x, 3, p.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[3, 0]}>
            <div
              style={{
                background: 'rgba(255,255,255,0.85)', color: '#6B5B43',
                fontWeight: 700, fontSize: '12px', padding: '2px 7px',
                borderRadius: '999px', whiteSpace: 'nowrap',
                fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
              }}
            >
              📍 {p.name.length > 9 ? `${p.name.slice(0, 9)}…` : p.name}
            </div>
          </Html>
        ))}

        <CarRig avatarPos={avatarPos} avatarYaw={avatarYaw} show={riding} vehicleId={vehicleId} />

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -R, xMax: R, zMin: -R, zMax: R }}
          start={[0, 0, 30]}
          maxSpeed={speedOf(riding ? 'car' : 'walk', vehicle)}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          teleport={teleport}
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

      {/*
        오른쪽 아래 = 버튼 자리, 왼쪽 아래 = 조이스틱 자리.
        전에는 차 타기 버튼이 조이스틱 밑에 깔려 아예 안 보였다.
      */}
      <div className="pos-above-nav absolute right-4 z-30 flex flex-col items-end gap-2">
        <button
          onClick={() => setRiding((v) => !v)}
          className="rounded-full px-5 py-3 text-[15px] font-bold"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
        >
          {riding ? '🚶 내리기' : '🚗 타기'}
        </button>

        {/*
          탈것 고르기 — 산 게 있을 때만 나온다.
          기본 자동차뿐이면 고를 게 없으니 버튼도 안 만든다(빈 화면이 낫다).
        */}
        {ownedVehicles.length > 0 && (
          <button
            onClick={() => setVehOpen(true)}
            className="rounded-full px-5 py-2.5 text-[14px] font-bold"
            style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
          >
            {vehicle.emoji} {vehicle.label} 바꾸기
          </button>
        )}
      </div>

      {/* 탈것 고르는 시트 */}
      {vehOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(24,20,16,0.45)' }}
          onClick={() => setVehOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-t-3xl p-4 pad-bottom-safe"
            style={{ background: '#FAF5EA' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-black mb-3" style={{ color: '#3A3226' }}>🚗 무엇을 탈까?</div>
            <div className="flex flex-col gap-2">
              {VEHICLES.filter((v) => v.shopId === null || ownedVehicles.includes(v.shopId)).map((v) => {
                const on = (v.shopId ?? null) === vehicleId;
                return (
                  <button
                    key={v.shopId ?? 'car'}
                    onClick={() => { onPickVehicle?.(v.shopId); setVehOpen(false); }}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
                    style={on ? { background: 'var(--color-primary)', color: 'white' } : { background: 'white', color: '#3A3226' }}
                  >
                    <span className="text-[26px]">{v.emoji}</span>
                    <span className="flex-1 text-[15px] font-black">{v.label}</span>
                    {on && <span className="text-[14px] font-bold">타는 중</span>}
                  </button>
                );
              })}
            </div>
          </div>
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
        onClick={() => {
          // 누른 순간의 자리를 베낀다 — 이벤트 안에서 ref 를 읽는 건 안전하다
          if (!warpOpen) {
            setMePos({ x: avatarPos.current?.x ?? 0, z: avatarPos.current?.z ?? 0 });
          }
          setWarpOpen((v) => !v);
        }}
        className="pos-above-joystick absolute right-4 z-30 rounded-full px-5 py-3 text-[15px] font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        {warpOpen ? '✕ 닫기' : '🗺️ 지도 보기'}
      </button>

      {/*
        전체 지도 — **글자 목록이 아니라 지도다.**

        예전에는 '한담해변 · 320m' 처럼 이름과 거리를 적어줬는데, 아이는 그 이름이
        어디쯤인지 모른다. 자기가 지금 어디 서 있는지도 모르는 채로 이름만 골랐다.
        동네가 800m 로 넓어지면서 더 심해졌다.

        마을을 그리려고 **이미 손에 든 좌표**를 한 번 더 그릴 뿐이라 새로 받는 것이 없다.
      */}
      {warpOpen && (
        <VillageMiniMap
          radius={data.r}
          roads={data.rd}
          buildings={data.b}
          me={mePos}
          targets={targets}
          onWarp={warpTo}
          onClose={() => setWarpOpen(false)}
        />
      )}
    </div>
  );
}
