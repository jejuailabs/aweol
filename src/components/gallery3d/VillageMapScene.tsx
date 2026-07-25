'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import Peers from './Peers';
import VillageMiniMap from './VillageMiniMap';
import type { PeerLook } from '@/lib/presence';
import { civicKindOf, type CivicPlace } from '@/lib/civic-places';
import { WALKABLE_KM, type LocalSite } from '@/lib/local-sites';
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

/**
 * 배경 건물 벽색.
 * 수백 채가 전부 같은 베이지면 설계도처럼 보인다 — 미묘하게 다른
 * 흙·모래 계열 몇 가지를 돌려 쓰면 동네처럼 보인다. 비용은 0이다
 * (어차피 건물마다 재질이 하나씩이다).
 */
const WALL_COLORS = ['#EFE5D3', '#E6DAC5', '#E9DFCE', '#DFD3BE', '#F0E7D6', '#E2D8C8'];

/** 건물 바닥 다각형을 세운다 */
function Buildings({ list, onEnterPlace, places }: {
  list: VillageData['b'];
  /** 관공서 문을 눌렀을 때 (우체국·읍사무소 …). 없으면 문이 안 눌린다. */
  onEnterPlace?: (kind: string) => void;
  /** 이 학교의 기관들 — 학교가 새로 만든 곳도 문이 열려야 한다 */
  places?: CivicPlace[];
}) {
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

  /**
   * 지붕 — **건물 모양 그대로** 얹는다.
   *
   * 예전에는 건물을 감싸는 사각형으로 덮었다. 그런데 실제 건물은 ㄷ자·ㄱ자가 흔하다:
   * 애월읍사무소는 점이 16개인데 가로 50.7m × 세로 27.1m 상자로 덮으면
   * **실제 넓이가 그 상자의 71% 뿐이라 나머지 29% 가 허공에 뜬 빨간 판**으로 남는다.
   * 실제로 마을에 그렇게 떠 있었다.
   *
   * 그래서 건물과 같은 다각형을 얇게 뽑아 얹는다. 처마(살짝 넓게)는 포기했다 —
   * 임의의 다각형을 바깥으로 넓히는 건 이 화면이 감당할 계산이 아니고,
   * **허공에 뜬 판보다 처마 없는 지붕이 낫다.**
   */
  const roofs = useMemo(
    () =>
      list.map((b) => {
        if (!b.n) return null;
        const shape = new THREE.Shape();
        b.p.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
        geo.rotateX(-PI / 2);
        return geo;
      }),
    [list]
  );
  useEffect(() => () => roofs.forEach((g) => g?.dispose()), [roofs]);

  /**
   * 이름 없는 배경 건물에도 지붕을 얹는다 — **전부 합쳐 메시 하나로.**
   *
   * 지붕이 없으면 위에서 볼 때 벽색 그대로 잘린 상자라 설계도처럼 보인다.
   * 그렇다고 수백 채에 메시를 하나씩 더하면 드로우콜이 두 배가 된다.
   * 색이 다 같아도 되는 배경 지붕이므로 지오메트리를 병합해 한 번에 그린다.
   */
  const plainRoofs = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const b of list) {
      if (b.n) continue;
      const shape = new THREE.Shape();
      b.p.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      g.rotateX(-PI / 2);
      g.translate(0, b.h + 0.02, 0);
      parts.push(g);
    }
    if (!parts.length) return null;
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    return merged;
  }, [list]);
  useEffect(() => () => { plainRoofs?.dispose(); }, [plainRoofs]);

  return (
    <group>
      {plainRoofs && (
        <mesh geometry={plainRoofs} castShadow>
          <meshStandardMaterial color="#B7A78D" roughness={0.9} />
        </mesh>
      )}
      {geos.map((geo, i) => {
        const b = list[i];
        const named = !!b.n;
        const d = decor[i];
        /**
         * 들어가 볼 수 있는 기관인가.
         * 태그(`k`)가 없으면 **이름으로도 알아본다** — 한국 OSM 은 태그가 성겨서
         * '애월읍사무소' 가 이름만 있는 상자로 들어와 있는 경우가 흔하다.
         */
        const civicKind = civicKindOf(b, places);
        return (
          <group key={i}>
            <mesh geometry={geo} castShadow receiveShadow>
              <meshStandardMaterial
                color={named ? '#F7ECD8' : WALL_COLORS[i % WALL_COLORS.length]}
                roughness={0.9}
              />
            </mesh>

            {/* 지붕은 건물 좌표계 그대로다 — 아래 group 안에 넣으면 두 번 옮겨진다 */}
            {named && roofs[i] && (
              <mesh geometry={roofs[i]!} position={[0, b.h + 0.12, 0]} castShadow>
                <meshStandardMaterial color={ROOF_COLORS[d?.hue ?? 0]} roughness={0.75} />
              </mesh>
            )}

            {named && d && (() => {
              const bType = civicKind || b.k || '';
              return (
              <group position={[d.cx, 0, d.cz]}>
                {/* 창문 두 줄 — 틀을 두르고 유리를 끼운다. 틀이 없으면 벽에 뚫린 구멍 같다. */}
                {([0.35, 0.62] as const).map((fy) =>
                  ([-0.28, 0.28] as const).map((fx) => (
                    <group key={`${fy}-${fx}`} position={[fx * d.w, b.h * fy, d.d / 2 + 0.05]}>
                      <mesh position={[0, 0, -0.01]}>
                        <planeGeometry args={[Math.min(1.3, d.w * 0.3), 1.2]} />
                        <meshStandardMaterial color="#8C7A60" roughness={0.85} />
                      </mesh>
                      <mesh>
                        <planeGeometry args={[Math.min(1.1, d.w * 0.26), 1]} />
                        <meshStandardMaterial
                          color="#BEE6F7"
                          emissive="#9FD4EE"
                          emissiveIntensity={0.35}
                        />
                      </mesh>
                    </group>
                  ))
                )}
                {/* 문틀 */}
                <mesh position={[0, b.h * 0.16, d.d / 2 + 0.04]}>
                  <planeGeometry args={[Math.min(1.45, d.w * 0.33), b.h * 0.36]} />
                  <meshStandardMaterial color="#6E5335" roughness={0.85} />
                </mesh>
                <mesh
                  position={[0, b.h * 0.16, d.d / 2 + 0.05]}
                  onClick={civicKind && onEnterPlace
                    ? (e) => { e.stopPropagation(); onEnterPlace(civicKind); }
                    : undefined}
                  onPointerOver={civicKind ? (e) => {
                    e.stopPropagation(); document.body.style.cursor = 'pointer';
                  } : undefined}
                  onPointerOut={civicKind ? () => { document.body.style.cursor = 'auto'; } : undefined}
                >
                  <planeGeometry args={[Math.min(1.2, d.w * 0.28), b.h * 0.32]} />
                  <meshStandardMaterial
                    color={civicKind ? '#B5793F' : '#8A5A3B'}
                    emissive={civicKind ? '#E8A33C' : '#000000'}
                    emissiveIntensity={civicKind ? 0.35 : 0}
                  />
                </mesh>
                {/* 현관 계단 — 문 앞에 낮은 단이 있으면 문이 '진짜 입구'처럼 읽힌다 */}
                <mesh position={[0, 0.09, d.d / 2 + 0.45]} castShadow receiveShadow>
                  <boxGeometry args={[Math.min(1.8, d.w * 0.4), 0.18, 0.8]} />
                  <meshStandardMaterial color="#C9BCA4" roughness={0.9} />
                </mesh>
                {/* 들어갈 수 있는 곳은 현관 지붕까지 — 눈에 띄어야 눌러본다 */}
                {civicKind && (
                  <mesh position={[0, b.h * 0.36, d.d / 2 + 0.55]} castShadow>
                    <boxGeometry args={[Math.min(2.2, d.w * 0.45), 0.14, 1.1]} />
                    <meshStandardMaterial color={ROOF_COLORS[d.hue]} roughness={0.75} />
                  </mesh>
                )}

                {/* ── 건물 타입별 외관 특징 ── */}
                {bType === 'post_office' && (
                  <mesh position={[d.w / 2 + 0.8, 0.7, d.d / 2 - 0.5]} castShadow>
                    <cylinderGeometry args={[0.3, 0.3, 1.4, 8]} />
                    <meshStandardMaterial color="#E8604C" roughness={0.6} />
                  </mesh>
                )}
                {bType === 'police' && (
                  <mesh position={[0, b.h + 0.7, 0]} castShadow>
                    <cylinderGeometry args={[0.2, 0.2, 0.5, 8]} />
                    <meshStandardMaterial color="#E8604C" emissive="#FF0000" emissiveIntensity={0.4} />
                  </mesh>
                )}
                {bType === 'library' && (
                  <>
                    {([-d.d * 0.3, 0, d.d * 0.3] as const).map((bz) => (
                      <mesh key={bz} position={[-d.w / 2 - 0.05, b.h * 0.5, bz]}>
                        <planeGeometry args={[0.1, b.h * 0.6]} />
                        <meshStandardMaterial color="#9FD4EE" emissive="#9FD4EE" emissiveIntensity={0.15} />
                      </mesh>
                    ))}
                  </>
                )}
                {bType === 'health' && (
                  <>
                    <mesh position={[0, b.h * 0.75, d.d / 2 + 0.06]}>
                      <planeGeometry args={[0.5, 1.2]} />
                      <meshStandardMaterial color="#E8604C" />
                    </mesh>
                    <mesh position={[0, b.h * 0.75, d.d / 2 + 0.06]}>
                      <planeGeometry args={[1.2, 0.5]} />
                      <meshStandardMaterial color="#E8604C" />
                    </mesh>
                  </>
                )}
                {bType === 'nonghyup' && (
                  <>
                    <mesh position={[d.w / 2 + 0.6, 0.3, 0]} castShadow>
                      <boxGeometry args={[0.8, 0.6, 0.6]} />
                      <meshStandardMaterial color="#C9A46B" roughness={0.95} />
                    </mesh>
                    <mesh position={[d.w / 2 + 0.6, 0.75, 0]}>
                      <sphereGeometry args={[0.22, 6, 4]} />
                      <meshStandardMaterial color="#4CAF50" />
                    </mesh>
                  </>
                )}
                {bType === 'fuel' && (
                  <>
                    <mesh position={[0, b.h + 1.5, d.d / 2 + 3]} castShadow>
                      <boxGeometry args={[Math.min(d.w * 0.8, 6), 0.25, 3.5]} />
                      <meshStandardMaterial color="#EEEEEE" roughness={0.5} />
                    </mesh>
                    {([-1.5, 1.5] as const).map((px) => (
                      <mesh key={px} position={[px, (b.h + 1.5) / 2, d.d / 2 + 3]} castShadow>
                        <cylinderGeometry args={[0.12, 0.12, b.h + 1.5, 6]} />
                        <meshStandardMaterial color="#AAAAAA" metalness={0.3} roughness={0.5} />
                      </mesh>
                    ))}
                    <mesh position={[0, 0.9, d.d / 2 + 3]} castShadow>
                      <boxGeometry args={[0.5, 1.6, 0.4]} />
                      <meshStandardMaterial color="#E8A33C" roughness={0.6} />
                    </mesh>
                  </>
                )}
                {(bType === 'convenience' || bType === 'cafe'
                  || bType === 'restaurant' || bType === 'fast_food') && (() => {
                  const awnColor = bType === 'convenience' ? '#3BA89F'
                    : bType === 'cafe' ? '#C97B4B' : '#E8604C';
                  const awnW = Math.min(d.w * 0.9, 5);
                  return (
                    <>
                      {/* 경사진 차양 — 평평한 판보다 가게처럼 보인다 */}
                      <mesh
                        position={[0, b.h * 0.4, d.d / 2 + 0.55]}
                        rotation={[0.4, 0, 0]}
                        castShadow
                      >
                        <boxGeometry args={[awnW, 0.1, 1.2]} />
                        <meshStandardMaterial color={awnColor} roughness={0.7} />
                      </mesh>
                      {/* 차양 앞단 흰 줄 — 줄무늬 천의 인상만 낸다 */}
                      <mesh position={[0, b.h * 0.4 - 0.24, d.d / 2 + 1.1]} rotation={[0.4, 0, 0]}>
                        <boxGeometry args={[awnW, 0.11, 0.25]} />
                        <meshStandardMaterial color="#FFF6E4" roughness={0.7} />
                      </mesh>
                    </>
                  );
                })()}
                {bType === 'bank' && (
                  <>
                    <mesh position={[-d.w / 4, b.h + 0.4, 0]} castShadow>
                      <boxGeometry args={[d.w * 0.3, 0.6, Math.min(d.d * 0.5, 2)]} />
                      <meshStandardMaterial color="#2E5A88" roughness={0.6} />
                    </mesh>
                    <mesh position={[d.w / 4, b.h + 0.4, 0]} castShadow>
                      <boxGeometry args={[d.w * 0.3, 0.6, Math.min(d.d * 0.5, 2)]} />
                      <meshStandardMaterial color="#2E5A88" roughness={0.6} />
                    </mesh>
                  </>
                )}
              </group>
              );
            })()}

            {named && (
              <Html
                position={[b.p[0][0], b.h + 2, b.p[0][1]]}
                center
                /**
                 * **간판이 곧 버튼이다.**
                 *
                 * 처음에는 간판을 장식으로 두고(`pointerEvents: 'none'`) 건물 앞면의
                 * 작은 문만 눌리게 했다. 그런데 간판에 '들어가기 ›' 라고 써 붙였으니
                 * 누구나 간판을 누른다 — 그리고 아무 일도 안 일어났다.
                 * 문은 건물 뒤편에 있으면 보이지도 않는다.
                 * **눌러보라고 적힌 것은 눌려야 한다.**
                 */
                style={{ pointerEvents: civicKind && onEnterPlace ? 'auto' : 'none' }}
                zIndexRange={[4, 0]}
              >
                <div
                  onClick={civicKind && onEnterPlace ? () => onEnterPlace(civicKind) : undefined}
                  style={{
                    background: civicKind ? '#FFF1D6' : 'rgba(255,248,231,0.94)',
                    color: '#5B4A3B',
                    fontWeight: 800, fontSize: '14px', padding: '3px 10px',
                    borderRadius: '999px', whiteSpace: 'nowrap',
                    fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                    border: civicKind ? '2px solid #E8A33C' : 'none',
                    cursor: civicKind ? 'pointer' : 'default',
                  }}
                >
                  {b.n}
                  {/* 들어갈 수 있는 곳은 그렇다고 말해준다 — 안 그러면 아무도 안 누른다 */}
                  {civicKind && (
                    <span style={{ color: '#A6762A', marginLeft: '6px', fontSize: '12px' }}>
                      들어가기 ›
                    </span>
                  )}
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
      {/* 큰길에만 중앙선을 긋는다 — 골목까지 그으면 온 동네가 도로가 된다 */}
      {pieces.filter((p) => p.w >= 8).map((p, i) => (
        <mesh
          key={`c${i}`}
          position={[p.pos[0], 0.05, p.pos[2]]}
          rotation={[NEG_HALF_PI, 0, p.rot]}
        >
          <planeGeometry args={[0.3, p.len]} />
          <meshStandardMaterial color="#FFF3D0" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 마을 환경 에셋 — 나무·가로등·벤치·화단·돌담 등.
 *
 * 빈 풀밭 위에 건물 상자만 있으면 마을이 아니라 설계도다.
 * 건물 사이에 나무가 서고, 길가에 가로등이 서야 동네 같아진다.
 *
 * 에셋은 씨앗으로 뿌린다 — 건물·길과 겹치지 않도록 건물 좌표를 피한다.
 */
function VillageProps({ radius, buildings }: {
  radius: number;
  buildings: { p: XZ[]; h: number }[];
}) {
  const items = useMemo(() => {
    const bboxes = buildings.map((b) => {
      const xs = b.p.map((p) => p[0]);
      const zs = b.p.map((p) => p[1]);
      return {
        minX: Math.min(...xs) - 3, maxX: Math.max(...xs) + 3,
        minZ: Math.min(...zs) - 3, maxZ: Math.max(...zs) + 3,
      };
    });
    // 학교 앞마당(운동장·놀이터)은 SchoolYard 가 따로 꾸민다 — 흩뿌리지 않는다
    const blocked = (x: number, z: number) =>
      bboxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)
      || (Math.abs(x) < 26 && Math.abs(z) < 34);

    const seeded = (i: number) => {
      let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h ^ 0x12345, 0xc2b2ae35); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };

    const out: { kind: string; x: number; z: number; r: number; s: number }[] = [];
    const R = radius * 0.9;

    /**
     * 반경이 800m 로 넓어져 면적이 네 배가 됐다 — 220개 그대로면 휑하다.
     * 380개로 올리고, 제주다운 것들(돌하르방·정자·밭·허수아비)과
     * 동물(고양이·닭)을 섞는다. 건물 뒷골목에도 뿌려지므로
     * **돌아다니면 자꾸 뭔가 나온다.**
     */
    for (let i = 0; i < 380; i++) {
      const x = (seeded(i * 3) - 0.5) * R * 2;
      const z = (seeded(i * 3 + 1) - 0.5) * R * 2;
      if (blocked(x, z)) continue;
      const roll = seeded(i * 3 + 2);
      const r = seeded(i * 7) * PI * 2;
      if (roll < 0.30) out.push({ kind: 'tree', x, z, r, s: 0.7 + seeded(i * 5) * 0.6 });
      else if (roll < 0.40) out.push({ kind: 'palm', x, z, r, s: 0.8 + seeded(i * 5) * 0.5 });
      else if (roll < 0.46) out.push({ kind: 'lamp', x, z, r, s: 1 });
      else if (roll < 0.51) out.push({ kind: 'bench', x, z, r, s: 1 });
      else if (roll < 0.57) out.push({ kind: 'flower', x, z, r, s: 0.8 + seeded(i * 5) * 0.4 });
      else if (roll < 0.60) out.push({ kind: 'hydrant', x, z, r, s: 1 });
      else if (roll < 0.65) out.push({ kind: 'rock', x, z, r, s: 0.6 + seeded(i * 5) * 0.8 });
      else if (roll < 0.70) out.push({ kind: 'bush', x, z, r, s: 0.7 + seeded(i * 5) * 0.5 });
      else if (roll < 0.73) out.push({ kind: 'sign', x, z, r, s: 1 });
      else if (roll < 0.76) out.push({ kind: 'bin', x, z, r, s: 1 });
      else if (roll < 0.80) out.push({ kind: 'fence', x, z, r, s: 1 });
      else if (roll < 0.83) out.push({ kind: 'wall', x, z, r, s: 0.8 + seeded(i * 5) * 0.4 });
      else if (roll < 0.87) out.push({ kind: 'garden', x, z, r, s: 0.9 + seeded(i * 5) * 0.4 });
      else if (roll < 0.90) out.push({ kind: 'hay', x, z, r, s: 0.8 + seeded(i * 5) * 0.5 });
      else if (roll < 0.92) out.push({ kind: 'scare', x, z, r, s: 1 });
      else if (roll < 0.94) out.push({ kind: 'dol', x, z, r, s: 0.9 + seeded(i * 5) * 0.4 });
      else if (roll < 0.965) out.push({ kind: 'cat', x, z, r, s: 0.9 + seeded(i * 5) * 0.3 });
      else if (roll < 0.985) out.push({ kind: 'chick', x, z, r, s: 1 });
      else out.push({ kind: 'gazebo', x, z, r, s: 1 });
    }
    return out;
  }, [radius, buildings]);

  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0, it.z]} rotation={[0, it.r, 0]} scale={it.s}>
          {it.kind === 'tree' && (
            <>
              {/* 덩어리 하나면 사탕처럼 보인다 — 크기·색이 다른 세 덩어리를 겹친다 */}
              <mesh position={[0, 0.9, 0]} castShadow>
                <cylinderGeometry args={[0.22, 0.4, 1.8, 6]} />
                <meshStandardMaterial color="#8B6C47" roughness={0.9} />
              </mesh>
              <mesh position={[0, 2.4, 0]} castShadow>
                <sphereGeometry args={[1.9, 8, 6]} />
                <meshStandardMaterial color="#55A24B" roughness={0.95} />
              </mesh>
              <mesh position={[0.9, 3.1, 0.3]} castShadow>
                <sphereGeometry args={[1.15, 7, 5]} />
                <meshStandardMaterial color="#66B458" roughness={0.95} />
              </mesh>
              <mesh position={[-0.8, 3.3, -0.4]} castShadow>
                <sphereGeometry args={[0.95, 7, 5]} />
                <meshStandardMaterial color="#4C9443" roughness={0.95} />
              </mesh>
            </>
          )}
          {it.kind === 'palm' && (
            <>
              <mesh position={[0, 1.6, 0]} castShadow>
                <cylinderGeometry args={[0.15, 0.3, 3.2, 6]} />
                <meshStandardMaterial color="#A08060" roughness={0.9} />
              </mesh>
              {/* 잎 다섯 장을 바깥으로 눕혀 방사형으로 편다 */}
              {[0, 1, 2, 3, 4].map((n) => (
                <group key={n} rotation={[0, (n / 5) * PI * 2, 0]}>
                  <mesh position={[0.85, 3.2, 0]} rotation={[0, 0, -1.05]} castShadow>
                    <coneGeometry args={[0.42, 1.9, 4]} />
                    <meshStandardMaterial color="#3D8B37" roughness={0.92} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 3.25, 0]}>
                <sphereGeometry args={[0.3, 6, 5]} />
                <meshStandardMaterial color="#7A5C40" roughness={0.9} />
              </mesh>
            </>
          )}
          {it.kind === 'lamp' && (
            <>
              <mesh position={[0, 2.2, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.12, 4.4, 6]} />
                <meshStandardMaterial color="#7A7A7A" metalness={0.4} roughness={0.5} />
              </mesh>
              <mesh position={[0, 4.6, 0]}>
                <sphereGeometry args={[0.35, 8, 6]} />
                <meshStandardMaterial color="#FFFDE0" emissive="#FFFDE0" emissiveIntensity={0.3} />
              </mesh>
            </>
          )}
          {it.kind === 'bench' && (
            <>
              <mesh position={[0, 0.35, 0]} castShadow>
                <boxGeometry args={[1.6, 0.12, 0.55]} />
                <meshStandardMaterial color="#A07E55" roughness={0.85} />
              </mesh>
              {([-0.6, 0.6] as const).map((bx) => (
                <mesh key={bx} position={[bx, 0.15, 0]} castShadow>
                  <boxGeometry args={[0.12, 0.3, 0.45]} />
                  <meshStandardMaterial color="#6B5B43" roughness={0.9} />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'flower' && (
            <>
              <mesh position={[0, 0.2, 0]} castShadow>
                <cylinderGeometry args={[0.5, 0.45, 0.4, 8]} />
                <meshStandardMaterial color="#C9946B" roughness={0.9} />
              </mesh>
              {[0, 1.2, 2.4, 3.6, 4.8].map((a) => (
                <mesh key={a} position={[Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3]}>
                  <sphereGeometry args={[0.18, 6, 4]} />
                  <meshStandardMaterial color={['#E8604C', '#E8A33C', '#D86CB0', '#7B4B94', '#3BAF9F'][Math.floor(a / 1.2)]} />
                </mesh>
              ))}
              <mesh position={[0, 0.45, 0]}>
                <sphereGeometry args={[0.4, 6, 4]} />
                <meshStandardMaterial color="#4CAF50" roughness={0.9} />
              </mesh>
            </>
          )}
          {it.kind === 'hydrant' && (
            <>
              <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[0.15, 0.18, 0.7, 8]} />
                <meshStandardMaterial color="#E8604C" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.75, 0]}>
                <sphereGeometry args={[0.18, 8, 6]} />
                <meshStandardMaterial color="#C0392B" roughness={0.6} />
              </mesh>
            </>
          )}
          {it.kind === 'rock' && (
            <mesh position={[0, 0.3, 0]} castShadow>
              <dodecahedronGeometry args={[0.6, 0]} />
              <meshStandardMaterial color="#9A9188" roughness={1} />
            </mesh>
          )}
          {it.kind === 'bush' && (
            <mesh position={[0, 0.5, 0]} castShadow>
              <sphereGeometry args={[0.8, 6, 5]} />
              <meshStandardMaterial color="#4A8F40" roughness={0.95} />
            </mesh>
          )}
          {it.kind === 'sign' && (
            <>
              <mesh position={[0, 0.7, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
                <meshStandardMaterial color="#7A7A7A" roughness={0.6} />
              </mesh>
              <mesh position={[0, 1.5, 0]} castShadow>
                <boxGeometry args={[0.6, 0.4, 0.06]} />
                <meshStandardMaterial color="#3A6EA5" roughness={0.7} />
              </mesh>
            </>
          )}
          {it.kind === 'bin' && (
            <mesh position={[0, 0.35, 0]} castShadow>
              <cylinderGeometry args={[0.22, 0.25, 0.7, 8]} />
              <meshStandardMaterial color="#5A7A5A" roughness={0.7} />
            </mesh>
          )}
          {it.kind === 'fence' && (
            <>
              {([-0.7, 0, 0.7] as const).map((fx) => (
                <mesh key={fx} position={[fx, 0.35, 0]} castShadow>
                  <boxGeometry args={[0.08, 0.7, 0.08]} />
                  <meshStandardMaterial color="#A07E55" roughness={0.85} />
                </mesh>
              ))}
              <mesh position={[0, 0.55, 0]}>
                <boxGeometry args={[1.6, 0.08, 0.06]} />
                <meshStandardMaterial color="#C9A46B" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.35, 0]}>
                <boxGeometry args={[1.6, 0.08, 0.06]} />
                <meshStandardMaterial color="#C9A46B" roughness={0.85} />
              </mesh>
            </>
          )}
          {it.kind === 'wall' && (
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
              <boxGeometry args={[2.5, 1, 0.5]} />
              <meshStandardMaterial color="#9A9188" roughness={1} />
            </mesh>
          )}
          {it.kind === 'garden' && (
            <>
              <mesh position={[0, 0.06, 0]} receiveShadow>
                <boxGeometry args={[3.2, 0.12, 2.2]} />
                <meshStandardMaterial color="#8A6B4A" roughness={1} />
              </mesh>
              {([-0.7, 0, 0.7] as const).map((gz) => (
                <mesh key={gz} position={[0, 0.2, gz]} castShadow>
                  <boxGeometry args={[2.8, 0.18, 0.35]} />
                  <meshStandardMaterial color="#4E9845" roughness={0.95} />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'hay' && (
            <mesh position={[0, 0.7, 0]} castShadow>
              <coneGeometry args={[0.9, 1.4, 8]} />
              <meshStandardMaterial color="#D9B96C" roughness={1} />
            </mesh>
          )}
          {it.kind === 'scare' && (
            <>
              <mesh position={[0, 0.9, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.06, 1.8, 5]} />
                <meshStandardMaterial color="#8B6C47" roughness={0.9} />
              </mesh>
              <mesh position={[0, 1.35, 0]} castShadow>
                <boxGeometry args={[1.6, 0.1, 0.1]} />
                <meshStandardMaterial color="#8B6C47" roughness={0.9} />
              </mesh>
              <mesh position={[0, 1.85, 0]}>
                <sphereGeometry args={[0.28, 7, 5]} />
                <meshStandardMaterial color="#F0D9A8" roughness={0.9} />
              </mesh>
              <mesh position={[0, 2.12, 0]} castShadow>
                <coneGeometry args={[0.38, 0.35, 7]} />
                <meshStandardMaterial color="#C97B4B" roughness={0.9} />
              </mesh>
            </>
          )}
          {it.kind === 'dol' && (
            <>
              {/* 돌하르방 — 현무암빛 몸통·머리·벙거지, 눈 두 점 */}
              <mesh position={[0, 0.45, 0]} castShadow>
                <cylinderGeometry args={[0.34, 0.42, 0.9, 8]} />
                <meshStandardMaterial color="#6E6862" roughness={1} />
              </mesh>
              <mesh position={[0, 1.12, 0]} castShadow>
                <sphereGeometry args={[0.33, 8, 6]} />
                <meshStandardMaterial color="#6E6862" roughness={1} />
              </mesh>
              <mesh position={[0, 1.47, 0]} castShadow>
                <cylinderGeometry args={[0.24, 0.36, 0.3, 8]} />
                <meshStandardMaterial color="#5E5852" roughness={1} />
              </mesh>
              {([-0.12, 0.12] as const).map((ex) => (
                <mesh key={ex} position={[ex, 1.18, 0.28]}>
                  <sphereGeometry args={[0.055, 5, 4]} />
                  <meshStandardMaterial color="#3A3632" roughness={1} />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'cat' && (() => {
            const fur = it.s > 1.05 ? '#8A8A8A' : '#E8A33C';
            return (
              <>
                <mesh position={[0, 0.26, 0]} castShadow>
                  <sphereGeometry args={[0.3, 7, 5]} />
                  <meshStandardMaterial color={fur} roughness={0.95} />
                </mesh>
                <mesh position={[0, 0.55, 0.18]} castShadow>
                  <sphereGeometry args={[0.2, 7, 5]} />
                  <meshStandardMaterial color={fur} roughness={0.95} />
                </mesh>
                {([-0.1, 0.1] as const).map((ex) => (
                  <mesh key={ex} position={[ex, 0.73, 0.18]}>
                    <coneGeometry args={[0.07, 0.14, 4]} />
                    <meshStandardMaterial color={fur} roughness={0.95} />
                  </mesh>
                ))}
                <mesh position={[0, 0.36, -0.34]} rotation={[0.9, 0, 0]}>
                  <cylinderGeometry args={[0.045, 0.06, 0.5, 5]} />
                  <meshStandardMaterial color={fur} roughness={0.95} />
                </mesh>
              </>
            );
          })()}
          {it.kind === 'chick' && (
            <>
              <mesh position={[0, 0.3, 0]} castShadow>
                <sphereGeometry args={[0.28, 7, 5]} />
                <meshStandardMaterial color="#F5F0E4" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.58, 0.14]}>
                <sphereGeometry args={[0.16, 7, 5]} />
                <meshStandardMaterial color="#F5F0E4" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.74, 0.14]}>
                <boxGeometry args={[0.06, 0.12, 0.16]} />
                <meshStandardMaterial color="#E8604C" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.56, 0.31]} rotation={[1.4, 0, 0]}>
                <coneGeometry args={[0.05, 0.14, 4]} />
                <meshStandardMaterial color="#E8A33C" roughness={0.8} />
              </mesh>
            </>
          )}
          {it.kind === 'gazebo' && (
            <>
              {/* 정자 — 육각 마루와 기둥, 뾰족 지붕 */}
              <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[1.9, 1.9, 0.25, 6]} />
                <meshStandardMaterial color="#A07E55" roughness={0.9} />
              </mesh>
              {[0, 1, 2, 3, 4, 5].map((n) => {
                const a = (n / 6) * PI * 2;
                return (
                  <mesh key={n} position={[Math.cos(a) * 1.55, 1.2, Math.sin(a) * 1.55]} castShadow>
                    <cylinderGeometry args={[0.08, 0.08, 1.8, 6]} />
                    <meshStandardMaterial color="#8B5A3B" roughness={0.9} />
                  </mesh>
                );
              })}
              <mesh position={[0, 2.6, 0]} castShadow>
                <coneGeometry args={[2.4, 1.1, 6]} />
                <meshStandardMaterial color="#B0603F" roughness={0.85} />
              </mesh>
            </>
          )}
        </group>
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
            color={list[i].k === 'water' ? '#6FC5E8' : '#9FDD97'}
            roughness={list[i].k === 'water' ? 0.25 : 0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 바닥 — 단색 대신 잔디 점이 찍힌 타일 텍스처를 깐다.
 *
 * 단색 초록 한 장은 게임이 아니라 도면처럼 보인다. 캔버스에 점을 찍어
 * 작은 텍스처 하나를 만들고 반복해 깐다 — 파일도, 네트워크도 필요 없다.
 */
function Ground({ R }: { R: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#A8DDA0';
    ctx.fillRect(0, 0, 256, 256);
    const tones = ['#9ED596', '#B2E3AA', '#98CE90', '#ACDFA4'];
    for (let i = 0; i < 1000; i++) {
      ctx.fillStyle = tones[i % 4];
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // 타일 한 장 ≈ 12m — 걷는 눈높이에서 점이 보슬보슬 보이는 크기
    t.repeat.set((R * 2 + 200) / 12, (R * 2 + 200) / 12);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [R]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);
  return (
    <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
      <planeGeometry args={[R * 2 + 200, R * 2 + 200]} />
      {tex
        ? <meshStandardMaterial map={tex} roughness={0.95} />
        : <meshStandardMaterial color="#A8DDA0" roughness={0.95} />}
    </mesh>
  );
}

/**
 * 지평선 — 마을 밖에 낮은 언덕들과 한라산을 세운다.
 *
 * 마을 끝에서 초록 판이 뚝 끊기면 세상의 끝처럼 보인다. 안개 속에
 * 오름 능선이 비치면 '섬 마을'이 된다. 한라산은 남동쪽 — 애월에서
 * 실제로 보이는 방향이다.
 */
function Horizon({ R }: { R: number }) {
  const hills = useMemo(() => {
    const out: { x: number; z: number; r: number; h: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + 0.26;
      const dist = R * (1.18 + (i % 3) * 0.12);
      out.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        r: R * 0.14 + (i % 4) * R * 0.04,
        h: R * 0.045 + (i % 3) * R * 0.02,
      });
    }
    return out;
  }, [R]);
  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.h / 2 - 0.5, h.z]}>
          <coneGeometry args={[h.r, h.h, 7]} />
          <meshStandardMaterial color="#7FBF77" roughness={1} />
        </mesh>
      ))}
      {/* 한라산 — 남동쪽 멀리, 안개 너머 실루엣으로 */}
      <mesh position={[R * 0.9, R * 0.19, R * 1.7]}>
        <coneGeometry args={[R * 0.85, R * 0.4, 9]} />
        <meshStandardMaterial color="#6FA982" roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * 학교 앞마당 — 원점(학교 자리) 둘레를 운동장·놀이터로 꾸민다.
 *
 * 아이가 처음 떨어지는 자리가 여기다. 마을 한가운데가 빈 잔디면
 * 게임이 아니라 지도다 — 여기가 제일 먼저 '게임'처럼 보여야 한다.
 * 실제 학교 건물(OSM)의 위치는 학교마다 다르므로,
 * **건물과 겹치는 시설은 그 학교에서는 조용히 뺀다.**
 */
function SchoolYard({ buildings }: { buildings: { p: XZ[] }[] }) {
  const isBlocked = useMemo(() => {
    const boxes = buildings.map((b) => {
      const xs = b.p.map((p) => p[0]);
      const zs = b.p.map((p) => p[1]);
      return {
        minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1,
        minZ: Math.min(...zs) - 1, maxZ: Math.max(...zs) + 1,
      };
    });
    return (x: number, z: number) =>
      boxes.some((bb) => x >= bb.minX && x <= bb.maxX && z >= bb.minZ && z <= bb.maxZ);
  }, [buildings]);

  // 트랙은 커서 다섯 점을 짚어본다 — 한 점이라도 건물에 닿으면 안 깐다
  const trackOk = useMemo(
    () => [[0, 19], [10.5, 19], [-10.5, 19], [0, 8.5], [0, 29.5]]
      .every(([x, z]) => !isBlocked(x, z)),
    [isBlocked]
  );

  return (
    <group>
      {/* 운동장 트랙 — 학교 앞 황토 타원과 흰 레인 선 */}
      {trackOk && (
        <group position={[0, 0, 19]}>
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
            <ringGeometry args={[8.5, 12.5, 48]} />
            <meshStandardMaterial color="#DBA275" roughness={0.95} />
          </mesh>
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[10.3, 10.55, 48]} />
            <meshStandardMaterial color="#FFF6E4" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* 태극기 게양대 */}
      {!isBlocked(10, 3) && (
        <group position={[10, 0, 3]}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 6, 6]} />
            <meshStandardMaterial color="#C8C8C8" metalness={0.4} roughness={0.5} />
          </mesh>
          <group position={[0.78, 5.4, 0]}>
            <mesh>
              <planeGeometry args={[1.5, 1]} />
              <meshStandardMaterial color="#FFFFFF" side={THREE.DoubleSide} />
            </mesh>
            {/* 태극 무늬 — 위 빨강 반원, 아래 파랑 반원으로 줄여 그린다 */}
            <mesh position={[0, 0.02, 0.006]}>
              <circleGeometry args={[0.28, 16, 0, PI]} />
              <meshStandardMaterial color="#CD2E3A" side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, -0.02, 0.006]}>
              <circleGeometry args={[0.28, 16, PI, PI]} />
              <meshStandardMaterial color="#0047A0" side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      )}

      {/* 미끄럼틀 */}
      {!isBlocked(-12, 9) && (
        <group position={[-12, 0, 9]} rotation={[0, 0.5, 0]}>
          {([[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.1], [0.5, 0.1]] as const).map(([px, pz]) => (
            <mesh key={`${px}${pz}`} position={[px, 0.85, pz]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 1.7, 6]} />
              <meshStandardMaterial color="#E8A33C" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 1.72, -0.4]} castShadow>
            <boxGeometry args={[1.1, 0.1, 1.1]} />
            <meshStandardMaterial color="#3BAF9F" roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.06, 1.15]} rotation={[-0.55, 0, 0]} castShadow>
            <boxGeometry args={[0.85, 0.08, 2.6]} />
            <meshStandardMaterial color="#E8604C" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.85, -1.25]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.7, 1.75, 0.08]} />
            <meshStandardMaterial color="#FFF6E4" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* 그네 */}
      {!isBlocked(-19, 14) && (
        <group position={[-19, 0, 14]} rotation={[0, -0.3, 0]}>
          {([-1.4, 1.4] as const).map((sx) => (
            <mesh key={sx} position={[sx, 1.1, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 2.2, 6]} />
              <meshStandardMaterial color="#4A90D9" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 2.2, 0]} rotation={[0, 0, PI / 2]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3, 6]} />
            <meshStandardMaterial color="#4A90D9" roughness={0.6} />
          </mesh>
          {([-0.6, 0.6] as const).map((sx) => (
            <group key={sx}>
              {([-0.18, 0.18] as const).map((rx) => (
                <mesh key={rx} position={[sx + rx, 1.5, 0]}>
                  <cylinderGeometry args={[0.02, 0.02, 1.3, 4]} />
                  <meshStandardMaterial color="#8A8A8A" />
                </mesh>
              ))}
              <mesh position={[sx, 0.85, 0]} castShadow>
                <boxGeometry args={[0.5, 0.08, 0.3]} />
                <meshStandardMaterial color="#E8604C" roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 시소 */}
      {!isBlocked(-12, 17) && (
        <group position={[-12, 0, 17]} rotation={[0, 0.9, 0]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.26, 0.6, 8]} />
            <meshStandardMaterial color="#7B4B94" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.62, 0]} rotation={[0, 0, 0.16]} castShadow>
            <boxGeometry args={[3.4, 0.1, 0.4]} />
            <meshStandardMaterial color="#E8A33C" roughness={0.6} />
          </mesh>
        </group>
      )}

      {/* 모래놀이터 — 모래성 하나까지 */}
      {!isBlocked(-17, 20) && (
        <group position={[-17, 0, 20]}>
          <mesh position={[0, 0.12, 0]} receiveShadow>
            <cylinderGeometry args={[1.6, 1.7, 0.24, 8]} />
            <meshStandardMaterial color="#C9A46B" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.25, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
            <circleGeometry args={[1.35, 8]} />
            <meshStandardMaterial color="#EFDCA8" roughness={1} />
          </mesh>
          <mesh position={[0.3, 0.45, 0.2]} castShadow>
            <coneGeometry args={[0.3, 0.5, 6]} />
            <meshStandardMaterial color="#E3CD96" roughness={1} />
          </mesh>
        </group>
      )}

      {/* 사방치기 — 바닥에 그려진 놀이판 */}
      {!isBlocked(5, 12) && (
        <group position={[5, 0.035, 12]} rotation={[0, 0.15, 0]}>
          {[[0, 0], [0, 1.05], [-0.55, 2.1], [0.55, 2.1], [0, 3.15], [-0.55, 4.2], [0.55, 4.2]].map(([hx, hz], i) => (
            <mesh key={i} position={[hx, 0, hz]} rotation={[NEG_HALF_PI, 0, 0]}>
              <planeGeometry args={[0.95, 0.95]} />
              <meshStandardMaterial color="#FFF6E4" roughness={0.9} transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {/* 화단 — 입구 양옆 */}
      {([-6, 6] as const).map((fx) => !isBlocked(fx, 7) && (
        <group key={fx} position={[fx, 0, 7]}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[1.8, 0.5, 0.7]} />
            <meshStandardMaterial color="#B0603F" roughness={0.85} />
          </mesh>
          {([-0.55, 0, 0.55] as const).map((px, i) => (
            <mesh key={px} position={[px, 0.62, 0]}>
              <sphereGeometry args={[0.22, 6, 5]} />
              <meshStandardMaterial color={['#E8604C', '#E8A33C', '#D86CB0'][i]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * 나비 — 마을에 움직이는 것이 아바타뿐이면 정지화면 같다.
 * 학교 둘레를 몇 마리가 다른 반지름·속도로 맴돌고, 날개를 퍼덕인다.
 */
function Butterflies() {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const grp = g.current;
    if (!grp) return;
    const t = clock.elapsedTime;
    grp.children.forEach((b, i) => {
      const sp = 0.22 + i * 0.05;
      const rad = 16 + i * 9;
      const a = t * sp + i * 2.4;
      b.position.set(
        Math.cos(a) * rad,
        1.6 + Math.sin(t * 1.7 + i * 1.3) * 0.7,
        Math.sin(a) * rad * 0.8
      );
      b.rotation.y = -a;
      const flap = 0.7 + Math.sin(t * 12 + i) * 0.5;
      b.children[0].rotation.z = flap;
      b.children[1].rotation.z = -flap;
    });
  });
  return (
    <group ref={g}>
      {['#E86CA8', '#E8A33C', '#7B4B94', '#3BAF9F', '#E8604C'].map((c, i) => (
        <group key={i}>
          {/* 날개는 몸통을 축으로 퍼덕여야 하므로 피벗 그룹 안에 넣는다 */}
          <group>
            <mesh position={[0.17, 0, 0]}>
              <planeGeometry args={[0.34, 0.24]} />
              <meshStandardMaterial color={c} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <group>
            <mesh position={[-0.17, 0, 0]}>
              <planeGeometry args={[0.34, 0.24]} />
              <meshStandardMaterial color={c} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/**
 * 박공지붕 — 상자 위에 얹는 삼각 프리즘.
 * 납작한 판보다 '집'으로 읽힌다. 가상 관공서 건물에 쓴다.
 */
function GableRoof({ w, d, y, color }: { w: number; d: number; y: number; color: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, w * 0.3);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  }, [w, d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, y, 0]} castShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
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
  data, schoolId, schoolName, me, avatarId, avatarCustom, avatarTint, onEnterSchool, onEnterPlace, onEnterSite,
  localSites, localPlaces,
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
  /** 관공서 문을 눌렀을 때 (우체국·읍사무소 …) */
  onEnterPlace?: (kind: string) => void;
  /** 우리 고장 유적을 눌렀을 때 (애월진성 …) */
  onEnterSite?: (siteId: string) => void;
  /** 이 학교의 유적·명소 (학교가 고쳤을 수 있다) */
  localSites?: LocalSite[];
  /** 이 학교의 기관들 */
  localPlaces?: CivicPlace[];
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
  const [mePos, setMePos] = useState({ x: 0, z: 0, yaw: 0 });
  /** 이 학교 마을에 뜨는 유적 (표에서 학교로 걸러온다) */
  /**
   * **걸어서 갈 수 있는 곳만** 세운다.
   *
   * 조사할 곳은 읍 전체에 흩어져 있다 — 항파두리는 4km, 빌레못동굴은 7km.
   * 그걸 400m 짜리 마을 지도에 그리면 거짓말이 된다. 먼 곳은 읍 지도에서
   * 방위와 거리로 본다.
   */
  const sites = useMemo(
    () => (localSites ?? []).filter((s) => s.km <= WALKABLE_KM),
    [localSites]
  );
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

  /**
   * **이름 있는 건물도 갈 곳이다.**
   *
   * 워프 목록을 `poi`(OSM 노드)에서만 만들었더니, 정작 **들어갈 수 있는 곳이
   * 지도에 없었다** — 애월읍사무소는 건물(way)이라 poi 에 안 들어 있다.
   * 지도를 열면 은행·도서관만 뜨고 읍사무소가 없으니 찾아갈 방법이 없었다.
   *
   * 건물은 다각형이므로 **가운데 점**을 자리로 삼는다.
   */
  const buildingPois = useMemo(
    () =>
      data.b
        .filter((b) => (b.n ?? '').trim())
        .map((b) => {
          const xs = b.p.map((p) => p[0]);
          const zs = b.p.map((p) => p[1]);
          return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            z: (Math.min(...zs) + Math.max(...zs)) / 2,
            k: civicKindOf(b) ?? 'building',
            n: b.n as string,
          };
        }),
    [data.b]
  );

  /**
   * OSM 에 없는 관공서를 가상 건물로 세운다.
   *
   * 400m 반경 OSM 데이터에 우체국·도서관·경찰서가 없으면 미션에서
   * "우체국에 가라"고 해도 지도에 우체국이 없어 헤맨다.
   * 학교 주변 여러 자리에 간판 건물을 하나씩 세워 넣는다.
   */
  const missingPlaces = useMemo(() => {
    if (!localPlaces?.length) return [];
    const found = new Set<string>();
    for (const b of data.b) {
      const kind = civicKindOf(b, localPlaces);
      if (kind) found.add(kind);
    }
    const slots: [number, number][] = [
      [60, -40], [-60, -50], [80, 30], [-80, 20], [50, 70], [-50, -80],
    ];
    let si = 0;
    return localPlaces
      .filter((p) => !found.has(p.kind))
      .map((p) => {
        const [x, z] = slots[si % slots.length];
        si++;
        return { place: p, x, z };
      });
  }, [data.b, localPlaces]);

  const targets: WarpTarget[] = useMemo(
    () => [
      ...warpTargets([...buildingPois, ...data.poi], schoolName),
      ...sites.map((s) => {
        const at = { x: -26, z: 18 };
        return { id: `site-${s.id}`, name: s.name, x: at.x, z: at.z, dist: Math.hypot(at.x, at.z) };
      }),
      ...missingPlaces.map((mp) => ({
        id: `civic-${mp.place.kind}`,
        name: mp.place.label,
        x: mp.x,
        z: mp.z,
        dist: Math.hypot(mp.x, mp.z),
      })),
    ],
    [buildingPois, data.poi, schoolName, sites, missingPlaces]
  );

  /**
   * 그중 **들어갈 수 있는 곳**. 지도에서 다르게 보여준다 —
   * 갈 수만 있는 곳과 들어갈 수 있는 곳은 아이에게 다른 이야기다.
   */
  const civicIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of data.b) {
      const kind = civicKindOf(b, localPlaces);
      if (!kind || !b.n) continue;
      const t = targets.find((x) => x.name === (b.n as string).trim());
      if (t) s.add(t.id);
    }
    for (const site of sites) s.add(`site-${site.id}`);
    for (const mp of missingPlaces) s.add(`civic-${mp.place.kind}`);
    return s;
  }, [data.b, targets, sites, localPlaces, missingPlaces]);

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
    () => [
      ...data.b.map((b) => {
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
      ...missingPlaces.map((mp) => ({
        x: mp.x, z: mp.z, halfW: 4, halfD: 3,
      })),
    ],
    [data.b, missingPlaces]
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
        {/*
          하늘빛은 위에서 파랗게, 땅 반사광은 아래에서 초록으로 —
          한 색으로 고르게 밝히는 ambient 만 쓰면 입체감이 죽는다.
        */}
        <hemisphereLight args={['#CFEFFF', '#9CC98F', 0.75]} />
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[120, 200, 100]}
          intensity={1.05}
          color="#FFF4DC"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-220}
          shadow-camera-right={220}
          shadow-camera-top={220}
          shadow-camera-bottom={-220}
          shadow-camera-near={50}
          shadow-camera-far={600}
          shadow-bias={-0.0005}
        />
        {/* 멀리 갈수록 하늘색에 잠긴다 — 마을 끝이 뚝 끊겨 보이지 않는다 */}
        <fog attach="fog" args={['#BFE8F5', R * 0.45, R * 2.4]} />

        <Ground R={R} />
        <Horizon R={R} />

        <Areas list={data.a} />
        <Roads list={data.rd} />
        <VillageProps radius={R} buildings={data.b} />
        <Buildings list={data.b} onEnterPlace={onEnterPlace} places={localPlaces} />
        <SchoolYard buildings={data.b} />
        <Butterflies />

        {/*
          우리 고장 유적 — **학교 바로 옆에 선다.**
          애월초는 실제로 애월진성 터에 세워졌다. 지어낸 자리가 아니라
          그 자리가 맞아서 여기 둔다.
        */}
        {sites.map((s) => (
          <group key={s.id} position={[-26, 0, 18]}>
            {/* 남아 있는 성벽 한 자락 — 실제로 북성 일부가 남아 있다 */}
            <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
              <boxGeometry args={[10, 3.2, 1.4]} />
              <meshStandardMaterial color="#9A9188" roughness={1} />
            </mesh>
            <mesh position={[0, 3.3, 0]} castShadow>
              <boxGeometry args={[10.4, 0.3, 1.7]} />
              <meshStandardMaterial color="#867D74" roughness={1} />
            </mesh>
            <Html position={[0, 5.2, 0]} center style={{ pointerEvents: 'auto' }} zIndexRange={[5, 0]}>
              <div
                onClick={() => onEnterSite?.(s.id)}
                style={{
                  background: '#FFF1D6', color: '#5B4A3B', fontWeight: 800, fontSize: '14px',
                  padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                  fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                  border: '2px solid #B08860', cursor: 'pointer',
                }}
              >
                {s.emoji} {s.name}
                <span style={{ color: '#A6762A', marginLeft: '6px', fontSize: '12px' }}>알아보기 ›</span>
              </div>
            </Html>
          </group>
        ))}

        {/*
          OSM에 없는 관공서 — 간판 건물을 세운다.
          실제 위치를 모르므로 학교 주변에 배치하되,
          금색 문과 간판으로 들어갈 수 있음을 알린다.
        */}
        {missingPlaces.map((mp) => {
          const k = mp.place.kind;
          return (
            <group key={k} position={[mp.x, 0, mp.z]}>
              {/* 본관 */}
              <mesh position={[0, 3, 0]} castShadow receiveShadow>
                <boxGeometry args={[8, 6, 6]} />
                <meshStandardMaterial color="#F4E8D0" roughness={0.9} />
              </mesh>
              {/* 박공지붕 — 납작한 판보다 '건물'로 읽힌다 */}
              <GableRoof w={8.8} d={6.8} y={6} color={mp.place.color} />
              {/* 창문 2열 */}
              {([-1.8, 1.8] as const).map((wx) =>
                ([2.5, 4.2] as const).map((wy) => (
                  <mesh key={`${wx}-${wy}`} position={[wx, wy, 3.05]}>
                    <planeGeometry args={[1.2, 1.0]} />
                    <meshStandardMaterial color="#9FD4EE" emissive="#9FD4EE" emissiveIntensity={0.25} />
                  </mesh>
                ))
              )}
              {/* 금색 문 */}
              <mesh
                position={[0, 1.5, 3.05]}
                onClick={onEnterPlace ? (e) => { e.stopPropagation(); onEnterPlace(k); } : undefined}
                onPointerOver={onEnterPlace ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
                onPointerOut={onEnterPlace ? () => { document.body.style.cursor = 'auto'; } : undefined}
              >
                <planeGeometry args={[1.4, 2.4]} />
                <meshStandardMaterial color="#B5793F" emissive="#E8A33C" emissiveIntensity={0.35} />
              </mesh>
              {/* 현관 지붕 */}
              <mesh position={[0, 3.2, 3.6]} castShadow>
                <boxGeometry args={[2.4, 0.2, 1.4]} />
                <meshStandardMaterial color="#867D74" roughness={0.8} />
              </mesh>
              {/* 기관별 특징 */}
              {k === 'post_office' && (
                <>
                  {/* 우체통 */}
                  <mesh position={[4.8, 0.7, 3.2]} castShadow>
                    <cylinderGeometry args={[0.35, 0.35, 1.4, 8]} />
                    <meshStandardMaterial color="#E8604C" roughness={0.6} />
                  </mesh>
                  <mesh position={[4.8, 1.5, 3.2]}>
                    <sphereGeometry args={[0.38, 8, 6]} />
                    <meshStandardMaterial color="#C0392B" roughness={0.6} />
                  </mesh>
                </>
              )}
              {k === 'police' && (
                <>
                  {/* 경광등 */}
                  <mesh position={[0, 6.8, 0]} castShadow>
                    <cylinderGeometry args={[0.2, 0.2, 0.5, 8]} />
                    <meshStandardMaterial color="#E8604C" emissive="#FF0000" emissiveIntensity={0.4} />
                  </mesh>
                </>
              )}
              {k === 'library' && (
                <>
                  {/* 옆면 서가 창 */}
                  {([-2, 0, 2] as const).map((bz) => (
                    <mesh key={bz} position={[-4.05, 3, bz]}>
                      <planeGeometry args={[0.1, 4]} />
                      <meshStandardMaterial color="#9FD4EE" emissive="#9FD4EE" emissiveIntensity={0.15} />
                    </mesh>
                  ))}
                </>
              )}
              {k === 'health' && (
                <>
                  {/* 십자 마크 */}
                  <mesh position={[0, 5, 3.06]}>
                    <planeGeometry args={[0.6, 1.6]} />
                    <meshStandardMaterial color="#E8604C" />
                  </mesh>
                  <mesh position={[0, 5, 3.06]}>
                    <planeGeometry args={[1.6, 0.6]} />
                    <meshStandardMaterial color="#E8604C" />
                  </mesh>
                </>
              )}
              {k === 'nonghyup' && (
                <>
                  {/* 수확물 상자 */}
                  <mesh position={[4.5, 0.3, 1]} castShadow>
                    <boxGeometry args={[1, 0.6, 0.8]} />
                    <meshStandardMaterial color="#C9A46B" roughness={0.95} />
                  </mesh>
                  <mesh position={[4.5, 0.8, 1]}>
                    <sphereGeometry args={[0.25, 6, 4]} />
                    <meshStandardMaterial color="#4CAF50" />
                  </mesh>
                </>
              )}
              {/* 간판 */}
              <Html position={[0, 8.5, 0]} center style={{ pointerEvents: 'auto' }} zIndexRange={[5, 0]}>
                <div
                  onClick={onEnterPlace ? () => onEnterPlace(k) : undefined}
                  style={{
                    background: '#FFF1D6', color: '#5B4A3B', fontWeight: 800, fontSize: '14px',
                    padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                    fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                    border: '2px solid #E8A33C', cursor: 'pointer',
                  }}
                >
                  {mp.place.emoji} {mp.place.label}
                  <span style={{ color: '#A6762A', marginLeft: '6px', fontSize: '12px' }}>들어가기 ›</span>
                </div>
              </Html>
            </group>
          );
        })}

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
            setMePos({
              x: avatarPos.current?.x ?? 0,
              z: avatarPos.current?.z ?? 0,
              // 보는 쪽까지 베낀다 — 점 하나만 있으면 어느 쪽으로 걸어야 할지 모른다
              yaw: avatarYaw.current ?? 0,
            });
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
          areas={data.a}
          me={mePos}
          targets={targets}
          civicIds={civicIds}
          onWarp={warpTo}
          onClose={() => setWarpOpen(false)}
        />
      )}
    </div>
  );
}
