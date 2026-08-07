'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  requestAttack, setMovementLock, wasTap,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import VillageMobs, { type OffscreenMob } from './VillageMobs';
import Peers from './Peers';
import VillageMiniMap from './VillageMiniMap';
import type { PeerLook } from '@/lib/presence';
import { civicKindOf, civicByKind, type CivicPlace } from '@/lib/civic-places';
import { gatesFrom, type VillageSpot } from '@/lib/village-spots';
import {
  PICK_RADIUS, SHOW_RANGE as COLLECT_SHOW_RANGE, itemsOfSpot, type CollectItem,
} from '@/lib/village-collect';
import { mobsOfSpot, type Mob } from '@/lib/village-mobs';
import { answerText, isCorrect, pickBellQuestions, type BellQuestion } from '@/lib/goldenbell';
import { seaMask, seaRects } from '@/lib/village-sea';
import { startAmbience } from '@/lib/ambience';
import { WALKABLE_KM, type LocalSite } from '@/lib/local-sites';
import { playSound } from '@/lib/sound';
import { saveReturn, saveSpot, takeReturn } from '@/lib/village-return';
import { blocksOfBuildings } from '@/lib/village-blocks';
import {
  speedOf, warpTargets, vehicleById, VEHICLES, type WarpTarget,
} from '@/lib/village-travel';
import { backdropClose } from '@/lib/backdrop';
import { MatcapMat } from './MatcapMat';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 화면 비율에 맞춰 시야를 넓힌다.
 *
 * **`fov` 는 세로 기준이다.** 그래서 화면이 좁고 길면 가로로 보이는 폭이
 * 통째로 줄어든다 — 같은 58도인데
 *
 *   PC(1280x720)  가로 시야 89도
 *   폰(375x812)   가로 시야 **29도**
 *
 * 세 배 차이다. 마을에 몹과 주울 것을 12m 간격으로 흩어 놓았어도, 폰에서는
 * 그 좁은 29도 안에 든 것만 보인다 — "모바일에서는 몹이 안 보인다" 가 이것이다.
 *
 * 그래서 **가로 시야를 목표로 잡고 세로를 거꾸로 계산한다**(게임에서 흔히
 * 쓰는 Hor+ 방식). 다만 끝까지 늘리면 어안렌즈처럼 휘어 보이므로 위를 막아둔다.
 */
const H_FOV_TARGET = 76;
const V_FOV_MIN = 52;
const V_FOV_MAX = 74;

const fovFor = (aspect: number) => {
  if (!Number.isFinite(aspect) || aspect <= 0) return 58;
  const half = Math.atan(Math.tan((H_FOV_TARGET / 2) * (PI / 180)) / aspect);
  const v = (half * 2 * 180) / PI;
  return Math.max(V_FOV_MIN, Math.min(V_FOV_MAX, v));
};

/**
 * 화면이 바뀔 때마다 시야를 다시 맞춘다.
 * 가로/세로를 돌리거나 창을 줄여도 보이는 폭이 그대로 유지된다.
 */
function FitFov() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;
    const next = fovFor(size.width / size.height);
    if (Math.abs(cam.fov - next) < 0.01) return;
    cam.fov = next;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/** 로그인 전에는 이걸 그대로 쓴다 — 그릴 때마다 새 집합을 만들면 안 된다 */
const EMPTY_PICKED: ReadonlySet<string> = new Set();

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
  /** 해안선. 없으면 바닷가 마을이 아니다(또는 아직 안 구웠다). */
  cl?: XZ[][];
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
        <mesh geometry={plainRoofs}>
          <MatcapMat color="#B7A78D" />
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
            <mesh geometry={geo}>
              <MatcapMat
                color={named ? '#F7ECD8' : WALL_COLORS[i % WALL_COLORS.length]}
              />
            </mesh>

            {/* 지붕은 건물 좌표계 그대로다 — 아래 group 안에 넣으면 두 번 옮겨진다 */}
            {named && roofs[i] && (
              <mesh geometry={roofs[i]!} position={[0, b.h + 0.12, 0]}>
                <MatcapMat color={ROOF_COLORS[d?.hue ?? 0]} />
              </mesh>
            )}

            {named && d && (() => {
              const bType = civicKind || b.k || '';
              /**
               * 입구는 **통째로 눌린다.**
               *
               * 전에는 문짝 하나만 눌렸다. 그 문은 벽에 붙은 1m 남짓 판이라
               * 멀리서 조준하기 어렵고, 정작 눈에 띄는 것은 그 위 간판과
               * 발밑 계단이다 — **눌러보고 싶게 생긴 것이 안 눌리면**
               * 아이는 '여긴 못 들어가나 보다' 하고 지나간다.
               * 그래서 문틀·계단·차양·간판까지 같은 손잡이를 단다.
               */
              const enter = civicKind && onEnterPlace
                ? {
                  onClick: (e: { stopPropagation: () => void }) => {
                    e.stopPropagation(); onEnterPlace(civicKind);
                  },
                  onPointerOver: (e: { stopPropagation: () => void }) => {
                    e.stopPropagation(); document.body.style.cursor = 'pointer';
                  },
                  onPointerOut: () => { document.body.style.cursor = 'auto'; },
                }
                : {};
              return (
              <group position={[d.cx, 0, d.cz]}>
                {/* 창문 두 줄 — 틀을 두르고 유리를 끼운다. 틀이 없으면 벽에 뚫린 구멍 같다. */}
                {([0.35, 0.62] as const).map((fy) =>
                  ([-0.28, 0.28] as const).map((fx) => (
                    <group key={`${fy}-${fx}`} position={[fx * d.w, b.h * fy, d.d / 2 + 0.05]}>
                      <mesh position={[0, 0, -0.01]}>
                        <planeGeometry args={[Math.min(1.3, d.w * 0.3), 1.2]} />
                        <MatcapMat color="#8C7A60" />
                      </mesh>
                      <mesh>
                        <planeGeometry args={[Math.min(1.1, d.w * 0.26), 1]} />
                        <MatcapMat
                          color="#BEE6F7"
                        />
                      </mesh>
                    </group>
                  ))
                )}
                {/* 문틀 */}
                <mesh position={[0, b.h * 0.16, d.d / 2 + 0.04]} {...enter}>
                  <planeGeometry args={[Math.min(1.45, d.w * 0.33), b.h * 0.36]} />
                  <MatcapMat color="#6E5335" />
                </mesh>
                <mesh position={[0, b.h * 0.16, d.d / 2 + 0.05]} {...enter}>
                  <planeGeometry args={[Math.min(1.2, d.w * 0.28), b.h * 0.32]} />
                  <MatcapMat
                    color={civicKind ? '#B5793F' : '#8A5A3B'}
                  />
                </mesh>
                {/* 현관 계단 — 문 앞에 낮은 단이 있으면 문이 '진짜 입구'처럼 읽힌다 */}
                <mesh position={[0, 0.09, d.d / 2 + 0.45]} {...enter}>
                  <boxGeometry args={[Math.min(1.8, d.w * 0.4), 0.18, 0.8]} />
                  <MatcapMat color="#C9BCA4" />
                </mesh>
                {/* 들어갈 수 있는 곳은 현관 지붕까지 — 눈에 띄어야 눌러본다 */}
                {civicKind && (
                  <mesh position={[0, b.h * 0.36, d.d / 2 + 0.55]} {...enter}>
                    <boxGeometry args={[Math.min(2.2, d.w * 0.45), 0.14, 1.1]} />
                    <MatcapMat color={ROOF_COLORS[d.hue]} />
                  </mesh>
                )}
                {/*
                  기관 로고 간판 — **기관 색 판에 큰 이모지.**
                  이름표(Html)는 멀면 작아서 안 읽힌다. 벽의 색과 그림은
                  멀리서도 "저기 우체국이다"가 된다.
                */}
                {civicKind && (() => {
                  const cp = (places ?? []).find((p) => p.kind === civicKind) ?? civicByKind(civicKind);
                  if (!cp) return null;
                  return (
                    <group position={[0, b.h * 0.62, d.d / 2 + 0.09]} {...enter}>
                      <mesh>
                        <planeGeometry args={[2.4, 1.1]} />
                        <MatcapMat color={cp.color} />
                      </mesh>
                      <mesh position={[0, 0, -0.005]}>
                        <planeGeometry args={[2.6, 1.3]} />
                        <MatcapMat color="#FFFFFF" />
                      </mesh>
                      <Html position={[0, 0, 0.02]} transform scale={0.5} pointerEvents="none" zIndexRange={[4, 0]}>
                        <div style={{ fontSize: '40px', userSelect: 'none' }}>{cp.emoji}</div>
                      </Html>
                    </group>
                  );
                })()}

                {/* ── 건물 타입별 외관 특징 ── */}
                {bType === 'post_office' && (
                  <mesh position={[d.w / 2 + 0.8, 0.7, d.d / 2 - 0.5]}>
                    <cylinderGeometry args={[0.3, 0.3, 1.4, 8]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                )}
                {bType === 'police' && (
                  <mesh position={[0, b.h + 0.7, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.5, 8]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                )}
                {bType === 'library' && (
                  <>
                    {([-d.d * 0.3, 0, d.d * 0.3] as const).map((bz) => (
                      <mesh key={bz} position={[-d.w / 2 - 0.05, b.h * 0.5, bz]}>
                        <planeGeometry args={[0.1, b.h * 0.6]} />
                        <MatcapMat color="#9FD4EE" />
                      </mesh>
                    ))}
                  </>
                )}
                {bType === 'health' && (
                  <>
                    <mesh position={[0, b.h * 0.75, d.d / 2 + 0.06]}>
                      <planeGeometry args={[0.5, 1.2]} />
                      <MatcapMat color="#E8604C" />
                    </mesh>
                    <mesh position={[0, b.h * 0.75, d.d / 2 + 0.06]}>
                      <planeGeometry args={[1.2, 0.5]} />
                      <MatcapMat color="#E8604C" />
                    </mesh>
                  </>
                )}
                {bType === 'nonghyup' && (
                  <>
                    <mesh position={[d.w / 2 + 0.6, 0.3, 0]}>
                      <boxGeometry args={[0.8, 0.6, 0.6]} />
                      <MatcapMat color="#C9A46B" />
                    </mesh>
                    <mesh position={[d.w / 2 + 0.6, 0.75, 0]}>
                      <sphereGeometry args={[0.22, 6, 4]} />
                      <MatcapMat color="#4CAF50" />
                    </mesh>
                  </>
                )}
                {bType === 'fuel' && (
                  <>
                    <mesh position={[0, b.h + 1.5, d.d / 2 + 3]}>
                      <boxGeometry args={[Math.min(d.w * 0.8, 6), 0.25, 3.5]} />
                      <MatcapMat color="#EEEEEE" />
                    </mesh>
                    {([-1.5, 1.5] as const).map((px) => (
                      <mesh key={px} position={[px, (b.h + 1.5) / 2, d.d / 2 + 3]}>
                        <cylinderGeometry args={[0.12, 0.12, b.h + 1.5, 6]} />
                        <MatcapMat color="#AAAAAA" />
                      </mesh>
                    ))}
                    <mesh position={[0, 0.9, d.d / 2 + 3]}>
                      <boxGeometry args={[0.5, 1.6, 0.4]} />
                      <MatcapMat color="#E8A33C" />
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
                      {/* 경사진 차양 — 평평한 판보다 가게처럼 보인다. 여기도 입구다. */}
                      <mesh
                        position={[0, b.h * 0.4, d.d / 2 + 0.55]}
                        rotation={[0.4, 0, 0]}
                        {...enter}
                      >
                        <boxGeometry args={[awnW, 0.1, 1.2]} />
                        <MatcapMat color={awnColor} />
                      </mesh>
                      {/* 차양 앞단 흰 줄 — 줄무늬 천의 인상만 낸다 */}
                      <mesh position={[0, b.h * 0.4 - 0.24, d.d / 2 + 1.1]} rotation={[0.4, 0, 0]}>
                        <boxGeometry args={[awnW, 0.11, 0.25]} />
                        <MatcapMat color="#FFF6E4" />
                      </mesh>
                    </>
                  );
                })()}
                {bType === 'bank' && (
                  <>
                    <mesh position={[-d.w / 4, b.h + 0.4, 0]}>
                      <boxGeometry args={[d.w * 0.3, 0.6, Math.min(d.d * 0.5, 2)]} />
                      <MatcapMat color="#2E5A88" />
                    </mesh>
                    <mesh position={[d.w / 4, b.h + 0.4, 0]}>
                      <boxGeometry args={[d.w * 0.3, 0.6, Math.min(d.d * 0.5, 2)]} />
                      <MatcapMat color="#2E5A88" />
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
        <mesh key={i} position={p.pos} rotation={[NEG_HALF_PI, 0, p.rot]}>
          <planeGeometry args={[p.w, p.len]} />
          <MatcapMat color="#D6C9AE" />
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
          <MatcapMat color="#FFF3D0" />
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
/**
 * 에셋이 보이는 거리.
 *
 * **안개(`R*0.5`)보다 안쪽에서 자른다.** 마을 반지름이 830m 라 안개는 415m 부터
 * 끼는데, 그 밖은 어차피 하늘색에 잠겨 형체가 없다. 380개를 늘 그리면
 * 마을에 들어설 때 메시 1,900개가 한꺼번에 GPU 로 올라가 첫 화면이 늦고,
 * 그 뒤로도 매 프레임 1,900개를 훑는다.
 *
 * 서 있는 자리에서 380m 밖은 전체 넓이의 7할이 넘는다 — **그만큼이 빠진다.**
 */
const PROP_RANGE = 380;

function VillageProps({ radius, buildings, avatarPos }: {
  radius: number;
  buildings: { p: XZ[]; h: number }[];
  avatarPos: React.RefObject<THREE.Vector3>;
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
    /**
     * 몇 개를 뿌릴까 — **넓이에 맞춘다.**
     *
     * 380개는 반지름 800m 일 때 정한 수다. 관공서를 진짜 자리에 담으려고
     * 1,200m 로 넓혔더니 넓이가 2.25배가 되어, 같은 380개면 그만큼 휑해진다.
     * 넓이에 비례해 늘리면 어디를 걸어도 밀도가 같다.
     *
     * 멀리 것은 어차피 안 그리므로(PROP_RANGE) 늘어난 만큼 느려지지 않는다 —
     * 목록만 길어지고 화면에 서는 수는 그대로다.
     */
    const COUNT = Math.min(1400, Math.round(380 * (radius / 800) ** 2));
    for (let i = 0; i < COUNT; i++) {
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

  /**
   * 지금 그릴 것 — **가까운 것만.**
   *
   * 매 프레임 재면 380개를 훑는 일이 그대로라 뜻이 없다. 사람이 걷는 속도로는
   * 0.4초에 몇 미터라 그때마다 한 번만 봐도 된다.
   *
   * 들고 날 때 **여유를 둔다**(30m). 경계에 딱 걸린 나무가 한 걸음마다
   * 나타났다 사라지면 그게 더 눈에 띈다.
   */
  const [shown, setShown] = useState<number[]>([]);
  useEffect(() => {
    const inR = PROP_RANGE * PROP_RANGE;
    const outR = (PROP_RANGE + 30) * (PROP_RANGE + 30);
    let cur = new Set<number>();

    const tick = () => {
      const p = avatarPos.current;
      if (!p) return;
      const next = new Set<number>();
      for (let i = 0; i < items.length; i++) {
        const dx = items[i].x - p.x;
        const dz = items[i].z - p.z;
        const d2 = dx * dx + dz * dz;
        // 이미 보이던 것은 조금 더 멀어질 때까지 남겨 둔다
        if (d2 < inR || (cur.has(i) && d2 < outR)) next.add(i);
      }
      if (next.size === cur.size && Array.from(next).every((i) => cur.has(i))) return;
      cur = next;
      setShown(Array.from(next));
    };

    tick();
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, [items, avatarPos]);

  return (
    <group>
      {/*
        **키는 원래 차례(`idx`)로 준다.** 걸러낸 목록의 순번을 쓰면
        나무 하나가 사라질 때 뒤엣것들이 통째로 밀려 다른 것으로 다시 만들어진다.
      */}
      {shown.map((idx) => ({ idx, it: items[idx] })).map(({ idx, it }) => (
        <group key={idx} position={[it.x, 0, it.z]} rotation={[0, it.r, 0]} scale={it.s}>
          {it.kind === 'tree' && (
            <>
              {/* 덩어리 하나면 사탕처럼 보인다 — 크기·색이 다른 세 덩어리를 겹친다 */}
              <mesh position={[0, 0.9, 0]}>
                <cylinderGeometry args={[0.22, 0.4, 1.8, 6]} />
                <MatcapMat color="#8B6C47" />
              </mesh>
              <mesh position={[0, 2.4, 0]}>
                <sphereGeometry args={[1.9, 8, 6]} />
                <MatcapMat color="#55A24B" />
              </mesh>
              <mesh position={[0.9, 3.1, 0.3]}>
                <sphereGeometry args={[1.15, 7, 5]} />
                <MatcapMat color="#66B458" />
              </mesh>
              <mesh position={[-0.8, 3.3, -0.4]}>
                <sphereGeometry args={[0.95, 7, 5]} />
                <MatcapMat color="#4C9443" />
              </mesh>
            </>
          )}
          {it.kind === 'palm' && (
            <>
              <mesh position={[0, 1.6, 0]}>
                <cylinderGeometry args={[0.15, 0.3, 3.2, 6]} />
                <MatcapMat color="#A08060" />
              </mesh>
              {/* 잎 다섯 장을 바깥으로 눕혀 방사형으로 편다 */}
              {[0, 1, 2, 3, 4].map((n) => (
                <group key={n} rotation={[0, (n / 5) * PI * 2, 0]}>
                  <mesh position={[0.85, 3.2, 0]} rotation={[0, 0, -1.05]}>
                    <coneGeometry args={[0.42, 1.9, 4]} />
                    <MatcapMat color="#3D8B37" />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 3.25, 0]}>
                <sphereGeometry args={[0.3, 6, 5]} />
                <MatcapMat color="#7A5C40" />
              </mesh>
            </>
          )}
          {it.kind === 'lamp' && (
            <>
              <mesh position={[0, 2.2, 0]}>
                <cylinderGeometry args={[0.08, 0.12, 4.4, 6]} />
                <MatcapMat color="#7A7A7A" />
              </mesh>
              <mesh position={[0, 4.6, 0]}>
                <sphereGeometry args={[0.35, 8, 6]} />
                <MatcapMat color="#FFFDE0" />
              </mesh>
            </>
          )}
          {it.kind === 'bench' && (
            <>
              <mesh position={[0, 0.35, 0]}>
                <boxGeometry args={[1.6, 0.12, 0.55]} />
                <MatcapMat color="#A07E55" />
              </mesh>
              {([-0.6, 0.6] as const).map((bx) => (
                <mesh key={bx} position={[bx, 0.15, 0]}>
                  <boxGeometry args={[0.12, 0.3, 0.45]} />
                  <MatcapMat color="#6B5B43" />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'flower' && (
            <>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.5, 0.45, 0.4, 8]} />
                <MatcapMat color="#C9946B" />
              </mesh>
              {[0, 1.2, 2.4, 3.6, 4.8].map((a) => (
                <mesh key={a} position={[Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3]}>
                  <sphereGeometry args={[0.18, 6, 4]} />
                  <MatcapMat color={['#E8604C', '#E8A33C', '#D86CB0', '#7B4B94', '#3BAF9F'][Math.floor(a / 1.2)]} />
                </mesh>
              ))}
              <mesh position={[0, 0.45, 0]}>
                <sphereGeometry args={[0.4, 6, 4]} />
                <MatcapMat color="#4CAF50" />
              </mesh>
            </>
          )}
          {it.kind === 'hydrant' && (
            <>
              <mesh position={[0, 0.35, 0]}>
                <cylinderGeometry args={[0.15, 0.18, 0.7, 8]} />
                <MatcapMat color="#E8604C" />
              </mesh>
              <mesh position={[0, 0.75, 0]}>
                <sphereGeometry args={[0.18, 8, 6]} />
                <MatcapMat color="#C0392B" />
              </mesh>
            </>
          )}
          {it.kind === 'rock' && (
            <mesh position={[0, 0.3, 0]}>
              <dodecahedronGeometry args={[0.6, 0]} />
              <MatcapMat color="#9A9188" />
            </mesh>
          )}
          {it.kind === 'bush' && (
            <mesh position={[0, 0.5, 0]}>
              <sphereGeometry args={[0.8, 6, 5]} />
              <MatcapMat color="#4A8F40" />
            </mesh>
          )}
          {it.kind === 'sign' && (
            <>
              <mesh position={[0, 0.7, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
                <MatcapMat color="#7A7A7A" />
              </mesh>
              <mesh position={[0, 1.5, 0]}>
                <boxGeometry args={[0.6, 0.4, 0.06]} />
                <MatcapMat color="#3A6EA5" />
              </mesh>
            </>
          )}
          {it.kind === 'bin' && (
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.22, 0.25, 0.7, 8]} />
              <MatcapMat color="#5A7A5A" />
            </mesh>
          )}
          {it.kind === 'fence' && (
            <>
              {([-0.7, 0, 0.7] as const).map((fx) => (
                <mesh key={fx} position={[fx, 0.35, 0]}>
                  <boxGeometry args={[0.08, 0.7, 0.08]} />
                  <MatcapMat color="#A07E55" />
                </mesh>
              ))}
              <mesh position={[0, 0.55, 0]}>
                <boxGeometry args={[1.6, 0.08, 0.06]} />
                <MatcapMat color="#C9A46B" />
              </mesh>
              <mesh position={[0, 0.35, 0]}>
                <boxGeometry args={[1.6, 0.08, 0.06]} />
                <MatcapMat color="#C9A46B" />
              </mesh>
            </>
          )}
          {it.kind === 'wall' && (
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[2.5, 1, 0.5]} />
              <MatcapMat color="#9A9188" />
            </mesh>
          )}
          {it.kind === 'garden' && (
            <>
              <mesh position={[0, 0.06, 0]}>
                <boxGeometry args={[3.2, 0.12, 2.2]} />
                <MatcapMat color="#8A6B4A" />
              </mesh>
              {([-0.7, 0, 0.7] as const).map((gz) => (
                <mesh key={gz} position={[0, 0.2, gz]}>
                  <boxGeometry args={[2.8, 0.18, 0.35]} />
                  <MatcapMat color="#4E9845" />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'hay' && (
            <mesh position={[0, 0.7, 0]}>
              <coneGeometry args={[0.9, 1.4, 8]} />
              <MatcapMat color="#D9B96C" />
            </mesh>
          )}
          {it.kind === 'scare' && (
            <>
              <mesh position={[0, 0.9, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 1.8, 5]} />
                <MatcapMat color="#8B6C47" />
              </mesh>
              <mesh position={[0, 1.35, 0]}>
                <boxGeometry args={[1.6, 0.1, 0.1]} />
                <MatcapMat color="#8B6C47" />
              </mesh>
              <mesh position={[0, 1.85, 0]}>
                <sphereGeometry args={[0.28, 7, 5]} />
                <MatcapMat color="#F0D9A8" />
              </mesh>
              <mesh position={[0, 2.12, 0]}>
                <coneGeometry args={[0.38, 0.35, 7]} />
                <MatcapMat color="#C97B4B" />
              </mesh>
            </>
          )}
          {it.kind === 'dol' && (
            <>
              {/* 돌하르방 — 현무암빛 몸통·머리·벙거지, 눈 두 점 */}
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.34, 0.42, 0.9, 8]} />
                <MatcapMat color="#6E6862" />
              </mesh>
              <mesh position={[0, 1.12, 0]}>
                <sphereGeometry args={[0.33, 8, 6]} />
                <MatcapMat color="#6E6862" />
              </mesh>
              <mesh position={[0, 1.47, 0]}>
                <cylinderGeometry args={[0.24, 0.36, 0.3, 8]} />
                <MatcapMat color="#5E5852" />
              </mesh>
              {([-0.12, 0.12] as const).map((ex) => (
                <mesh key={ex} position={[ex, 1.18, 0.28]}>
                  <sphereGeometry args={[0.055, 5, 4]} />
                  <MatcapMat color="#3A3632" />
                </mesh>
              ))}
            </>
          )}
          {it.kind === 'cat' && (() => {
            const fur = it.s > 1.05 ? '#8A8A8A' : '#E8A33C';
            return (
              <>
                <mesh position={[0, 0.26, 0]}>
                  <sphereGeometry args={[0.3, 7, 5]} />
                  <MatcapMat color={fur} />
                </mesh>
                <mesh position={[0, 0.55, 0.18]}>
                  <sphereGeometry args={[0.2, 7, 5]} />
                  <MatcapMat color={fur} />
                </mesh>
                {([-0.1, 0.1] as const).map((ex) => (
                  <mesh key={ex} position={[ex, 0.73, 0.18]}>
                    <coneGeometry args={[0.07, 0.14, 4]} />
                    <MatcapMat color={fur} />
                  </mesh>
                ))}
                <mesh position={[0, 0.36, -0.34]} rotation={[0.9, 0, 0]}>
                  <cylinderGeometry args={[0.045, 0.06, 0.5, 5]} />
                  <MatcapMat color={fur} />
                </mesh>
              </>
            );
          })()}
          {it.kind === 'chick' && (
            <>
              <mesh position={[0, 0.3, 0]}>
                <sphereGeometry args={[0.28, 7, 5]} />
                <MatcapMat color="#F5F0E4" />
              </mesh>
              <mesh position={[0, 0.58, 0.14]}>
                <sphereGeometry args={[0.16, 7, 5]} />
                <MatcapMat color="#F5F0E4" />
              </mesh>
              <mesh position={[0, 0.74, 0.14]}>
                <boxGeometry args={[0.06, 0.12, 0.16]} />
                <MatcapMat color="#E8604C" />
              </mesh>
              <mesh position={[0, 0.56, 0.31]} rotation={[1.4, 0, 0]}>
                <coneGeometry args={[0.05, 0.14, 4]} />
                <MatcapMat color="#E8A33C" />
              </mesh>
            </>
          )}
          {it.kind === 'gazebo' && (
            <>
              {/* 정자 — 육각 마루와 기둥, 뾰족 지붕 */}
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[1.9, 1.9, 0.25, 6]} />
                <MatcapMat color="#A07E55" />
              </mesh>
              {[0, 1, 2, 3, 4, 5].map((n) => {
                const a = (n / 6) * PI * 2;
                return (
                  <mesh key={n} position={[Math.cos(a) * 1.55, 1.2, Math.sin(a) * 1.55]}>
                    <cylinderGeometry args={[0.08, 0.08, 1.8, 6]} />
                    <MatcapMat color="#8B5A3B" />
                  </mesh>
                );
              })}
              <mesh position={[0, 2.6, 0]}>
                <coneGeometry args={[2.4, 1.1, 6]} />
                <MatcapMat color="#B0603F" />
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
        <mesh key={i} geometry={geo} position={[0, 0.02, 0]}>
          <MatcapMat
            color={list[i].k === 'water' ? '#6FC5E8' : '#9FDD97'}
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
    <mesh rotation={[NEG_HALF_PI, 0, 0]}>
      <planeGeometry args={[R * 2 + 200, R * 2 + 200]} />
      {tex
        ? <MatcapMat map={tex} />
        : <MatcapMat color="#A8DDA0" />}
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
  /**
   * **걸어다니는 데까지 들어오면 안 된다.**
   *
   * 처음에는 언덕을 `R*1.18` 에 세웠는데, 언덕 반지름이 `R*0.26` 까지라
   * 안쪽 끝이 `R*0.92` 였다 — 걸어다니는 범위(±R) 안이다. 차를 타고 끝으로
   * 가면 **언덕 속으로 들어가 초록 화면만 보였다.** 한라산은 더했다:
   * 걸어다니는 곳은 네모(±R)라 모서리가 `R*1.41` 인데, 한라산이 그 모서리를
   * 통째로 덮고 있었다.
   *
   * 그래서 **네모의 모서리(R*√2)** 를 기준으로 비켜 세운다.
   * 원이 아니라 네모라는 것을 놓치면 딱 모서리에서만 파묻힌다.
   */
  const CLEAR = 1.55; // R*1.55 > R*1.41(모서리) — 여유를 둔다

  const hills = useMemo(() => {
    const out: { x: number; z: number; r: number; h: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + 0.26;
      const r = R * 0.14 + (i % 4) * R * 0.04;
      // 안쪽 끝이 R*CLEAR 에 오도록 — 반지름만큼 더 밀어낸다
      const dist = R * CLEAR + r + (i % 3) * R * 0.1;
      out.push({
        x: Math.cos(a) * dist,
        z: Math.sin(a) * dist,
        r,
        h: R * 0.045 + (i % 3) * R * 0.02,
      });
    }
    return out;
  }, [R]);

  /** 한라산 — 남동쪽. 반지름만큼 더 밀어 모서리를 비킨다. */
  const halla = useMemo(() => {
    const r = R * 0.85;
    const dist = R * CLEAR + r;
    // 남동쪽 (x=동, z=남)
    return { x: dist * 0.45, z: dist * 0.89, r, h: R * 0.4 };
  }, [R]);

  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.h / 2 - 0.5, h.z]}>
          <coneGeometry args={[h.r, h.h, 7]} />
          <MatcapMat color="#7FBF77" />
        </mesh>
      ))}
      {/* 한라산 — 안개 너머 실루엣으로 */}
      <mesh position={[halla.x, halla.h / 2 - 0.5, halla.z]}>
        <coneGeometry args={[halla.r, halla.h, 9]} />
        <MatcapMat color="#6FA982" />
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
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[8.5, 12.5, 48]} />
            <MatcapMat color="#DBA275" />
          </mesh>
          <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[10.3, 10.55, 48]} />
            <MatcapMat color="#FFF6E4" />
          </mesh>
        </group>
      )}

      {/* 태극기 게양대 */}
      {!isBlocked(10, 3) && (
        <group position={[10, 0, 3]}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.07, 0.1, 6, 6]} />
            <MatcapMat color="#C8C8C8" />
          </mesh>
          <group position={[0.78, 5.4, 0]}>
            <mesh>
              <planeGeometry args={[1.5, 1]} />
              <MatcapMat color="#FFFFFF" side={THREE.DoubleSide} />
            </mesh>
            {/* 태극 무늬 — 위 빨강 반원, 아래 파랑 반원으로 줄여 그린다 */}
            <mesh position={[0, 0.02, 0.006]}>
              <circleGeometry args={[0.28, 16, 0, PI]} />
              <MatcapMat color="#CD2E3A" side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, -0.02, 0.006]}>
              <circleGeometry args={[0.28, 16, PI, PI]} />
              <MatcapMat color="#0047A0" side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      )}

      {/* 미끄럼틀 */}
      {!isBlocked(-12, 9) && (
        <group position={[-12, 0, 9]} rotation={[0, 0.5, 0]}>
          {([[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.1], [0.5, 0.1]] as const).map(([px, pz]) => (
            <mesh key={`${px}${pz}`} position={[px, 0.85, pz]}>
              <cylinderGeometry args={[0.06, 0.06, 1.7, 6]} />
              <MatcapMat color="#E8A33C" />
            </mesh>
          ))}
          <mesh position={[0, 1.72, -0.4]}>
            <boxGeometry args={[1.1, 0.1, 1.1]} />
            <MatcapMat color="#3BAF9F" />
          </mesh>
          <mesh position={[0, 1.06, 1.15]} rotation={[-0.55, 0, 0]}>
            <boxGeometry args={[0.85, 0.08, 2.6]} />
            <MatcapMat color="#E8604C" />
          </mesh>
          <mesh position={[0, 0.85, -1.25]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.7, 1.75, 0.08]} />
            <MatcapMat color="#FFF6E4" />
          </mesh>
        </group>
      )}

      {/* 그네 */}
      {!isBlocked(-19, 14) && (
        <group position={[-19, 0, 14]} rotation={[0, -0.3, 0]}>
          {([-1.4, 1.4] as const).map((sx) => (
            <mesh key={sx} position={[sx, 1.1, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 2.2, 6]} />
              <MatcapMat color="#4A90D9" />
            </mesh>
          ))}
          <mesh position={[0, 2.2, 0]} rotation={[0, 0, PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 3, 6]} />
            <MatcapMat color="#4A90D9" />
          </mesh>
          {([-0.6, 0.6] as const).map((sx) => (
            <group key={sx}>
              {([-0.18, 0.18] as const).map((rx) => (
                <mesh key={rx} position={[sx + rx, 1.5, 0]}>
                  <cylinderGeometry args={[0.02, 0.02, 1.3, 4]} />
                  <MatcapMat color="#8A8A8A" />
                </mesh>
              ))}
              <mesh position={[sx, 0.85, 0]}>
                <boxGeometry args={[0.5, 0.08, 0.3]} />
                <MatcapMat color="#E8604C" />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* 시소 */}
      {!isBlocked(-12, 17) && (
        <group position={[-12, 0, 17]} rotation={[0, 0.9, 0]}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.18, 0.26, 0.6, 8]} />
            <MatcapMat color="#7B4B94" />
          </mesh>
          <mesh position={[0, 0.62, 0]} rotation={[0, 0, 0.16]}>
            <boxGeometry args={[3.4, 0.1, 0.4]} />
            <MatcapMat color="#E8A33C" />
          </mesh>
        </group>
      )}

      {/* 모래놀이터 — 모래성 하나까지 */}
      {!isBlocked(-17, 20) && (
        <group position={[-17, 0, 20]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[1.6, 1.7, 0.24, 8]} />
            <MatcapMat color="#C9A46B" />
          </mesh>
          <mesh position={[0, 0.25, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
            <circleGeometry args={[1.35, 8]} />
            <MatcapMat color="#EFDCA8" />
          </mesh>
          <mesh position={[0.3, 0.45, 0.2]}>
            <coneGeometry args={[0.3, 0.5, 6]} />
            <MatcapMat color="#E3CD96" />
          </mesh>
        </group>
      )}

      {/* 사방치기 — 바닥에 그려진 놀이판 */}
      {!isBlocked(5, 12) && (
        <group position={[5, 0.035, 12]} rotation={[0, 0.15, 0]}>
          {[[0, 0], [0, 1.05], [-0.55, 2.1], [0.55, 2.1], [0, 3.15], [-0.55, 4.2], [0.55, 4.2]].map(([hx, hz], i) => (
            <mesh key={i} position={[hx, 0, hz]} rotation={[NEG_HALF_PI, 0, 0]}>
              <planeGeometry args={[0.95, 0.95]} />
              <MatcapMat color="#FFF6E4" transparent opacity={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {/* 화단 — 입구 양옆 */}
      {([-6, 6] as const).map((fx) => !isBlocked(fx, 7) && (
        <group key={fx} position={[fx, 0, 7]}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[1.8, 0.5, 0.7]} />
            <MatcapMat color="#B0603F" />
          </mesh>
          {([-0.55, 0, 0.55] as const).map((px, i) => (
            <mesh key={px} position={[px, 0.62, 0]}>
              <sphereGeometry args={[0.22, 6, 5]} />
              <MatcapMat color={['#E8604C', '#E8A33C', '#D86CB0'][i]} />
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
              <MatcapMat color={c} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <group>
            <mesh position={[-0.17, 0, 0]}>
              <planeGeometry args={[0.34, 0.24]} />
              <MatcapMat color={c} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/**
 * 마을에 숨은 것들 — **걸어가면 주워진다.**
 *
 * 누르는 것이 아니라 **다가가면** 줍는다. 작은 물건을 손가락으로 조준하는 건
 * 휴대폰에서 어렵고, 무엇보다 **걸어다니게 하려고 만든 것**이라
 * 걷는 행위 자체가 줍는 방법이어야 한다.
 *
 * 거리 판정은 화면 그리기와 따로 돈다(창구 직원과 같은 방식) —
 * `useFrame` 안에서 상태를 바꾸면 1초에 60번 다시 그린다.
 */
function Collectibles({
  items, picked, avatarPos, onPick,
}: {
  items: CollectItem[];
  picked: ReadonlySet<string>;
  avatarPos: React.RefObject<THREE.Vector3>;
  onPick: (item: CollectItem) => void;
}) {
  const bob = useRef<THREE.Group>(null);

  /** 아직 안 주운 것 */
  const rest = useMemo(() => items.filter((it) => !picked.has(it.id)), [items, picked]);

  /**
   * 그중 **눈에 들어오는 거리**만 그린다.
   *
   * 멀리 있는 것까지 다 띄우면 어느 게 가까운지 헷갈리고, `Html` 이 열두 개
   * 떠 있어 느려진다. 걸어가면 하나씩 나타나는 편이 낫다.
   */
  const [nearIds, setNearIds] = useState<ReadonlySet<string>>(() => new Set());
  const left = useMemo(() => rest.filter((it) => nearIds.has(it.id)), [rest, nearIds]);

  useEffect(() => {
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;

      const seen = new Set<string>();
      for (const it of rest) {
        const d = Math.hypot(p.x - it.x, p.z - it.z);
        if (d < PICK_RADIUS) {
          onPick(it);
          // 한 번에 하나만 — 여럿이 겹치면 무엇을 주웠는지 모른다
          break;
        }
        if (d < COLLECT_SHOW_RANGE) seen.add(it.id);
      }
      setNearIds((prev) => {
        if (prev.size === seen.size && Array.from(seen).every((id) => prev.has(id))) return prev;
        return seen;
      });
    }, 220);
    return () => clearInterval(t);
  }, [rest, avatarPos, onPick]);

  // 둥실 떠오르며 돈다 — 멈춰 있으면 배경이 되고, 움직이면 눈에 띈다
  useFrame(({ clock }) => {
    const g = bob.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      c.position.y = 0.7 + Math.sin(t * 1.8 + i * 1.3) * 0.22;
      c.rotation.y = t * 0.8 + i;
    });
  });

  return (
    <group ref={bob}>
      {left.map((it) => (
        <group key={it.id} position={[it.x, 0.7, it.z]}>
          {/* 반짝임 — 멀리서도 '저기 뭔가 있다' 가 보여야 한다 */}
          <mesh>
            <sphereGeometry args={[0.55, 10, 8]} />
            <meshBasicMaterial color="#FFF6C8" transparent opacity={0.34} />
          </mesh>
          <Html center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
            <div style={{ fontSize: '22px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}>
              {it.kind.emoji}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/**
 * 바다 — **해안선에서 계산해 낸다.**
 *
 * 애월은 해안 마을이고 자리 셋 중 둘이 해변인데, 그동안 3D 에 바다가 없었다.
 * 초록 풀밭이 수평선까지 이어져서 **바다 마을이 산골처럼 보였다.**
 *
 * 어느 쪽이 바다인지는 **적어 두지 않는다.** OSM 해안선에는 규칙이 있다 —
 * **진행 방향 왼쪽이 육지, 오른쪽이 바다.** 그래서 점 차례만 지키면
 * 바다 쪽은 계산으로 나온다. 자리를 늘려도 손댈 것이 없다.
 *
 * 우리 좌표는 x=동쪽, z=**남쪽**이다(위도를 뒤집었다). 이 평면에서
 * 진행 방향 `d=(dx,dz)` 의 왼쪽은 `(dz,-dx)`, 오른쪽(바다)은 `(-dz,dx)` 다.
 */
function Sea({ lines, radius }: { lines: XZ[][]; radius: number }) {
  const waves = useRef<THREE.Group>(null);

  /**
   * 물 덩어리 — **칸마다 바다인지 물어서** 만든다.
   *
   * 예전에는 해안선을 바다 쪽으로 밀어내 사각형을 이어 붙였는데,
   * 굽은 해안(애월항)에서 그 조각들이 **마을 전체를 덮었다.**
   * 지금은 `seaMask` 가 칸마다 '가장 가까운 해안선의 어느 쪽인가' 로 답한다.
   */
  const geo = useMemo(() => {
    const rects = seaRects(seaMask(lines, radius, 16));
    if (rects.length === 0) return null;

    const positions: number[] = [];
    for (const r of rects) {
      const x0 = r.x;
      const x1 = r.x + r.w;
      const z0 = r.z;
      const z1 = r.z + r.d;
      positions.push(x0, 0, z0, x0, 0, z1, x1, 0, z0);
      positions.push(x1, 0, z0, x0, 0, z1, x1, 0, z1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }, [lines, radius]);

  useEffect(() => () => { geo?.dispose(); }, [geo]);

  /** 물결 — 해안선을 따라 낮게 오르내리는 흰 띠 */
  useFrame(({ clock }) => {
    const g = waves.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      c.position.y = 0.16 + Math.sin(t * 0.9 + i * 0.7) * 0.07;
      const m = (c as THREE.Mesh).material as THREE.Material & { opacity: number };
      m.opacity = 0.34 + Math.sin(t * 0.9 + i * 0.7) * 0.16;
    });
  });

  if (!geo) return null;

  return (
    <group>
      {/* 물 — 바닥보다 살짝 낮게 깔아 모래와 자연스럽게 만난다 */}
      <mesh geometry={geo} position={[0, 0.05, 0]}>
        <MatcapMat
          color="#3E9BC4"
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 모래밭과 파도 — 해안선을 따라간다 */}
      <group ref={waves}>
        {lines.map((line, li) =>
          line.slice(0, -1).map((p, i) => {
            const q = line[i + 1];
            const dx = q[0] - p[0];
            const dz = q[1] - p[1];
            const len = Math.hypot(dx, dz);
            if (len < 3) return null;
            return (
              <mesh
                key={`${li}-${i}`}
                position={[(p[0] + q[0]) / 2, 0.16, (p[1] + q[1]) / 2]}
                rotation={[NEG_HALF_PI, 0, Math.atan2(dx, dz)]}
              >
                <planeGeometry args={[7, len * 1.1]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.36} />
              </mesh>
            );
          })
        )}
      </group>

      {/* 백사장 — 물가에 밝은 모래 띠 */}
      {lines.map((line, li) =>
        line.slice(0, -1).map((p, i) => {
          const q = line[i + 1];
          const dx = q[0] - p[0];
          const dz = q[1] - p[1];
          const len = Math.hypot(dx, dz);
          if (len < 3) return null;
          return (
            <mesh
              key={`s${li}-${i}`}
              position={[(p[0] + q[0]) / 2, 0.06, (p[1] + q[1]) / 2]}
              rotation={[NEG_HALF_PI, 0, Math.atan2(dx, dz)]}
            >
              <planeGeometry args={[16, len * 1.15]} />
              <MatcapMat color="#E8DCC0" />
            </mesh>
          );
        })
      )}
    </group>
  );
}

/**
 * 자리와 자리를 잇는 **끝단 화살표.**
 *
 * 마을 끝에 다다르면 보이지 않는 벽에 막힌다 — 그게 세상의 끝처럼 느껴지면
 * 아이는 더 갈 곳이 없다고 생각한다. **그 방향에 실제로 무엇이 있는지**를
 * 세워 두면, 막힌 벽이 문이 된다.
 *
 * 자리는 그 방향 실제 방위에 선다(`gatesFrom`). 그래서 "서쪽으로 계속 가면
 * 한담" 이 지도에서도 몸으로도 같은 말이 된다.
 */
function WarpGate({
  x, z, yaw, emoji, name, dirLabel, distLabel, onAsk,
}: {
  x: number; z: number; yaw: number;
  emoji: string; name: string; dirLabel: string; distLabel: string;
  onAsk: () => void;
}) {
  const arrow = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    // 살짝 떠 있게 — 멈춰 있으면 배경이 되고, 움직이면 눈이 간다
    if (arrow.current) arrow.current.position.y = 4.6 + Math.sin(clock.elapsedTime * 1.6) * 0.28;
  });

  const press = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onAsk(); };
  const hover = (e: { stopPropagation: () => void }) => {
    e.stopPropagation(); document.body.style.cursor = 'pointer';
  };
  const out = () => { document.body.style.cursor = 'auto'; };

  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {/* 발밑 판 — 여기 서면 넘어간다는 자리 표시 */}
      <mesh position={[0, 0.06, 1.6]} rotation={[NEG_HALF_PI, 0, 0]}>
        <circleGeometry args={[3.2, 28]} />
        <MatcapMat color="#E8D9B4" />
      </mesh>

      {/* 기둥 둘 */}
      {([-2.2, 2.2] as const).map((px) => (
        <mesh key={px} position={[px, 1.9, 0]} onClick={press} onPointerOver={hover} onPointerOut={out}>
          <cylinderGeometry args={[0.16, 0.2, 3.8, 8]} />
          <MatcapMat color="#8A6038" />
        </mesh>
      ))}
      {/* 표지판 */}
      <mesh position={[0, 3.5, 0]} onClick={press} onPointerOver={hover} onPointerOut={out}>
        <boxGeometry args={[5.4, 1.5, 0.22]} />
        <MatcapMat color="#FFF3D8" />
      </mesh>
      <mesh position={[0, 3.5, 0.13]} onClick={press} onPointerOver={hover} onPointerOut={out}>
        <boxGeometry args={[5.0, 1.15, 0.04]} />
        <MatcapMat color="#3BAF9F" />
      </mesh>

      {/* 떠 있는 화살표 — 나아갈 쪽을 가리킨다 */}
      <group ref={arrow} position={[0, 4.6, 0]}>
        <mesh rotation={[HALF_PI, 0, 0]} onClick={press} onPointerOver={hover} onPointerOut={out}>
          <coneGeometry args={[0.85, 1.9, 4]} />
          <MatcapMat color="#E8A33C" />
        </mesh>
      </group>

      <Html position={[0, 6.6, 0]} center style={{ pointerEvents: 'auto' }} zIndexRange={[8, 0]}>
        <div
          onClick={onAsk}
          style={{
            background: '#FFF8E7', color: '#3A3226', fontFamily: 'Pretendard, sans-serif',
            padding: '8px 16px', borderRadius: '14px', whiteSpace: 'nowrap', userSelect: 'none',
            border: '3px solid #3BAF9F', boxShadow: '0 5px 0 #2E8B7A', cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 900 }}>{emoji} {name}</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#A6762A', marginTop: '2px' }}>
            {dirLabel}쪽 {distLabel} · 눌러서 가기 ›
          </div>
        </div>
      </Html>
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
    <mesh geometry={geo} position={[0, y, 0]}>
      <MatcapMat color={color} />
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
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[1.25, 0.42, 2.1]} />
        <MatcapMat color={c.body} />
      </mesh>
      {/* 지붕 */}
      <mesh position={[0, 0.68, -0.12]}>
        <boxGeometry args={[1.0, 0.36, 1.0]} />
        <MatcapMat color={c.roof} />
      </mesh>
      {/* 로켓카는 뒤에 불꽃 */}
      {vehicleId === 'vehicle-rocket' && (
        <mesh position={[0, 0.3, 1.2]} rotation={[PI * 0.5, 0, 0]}>
          <coneGeometry args={[0.22, 0.6, 8]} />
          <MatcapMat color="#FF8A3C" />
        </mesh>
      )}
      {/* 바퀴 — 좌우 앞뒤 네 개 */}
      {([[-0.62, 0.7], [0.62, 0.7], [-0.62, -0.7], [0.62, -0.7]] as const).map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.2, z]} rotation={[0, 0, PI * 0.5]}>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 12]} />
          <MatcapMat color="#3A3226" />
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
  spots, currentSpot, onGoSpot, isHome = true, picked, onPickUp,
  cleared, onPurify, grade,
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
  /** 이 학교의 모든 자리 (애월리·한담·곽지 …). 읍 지도와 끝단 화살표가 이걸로 선다. */
  spots?: VillageSpot[];
  /** 지금 있는 자리 */
  currentSpot?: VillageSpot;
  /** 다른 자리로 넘어갈 때 */
  onGoSpot?: (spotId: string) => void;
  /** 마을에서 주운 것들 */
  picked?: ReadonlySet<string>;
  /** 하나 주웠을 때 */
  onPickUp?: (item: CollectItem) => void;
  /** 마을에서 정화한 것들 */
  cleared?: ReadonlySet<string>;
  /** 하나 정화했을 때 */
  onPurify?: (mob: Mob) => void;
  /**
   * 이 아이 학년 — **우두머리 문제를 여기에 맞춘다.**
   * 없으면 학년을 안 가리고 낸다(로그인 안 한 손님 등).
   */
  grade?: number;
  /**
   * 학교가 서 있는 자리인가.
   *
   * **집 자리에만 학교가 있다.** 곽지 한가운데에 학교 자리와 애월진성이
   * 또 서 있으면 아이는 학교가 두 개라고 배운다 — 지도가 거짓말을 하는 것이다.
   */
  isHome?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 어디서 시작하나 — **들어갔던 문 앞이면 거기서, 아니면 학교 앞에서.**
   *
   * `useState` 의 게으른 초기값으로 **딱 한 번만 꺼낸다.**
   * `useRef(꺼내기())` 로 쓰면 안 된다 — 인자는 그릴 때마다 계산되므로
   * 저장소를 매번 읽고 지운다(값은 첫 것만 남지만 헛일을 계속 한다).
   */
  const [spawn] = useState<[number, number, number]>(() => {
    const back = takeReturn(currentSpot?.id ?? '');
    return back ? [back.x, 0, back.z] : [0, 0, 30];
  });
  const avatarPos = useRef(new THREE.Vector3(...spawn));
  const avatarYaw = useRef(0);

  /**
   * 문에 들어가기 직전에 서 있던 자리를 적어 둔다.
   *
   * **모든 입구가 이걸 거쳐야 한다.** 한 군데라도 빠뜨리면 그 문으로 들어갔다
   * 나올 때만 학교 앞으로 튕겨 나온다 — 아이는 그걸 버그로도 못 알아본다.
   */
  const remember = useCallback(() => {
    saveReturn(
      currentSpot?.id ?? '',
      avatarPos.current.x,
      avatarPos.current.z,
      avatarYaw.current
    );
  }, [currentSpot]);

  /** 서 있는 동안 자리를 계속 맞춰 둔다 — 문을 안 거치고 나가도 제자리로 돌아온다 */
  useEffect(() => { saveSpot(currentSpot?.id ?? ''); }, [currentSpot]);

  const enterPlace = useCallback((kind: string) => { remember(); onEnterPlace?.(kind); },
    [remember, onEnterPlace]);
  const enterSite = useCallback((siteId: string) => { remember(); onEnterSite?.(siteId); },
    [remember, onEnterSite]);
  const enterSchool = useCallback(() => { remember(); onEnterSchool(); },
    [remember, onEnterSchool]);
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
  /**
   * 이 자리에 서는 유적·명소와 **그 자리 안 좌표.**
   *
   * 두 갈래다.
   * 1) `spotId` 가 지금 자리와 같은 것 — 실제 좌표(lat/lng)를 자리 한가운데 기준
   *    미터로 바꿔 **거기 그대로** 세운다.
   * 2) 집 자리에서는 예전처럼 **걸어갈 수 있는 곳**만. 자리가 정해지지 않은
   *    옛 유적들이라 학교 옆에 세운다.
   */
  const sites = useMemo(() => {
    const all = localSites ?? [];
    const [clat, clng] = data.c ?? [0, 0];
    const mPerDegLng = 111320 * Math.cos((clat * PI) / 180);

    const mine = currentSpot
      ? all.filter((s) => s.spotId === currentSpot.id)
      : [];
    const placed = mine.map((s) => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number' || !clat) {
        return { site: s, x: -26, z: 18 };
      }
      return {
        site: s,
        x: Math.round((s.lng - clng) * mPerDegLng),
        z: Math.round(-(s.lat - clat) * 111320),
      };
    });
    if (!isHome) return placed;

    /**
     * 집 자리 — 자리가 안 정해진 옛 유적 중 걸어갈 수 있는 것.
     *
     * **겹치지 않게 흩어 놓는다.** 예전에는 전부 (-26, 18) 한 자리에 세워서,
     * 애월진성과 제주 밭담이 **정확히 포개졌다** — 나중 것(밭담)만 보이고
     * 학교가 선 애월진성 터는 아예 안 보였다. 실제로 그렇게 보였다.
     *
     * 첫 자리는 학교 왼쪽 앞이다. 애월초는 실제로 애월진성 터에 세워졌으므로
     * **표에서 제일 먼저 오는 애월진성이 그 자리에 선다** — 지어낸 자리가 아니다.
     */
    const SPOTS: [number, number][] = [
      [-26, 18], [30, 22], [-34, -14], [26, -20], [-12, 36], [14, 38],
    ];
    const legacy = all
      .filter((s) => !s.spotId && s.km <= WALKABLE_KM)
      .map((s, i) => {
        const [lx, lz] = SPOTS[i % SPOTS.length];
        return { site: s, x: lx, z: lz };
      });
    return [...placed, ...legacy];
  }, [localSites, isHome, currentSpot, data.c]);
  /** 워프한 직후 잠깐 띄우는 말 */
  const [warpedTo, setWarpedTo] = useState('');
  /**
   * 끝단 화살표를 눌렀을 때 — **바로 안 넘긴다.**
   * 걸어다니다 실수로 스치면 딴 동네로 끌려간다. 한 번 물어보고 간다.
   */
  const [gateAsk, setGateAsk] = useState<VillageSpot | null>(null);

  /**
   * 이 자리에서 갈 수 있는 이웃 자리들 — 맵 끝단에 화살표로 선다.
   * 자리 정보가 없으면(옛 학교) 아무것도 안 선다 — 예전 그대로다.
   */
  const gates = useMemo(
    () => (currentSpot && (spots?.length ?? 0) > 1 ? gatesFrom(currentSpot) : []),
    [currentSpot, spots]
  );

  /** 이 자리에 숨어 있는 것들 — 씨앗에서 계산한다(저장된 것이 없다) */
  const collectItems = useMemo(
    () => (currentSpot ? itemsOfSpot(currentSpot.id, data.r, data.b, data.cl) : []),
    [currentSpot, data.r, data.b, data.cl]
  );
  /** 방금 주운 것 — 잠깐 띄웠다 사라진다 */
  const [justPicked, setJustPicked] = useState<CollectItem | null>(null);

  /**
   * ---------- 마을 정화 ----------
   *
   * 몹도 줍기와 같이 **씨앗에서 계산한다** — 저장된 것이 없다.
   * 같은 자리에 같은 것이 있어야 "저기 폐그물 있어" 가 친구끼리 통한다.
   */
  const mobs = useMemo(
    () => (currentSpot && onPurify ? mobsOfSpot(currentSpot.id, data.r, data.b, data.cl) : []),
    [currentSpot, data.r, data.b, data.cl, onPurify]
  );
  /** 문제를 맞힌 우두머리 — 3D 쪽이 이걸 보고 마무리한다 */
  const [solved, setSolved] = useState<ReadonlySet<string>>(() => new Set());
  /** 약점이 드러난 채 곁에 있는 우두머리 (문제를 미뤘을 때 다시 풀라고) */
  const [bossNear, setBossNear] = useState<Mob | null>(null);
  /** 문제 창이 열려 있나 */
  const [quiz, setQuiz] = useState<{ mob: Mob; q: BellQuestion } | null>(null);
  const [answer, setAnswer] = useState<string>('');
  const [quizMsg, setQuizMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** 방금 정화한 것 — 배울 것 한 줄을 띄운다 */
  const [justPurified, setJustPurified] = useState<Mob | null>(null);
  /** 칼을 뽑고 있나 — 뽑았으면 아래 단추가 '베기' 로 바뀐다 */
  const [armed, setArmed] = useState(false);
  /** 화면 밖에 있는 가까운 놈들 — 가장자리 화살표로 알린다 */
  const [offscreen, setOffscreen] = useState<OffscreenMob[]>([]);

  /** 자리를 옮기면 다 잊는다 */
  useEffect(() => {
    setSolved(new Set());
    setBossNear(null);
    setQuiz(null);
    setJustPurified(null);
  }, [currentSpot]);

  /**
   * 문제를 낸다 — **껍질을 깨고 난 뒤에** 부른다.
   *
   * **골든벨 문제은행을 그대로 쓴다** — 학년이 있으면 ±2학년으로 걸러진다.
   * 몹마다 씨앗이 달라 늘 같은 문제가 나온다. 다시 도전할 때 문제가 바뀌면
   * 아이가 "아까 그거 뭐였지" 하고 헷갈린다.
   */
  const openQuiz = useCallback((mob: Mob) => {
    setQuiz((cur) => {
      // 이미 떠 있으면 그대로 둔다 — 3D 쪽이 여러 번 불러도 문제가 새로 안 뜬다
      if (cur) return cur;
      let h = 0;
      for (let i = 0; i < mob.id.length; i++) h = (Math.imul(h, 31) + mob.id.charCodeAt(i)) | 0;
      const q = pickBellQuestions(h >>> 0, 1, grade)[0];
      if (!q) return cur;
      setAnswer('');
      setQuizMsg(null);
      // 문제를 푸는 동안에는 안 움직인다 — 뒤에서 칼이 나가면 안 된다
      setMovementLock(true);
      playSound('open');
      return { mob, q };
    });
  }, [grade]);

  const closeQuiz = () => {
    setQuiz(null);
    setQuizMsg(null);
    setMovementLock(false);
  };

  const submitAnswer = (given: number | string) => {
    if (!quiz) return;
    if (isCorrect(quiz.q, given)) {
      // 맞히면 3D 쪽이 이걸 보고 마무리 일격을 넣는다
      setSolved((prev) => new Set(prev).add(quiz.mob.id));
      setQuizMsg({ ok: true, text: `맞았어요! ${quiz.q.why}` });
      setTimeout(closeQuiz, 1600);
    } else {
      playSound('error');
      setQuizMsg({ ok: false, text: `아니에요. 정답은 ${answerText(quiz.q)} — ${quiz.q.why}` });
    }
  };

  /**
   * **한 번 알리고 마는 말은 저절로 사라진다.**
   *
   * 주웠다·정화했다 같은 것은 읽고 나면 볼 일이 없는데, ✕ 를 눌러야 없어지니
   * 걸어다니는 내내 화면 한가운데를 차지했다. 휴대폰에서는 그 한 줄이 마을을 가린다.
   * 안내 한 줄(`hintOn`)을 3초로 둔 것과 같은 선이다.
   */
  useEffect(() => {
    if (!justPurified) return;
    const t = setTimeout(() => setJustPurified(null), 2800);
    return () => clearTimeout(t);
  }, [justPurified]);

  useEffect(() => {
    if (!justPicked) return;
    const t = setTimeout(() => setJustPicked(null), 2800);
    return () => clearTimeout(t);
  }, [justPicked]);

  /**
   * 마을 소리 — 파도·바람·새·발소리.
   *
   * **화면을 떠나면 반드시 끈다.** 안 끄면 교실에서도 파도가 친다.
   * 자리를 옮기면(`data` 가 바뀌면) 껐다 다시 켠다 — 곽지 파도가
   * 애월리까지 따라오면 안 된다.
   */
  useEffect(() => {
    const amb = startAmbience();
    if (!amb) return;

    /** 해안선 점들 — 거리를 잴 때 쓴다. 없으면 파도도 없다. */
    const shore = (data.cl ?? []).flat();

    let walked = 0;
    let last: { x: number; z: number } | null = null;

    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;

      // 바다가 가까울수록 크게. 40m 안이면 최대, 320m 밖이면 안 들린다.
      if (shore.length > 0) {
        let d2 = Infinity;
        for (const s of shore) {
          const dx = p.x - s[0];
          const dz = p.z - s[1];
          const v = dx * dx + dz * dz;
          if (v < d2) d2 = v;
        }
        const d = Math.sqrt(d2);
        amb.setSea(d <= 40 ? 1 : d >= 320 ? 0 : 1 - (d - 40) / 280);
      }

      // 걸은 거리로 발소리를 낸다 — 한 걸음 폭쯤마다
      if (last) {
        walked += Math.hypot(p.x - last.x, p.z - last.z);
        if (walked > 1.7) { walked = 0; amb.step(); }
      }
      last = { x: p.x, z: p.z };
    }, 180);

    return () => { clearInterval(t); amb.stop(); };
  }, [data]);

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
    // 가상 관공서는 **집 자리에만** 세운다. 곽지에 읍사무소를 또 세우면 거짓말이다.
    if (!isHome || !localPlaces?.length) return [];

    /** 건물로 이미 찾은 것 — 여기는 진짜 다각형이 있으니 손댈 것이 없다 */
    const found = new Set<string>();
    for (const b of data.b) {
      const kind = civicKindOf(b, localPlaces);
      if (kind) found.add(kind);
    }

    /**
     * **점(poi)으로만 있는 곳은 그 자리에 세운다.**
     *
     * OSM 에서 우체국·경찰서·농협은 건물 다각형이 아니라 **점**으로만 찍혀
     * 있는 경우가 많다. 예전에는 건물만 뒤져서 못 찾았고, 못 찾으면
     * **학교 둘레에 가짜로 세웠다** — 실측해 보니 아홉 곳이 다 실재하는데도
     * 그랬다(경찰서 456m, 농협 497m, 우체국 528m …).
     *
     * 우리 동네를 배우는 화면에서 우체국 자리를 지어내면 안 배우느니만 못하다.
     * 이제는 **점이 있으면 그 좌표에** 세운다. 모양은 몰라도 자리는 진짜다.
     */
    const byKind = new Map<string, { x: number; z: number }>();
    for (const q of data.poi) {
      const kind = civicKindOf({ n: q.n, k: q.k }, localPlaces);
      if (!kind || found.has(kind)) continue;
      const cur = byKind.get(kind);
      // 같은 종류가 여럿이면 가까운 것 하나만 — 우체국이 둘이면 아이가 헷갈린다
      if (!cur || Math.hypot(q.x, q.z) < Math.hypot(cur.x, cur.z)) {
        byKind.set(kind, { x: q.x, z: q.z });
      }
    }

    /**
     * **끝내 못 찾은 곳은 세우지 않는다.**
     *
     * 지도에 없으면 없는 것이다. 지어내느니 안 보이는 편이 낫다 —
     * 선생님이 필요하면 표(`rpgPlaces`)에서 직접 고쳐 넣을 수 있다.
     */
    return localPlaces
      .filter((p) => !found.has(p.kind) && byKind.has(p.kind))
      .map((p) => ({ place: p, ...byKind.get(p.kind)! }));
  }, [data.b, data.poi, localPlaces, isHome]);

  const targets: WarpTarget[] = useMemo(
    () => [
      // 집 자리가 아니면 '학교' 점을 안 찍는다 — 곽지에 학교가 있는 것처럼 보인다
      ...warpTargets([...buildingPois, ...data.poi], isHome ? schoolName : ''),
      ...sites.map((s) => ({
        id: `site-${s.site.id}`,
        name: s.site.name,
        x: s.x,
        z: s.z,
        dist: Math.hypot(s.x, s.z),
      })),
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
    for (const site of sites) s.add(`site-${site.site.id}`);
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
   *
   * **감싸는 네모 하나로 막으면 안 된다.** 비스듬히 선 건물은 그 네모가
   * 빈 땅까지 덮어서, 아무것도 없는 풀밭에서 막혀 옆으로 돌아가게 된다
   * (실측: 막힌 넓이의 40~56%가 빈 땅이었다). 그래서 다각형을 작은 네모로
   * 쪼갠다 — `village-blocks.ts` 참고.
   */
  const obstacles: Obstacle[] = useMemo(
    () => [
      ...blocksOfBuildings(data.b),
      ...missingPlaces.map((mp) => ({
        x: mp.x, z: mp.z, halfW: 4, halfD: 3,
      })),
    ],
    [data.b, missingPlaces]
  );

  useEffect(() => {
    /**
     * 세로로 긴 화면에서는 **조금 더 물러서서** 본다.
     * 시야를 넓혀도(FitFov) 폰은 여전히 담기는 폭이 좁다. 한두 걸음 물러서면
     * 앞쪽이 그만큼 더 들어와, 걷다 마주치는 것을 놓치지 않는다.
     */
    const portrait = typeof window !== 'undefined' && window.innerWidth < window.innerHeight;
    resetControls(0, portrait ? 15 : 12, 0.45);
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
        /**
         * `far` 는 지평선 언덕까지 담아야 한다. 한라산이 `R*3.25` 까지 뻗으므로
         * 1600 으로 두면 **R=800 인 자리에서 산이 잘려 사라진다.**
         */
        camera={{ position: [0, 24, 60], fov: 58, near: 0.5, far: 6000 }}
        /**
         * 그리는 해상도.
         *
         * **휴대폰에서는 1.5 로 묶는다.** 요즘 폰은 DPR 이 3까지 가는데,
         * 3 이면 픽셀이 **아홉 배**다. 마을처럼 넓은 3D 에서는 그 차이가
         * 그대로 발열과 끊김으로 온다. 1.5 면 글자도 안 뭉개지고 부담은 4분의 1이다.
         * (책상 컴퓨터는 화면이 커도 GPU 가 받쳐주므로 2 까지 둔다)
         */
        dpr={[1, typeof window !== 'undefined' && window.innerWidth < 820 ? 1.5 : 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE8F5' }}
        /**
         * **화면을 눌러 벤다.**
         *
         * 액션 RPG 는 마우스로 친다. 화면 아래 단추만 두면 그건 게임이 아니라
         * 리모컨이다(단추는 휴대폰용으로 남겨 둔다).
         *
         * `onPointerMissed` 를 쓰는 이유: 이건 **아무것도 안 눌렸을 때만** 온다.
         * 우체국 문이나 워프 화살표를 누르면 그쪽 손잡이가 먼저 먹으므로
         * 여기까지 안 내려온다 — 문을 열려다 칼을 휘두르는 일이 없다.
         *
         * 끌었으면 안 나간다(`wasTap`). 시점을 돌리고 손을 뗄 때마다
         * 헛손질이 나가면 조작이 안 된다.
         */
        onPointerMissed={(e) => {
          if ((e as MouseEvent).button !== undefined && (e as MouseEvent).button !== 0) return;
          if (!wasTap()) return;
          requestAttack();
        }}
      >
        {/*
          하늘빛은 위에서 파랗게, 땅 반사광은 아래에서 초록으로 —
          한 색으로 고르게 밝히는 ambient 만 쓰면 입체감이 죽는다.
        */}
        {/* 화면 비율에 맞춰 시야 맞추기 — 폰에서 가로로 좁아지는 것을 막는다 */}
        <FitFov />

        <hemisphereLight args={['#CFEFFF', '#9CC98F', 0.75]} />
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[120, 200, 100]}
          intensity={1.05}
          color="#FFF4DC"
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
        {/* 언덕을 멀리 밀어냈으므로 안개도 그만큼 멀리 걷어야 산이 보인다 */}
        <fog attach="fog" args={['#BFE8F5', R * 0.5, R * 3.6]} />

        <Ground R={R} />
        <Horizon R={R} />
        {/* 바다 — 해안선이 구워져 있는 자리에만 (뭍 마을에는 안 뜬다) */}
        {(data.cl?.length ?? 0) > 0 && <Sea lines={data.cl!} radius={R} />}

        <Areas list={data.a} />
        <Roads list={data.rd} />
        <VillageProps radius={R} buildings={data.b} avatarPos={avatarPos} />
        <Buildings list={data.b} onEnterPlace={enterPlace} places={localPlaces} />
        {isHome && <SchoolYard buildings={data.b} />}
        <Butterflies />

        {/* 마을에 숨은 것 — 다가가면 주워진다 */}
        {onPickUp && collectItems.length > 0 && (
          <Collectibles
            items={collectItems}
            picked={picked ?? EMPTY_PICKED}
            avatarPos={avatarPos}
            onPick={(it) => { onPickUp(it); setJustPicked(it); }}
          />
        )}

        {/* 마을을 더럽히는 것들 — 다가가면 칼이 나온다 */}
        {onPurify && mobs.length > 0 && (
          <VillageMobs
            mobs={mobs}
            cleared={cleared ?? EMPTY_PICKED}
            solved={solved}
            avatarPos={avatarPos}
            onPurified={(m) => { onPurify(m); setJustPurified(m); }}
            onBossNear={setBossNear}
            onBossWeak={openQuiz}
            onArmedChange={setArmed}
            onOffscreen={setOffscreen}
          />
        )}

        {/* 이웃 자리로 넘어가는 끝단 화살표 */}
        {gates.map((g) => (
          <WarpGate
            key={g.spot.id}
            x={g.x}
            z={g.z}
            yaw={g.yaw}
            emoji={g.spot.emoji}
            name={g.spot.name}
            dirLabel={g.dirLabel}
            distLabel={g.distLabel}
            onAsk={() => setGateAsk(g.spot)}
          />
        ))}

        {/*
          우리 고장 유적·명소 — **실제 좌표에 선다.**

          예전에는 전부 학교 옆 한 자리(-26, 18)에 겹쳐 세웠다. 애월진성은
          실제로 학교 터라 맞았지만, 곽지패총·과물노천탕까지 거기 세우면
          **지도가 거짓말을 한다.** 좌표를 아는 곳은 그 자리에 둔다.

          생김새도 종류마다 다르다 — 성벽과 노천탕이 같은 돌담이면 구별이 안 된다.
        */}
        {sites.map((s) => (
          <group key={s.site.id} position={[s.x, 0, s.z]}>
            {s.site.axis === 'life' ? (
              /* 용천수 노천탕 — 돌담으로 두른 물 */
              <>
                <mesh position={[0, 0.06, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
                  <circleGeometry args={[4.2, 24]} />
                  <MatcapMat color="#7FD4E8" />
                </mesh>
                {Array.from({ length: 16 }, (_, i) => {
                  const a = (i / 16) * PI * 2;
                  return (
                    <mesh
                      key={i}
                      position={[Math.cos(a) * 4.5, 0.45, Math.sin(a) * 4.5]}
                      rotation={[0, -a, 0]}
                    >
                      <boxGeometry args={[1.9, 0.9, 0.7]} />
                      <MatcapMat color="#6E6862" />
                    </mesh>
                  );
                })}
                {/* 솟는 물 */}
                <mesh position={[0, 0.5, 0]}>
                  <cylinderGeometry args={[0.5, 0.3, 1, 10]} />
                  <MatcapMat color="#BEEBF7" transparent opacity={0.7} />
                </mesh>
              </>
            ) : s.site.axis === 'nature' ? (
              /* 현무암 해안 — 검은 바위와 나무 데크 */
              <>
                <mesh position={[0, 0.05, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
                  <planeGeometry args={[14, 3]} />
                  <MatcapMat color="#A07E55" />
                </mesh>
                {([-5, -2, 1.5, 5] as const).map((bx, i) => (
                  <mesh key={bx} position={[bx, 0.7, -2.6 - (i % 2) * 0.8]}>
                    <dodecahedronGeometry args={[1.1 + (i % 3) * 0.35, 0]} />
                    <MatcapMat color="#4A4744" />
                  </mesh>
                ))}
                {/* 난간 */}
                {([-6, -2, 2, 6] as const).map((px) => (
                  <mesh key={`p${px}`} position={[px, 0.6, 1.4]}>
                    <cylinderGeometry args={[0.09, 0.09, 1.2, 6]} />
                    <MatcapMat color="#8B6C47" />
                  </mesh>
                ))}
                <mesh position={[0, 1.15, 1.4]}>
                  <boxGeometry args={[13, 0.1, 0.1]} />
                  <MatcapMat color="#A07E55" />
                </mesh>
              </>
            ) : (
              /* 옛터 — 남아 있는 성벽·돌담 한 자락 */
              <>
                <mesh position={[0, 1.6, 0]}>
                  <boxGeometry args={[10, 3.2, 1.4]} />
                  <MatcapMat color="#9A9188" />
                </mesh>
                <mesh position={[0, 3.3, 0]}>
                  <boxGeometry args={[10.4, 0.3, 1.7]} />
                  <MatcapMat color="#867D74" />
                </mesh>
              </>
            )}
            <Html position={[0, 5.2, 0]} center style={{ pointerEvents: 'auto' }} zIndexRange={[5, 0]}>
              <div
                onClick={() => enterSite(s.site.id)}
                style={{
                  background: '#FFF1D6', color: '#5B4A3B', fontWeight: 800, fontSize: '14px',
                  padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                  fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                  border: '2px solid #B08860', cursor: 'pointer',
                }}
              >
                {s.site.emoji} {s.site.name}
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
              <mesh position={[0, 3, 0]}>
                <boxGeometry args={[8, 6, 6]} />
                <MatcapMat color="#F4E8D0" />
              </mesh>
              {/* 박공지붕 — 납작한 판보다 '건물'로 읽힌다 */}
              <GableRoof w={8.8} d={6.8} y={6} color={mp.place.color} />
              {/* 창문 2열 */}
              {([-1.8, 1.8] as const).map((wx) =>
                ([2.5, 4.2] as const).map((wy) => (
                  <mesh key={`${wx}-${wy}`} position={[wx, wy, 3.05]}>
                    <planeGeometry args={[1.2, 1.0]} />
                    <MatcapMat color="#9FD4EE" />
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
                <MatcapMat color="#B5793F" />
              </mesh>
              {/* 현관 지붕 */}
              <mesh position={[0, 3.2, 3.6]}>
                <boxGeometry args={[2.4, 0.2, 1.4]} />
                <MatcapMat color="#867D74" />
              </mesh>
              {/* 기관별 특징 */}
              {k === 'post_office' && (
                <>
                  {/* 우체통 */}
                  <mesh position={[4.8, 0.7, 3.2]}>
                    <cylinderGeometry args={[0.35, 0.35, 1.4, 8]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                  <mesh position={[4.8, 1.5, 3.2]}>
                    <sphereGeometry args={[0.38, 8, 6]} />
                    <MatcapMat color="#C0392B" />
                  </mesh>
                </>
              )}
              {k === 'police' && (
                <>
                  {/* 경광등 */}
                  <mesh position={[0, 6.8, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.5, 8]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                </>
              )}
              {k === 'library' && (
                <>
                  {/* 옆면 서가 창 */}
                  {([-2, 0, 2] as const).map((bz) => (
                    <mesh key={bz} position={[-4.05, 3, bz]}>
                      <planeGeometry args={[0.1, 4]} />
                      <MatcapMat color="#9FD4EE" />
                    </mesh>
                  ))}
                </>
              )}
              {k === 'health' && (
                <>
                  {/* 십자 마크 */}
                  <mesh position={[0, 5, 3.06]}>
                    <planeGeometry args={[0.6, 1.6]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                  <mesh position={[0, 5, 3.06]}>
                    <planeGeometry args={[1.6, 0.6]} />
                    <MatcapMat color="#E8604C" />
                  </mesh>
                </>
              )}
              {k === 'nonghyup' && (
                <>
                  {/* 수확물 상자 */}
                  <mesh position={[4.5, 0.3, 1]}>
                    <boxGeometry args={[1, 0.6, 0.8]} />
                    <MatcapMat color="#C9A46B" />
                  </mesh>
                  <mesh position={[4.5, 0.8, 1]}>
                    <sphereGeometry args={[0.25, 6, 4]} />
                    <MatcapMat color="#4CAF50" />
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

        {/* 학교 자리 — **집 자리에서만.** 원점이 곧 학교다. 여기를 눌러 들어간다. */}
        {isHome && (
        <group
          position={[0, 0, 0]}
          onClick={(e) => { e.stopPropagation(); enterSchool(); }}
          onPointerOver={(e) => { e.stopPropagation(); setSchoolHot(true); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setSchoolHot(false); document.body.style.cursor = 'auto'; }}
        >
          <mesh position={[0, 0.06, 0]} rotation={[NEG_HALF_PI, 0, 0]}>
            <circleGeometry args={[8, 32]} />
            <MatcapMat color={schoolHot ? '#FFE9A8' : '#FFF4D0'} />
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
        )}

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
          start={spawn}
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
        {/*
          **칼을 뽑으면 이 자리가 베기 단추가 된다.**

          단추를 새로 얹을 자리가 없다 — 오른쪽 1층은 타기, 2층은 지도 보기,
          3층은 말풍선이 이미 쓰고 있다(위 주석의 층 구분). 억지로 끼우면
          전에 차 타기 단추가 조이스틱에 깔렸던 일이 되풀이된다.

          그래서 **바꿔 끼운다.** 코앞에 쓰레기가 있는데 차를 타야 할 일은 없고,
          몇 걸음 물러나면 원래 단추가 돌아온다.
        */}
        {armed ? (
          <button
            /* 손가락을 뗄 때가 아니라 **닿는 순간** 나가야 손맛이 난다 */
            onPointerDown={(e) => { e.preventDefault(); requestAttack(); }}
            className="rounded-full flex items-center justify-center select-none"
            style={{
              width: 76, height: 76,
              background: 'linear-gradient(160deg,#FFFDF6 0%,#DFF3FF 60%,#B9E4F7 100%)',
              color: '#0B3E52',
              border: '4px solid #7FC9E8',
              boxShadow: '0 5px 0 #4E9FC2, 0 10px 22px rgba(0,0,0,0.28)',
              fontSize: 13, fontWeight: 900, lineHeight: 1.15,
              touchAction: 'none',
            }}
          >
            <span style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 26, display: 'block' }}>🗡️</span>
              베기
            </span>
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* 탈것 고르는 시트 */}
      {vehOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(24,20,16,0.45)' }}
          {...backdropClose(() => setVehOpen(false))}
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

      {/*
        방금 주운 것 — **무엇을 주웠는지 그 자리에서 알려준다.**
        도감을 열어봐야 아는 것이면 줍는 재미가 없다. 배울 것 한 줄을 같이 띄운다.
      */}
      {justPicked && (
        <div
          className="pos-hint absolute left-1/2 -translate-x-1/2 z-40 w-[min(92vw,380px)]"
          style={{ animation: 'modal-fade 0.25s ease both' }}
        >
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: 'rgba(255,250,240,0.97)', border: '3px solid #E8A33C', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}
          >
            <span className="text-[30px] leading-none shrink-0">{justPicked.kind.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black" style={{ color: '#3A3226' }}>
                {justPicked.kind.name} 주웠다!
              </div>
              <div className="text-[12px] leading-relaxed mt-0.5" style={{ color: '#5B4A3B' }}>
                {justPicked.kind.note}
              </div>
            </div>
            <button
              onClick={() => setJustPicked(null)}
              className="shrink-0 h-7 w-7 rounded-full text-[13px] font-bold"
              style={{ background: 'rgba(0,0,0,0.06)', color: '#8A7A5F' }}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/*
        화면 밖에 있는 놈 — **어느 쪽인지 가장자리로 알린다.**

        폰은 가로 시야가 좁다(실측 PC 89도, 폰 37도). 40m 앞에서 담기는 폭이
        27m 인데 몹은 12~38m 간격이라, 걷는 내내 한 마리도 화면에 안 들어오는
        구간이 생긴다 — "모바일에서는 몹이 안 보인다" 가 이것이다.

        시야를 더 벌리면 어안렌즈처럼 휘어서 그게 더 이상하다. RPG 가 늘
        그러듯 **화살표로 가리킨다.**
      */}
      {offscreen.map((o) => (
        <div
          key={o.id}
          className="absolute z-20 pointer-events-none flex items-center gap-1 rounded-full px-2 py-1"
          style={{
            [o.side]: 6,
            top: `${28 + o.t * 34}%`,
            background: 'rgba(24,20,16,0.62)',
            flexDirection: o.side === 'left' ? 'row' : 'row-reverse',
            animation: 'modal-fade 0.25s ease both',
          }}
        >
          <span style={{ fontSize: 13, color: '#FFD9A8', fontWeight: 900 }}>
            {o.side === 'left' ? '◀' : '▶'}
          </span>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{o.emoji}</span>
          <span style={{ fontSize: 10, color: '#F5E9D6', fontWeight: 700 }}>{o.dist}m</span>
        </div>
      ))}

      {/*
        방금 정화한 것 — 주웠을 때와 같은 꼴로 띄운다.
        **베는 재미로 끝나면 안 된다.** 무엇이었는지, 왜 문제인지 한 줄이 남아야
        마을을 치운 것이 뜻을 갖는다.
      */}
      {justPurified && (
        <div
          className="pos-hint absolute left-1/2 -translate-x-1/2 z-40 w-[min(92vw,380px)]"
          style={{ animation: 'modal-fade 0.25s ease both' }}
        >
          <div
            className="rounded-2xl px-4 py-3 flex items-start gap-3"
            style={{ background: 'rgba(240,252,255,0.97)', border: '3px solid #6FC6E8', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}
          >
            <span className="text-[30px] leading-none shrink-0">✨</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black" style={{ color: '#0B3E52' }}>
                {justPurified.kind.name} 정화!
              </div>
              <div className="text-[12px] leading-relaxed mt-0.5" style={{ color: '#3E5A66' }}>
                {justPurified.kind.note}
              </div>
            </div>
            <button
              onClick={() => setJustPurified(null)}
              className="shrink-0 h-7 w-7 rounded-full text-[13px] font-bold"
              style={{ background: 'rgba(0,0,0,0.06)', color: '#5B7A88' }}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/*
        약점이 드러난 우두머리 곁 — **문제를 미뤘을 때 다시 부르는 단추.**
        껍질을 깨면 문제가 저절로 뜨지만, '나중에' 를 누르고 물러날 수 있다.
        그때 다시 다가오면 이 단추로 이어서 푼다.
      */}
      {bossNear && !quiz && (
        <div className="pos-hint absolute left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => openQuiz(bossNear)}
            className="rounded-full px-5 py-3 text-[15px] font-black whitespace-nowrap"
            style={{
              background: '#FFF8E7', color: '#7A2E10',
              border: '3px solid #F0A97C', boxShadow: '0 4px 0 #C2734E',
            }}
          >
            ❗ {bossNear.kind.name} — 문제 풀어 마무리
          </button>
        </div>
      )}

      {/*
        우두머리 마무리 문제 — **껍질을 깨고 나서 뜬다.**

        틀려도 잃는 것은 없다. 정답과 까닭을 보여주고 다시 풀게 한다 —
        여기서 아이를 벌주면 문제를 피해 다니게 된다.
      */}
      {quiz && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{ background: 'rgba(10,26,34,0.62)' }}
        >
          <div
            className="w-full max-w-[420px] rounded-3xl p-5"
            style={{ background: '#F7FCFF', border: '4px solid #7FC9E8', animation: 'modal-pop 0.28s ease both' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[26px]">{quiz.mob.kind.emoji}</span>
              <span className="text-[15px] font-black" style={{ color: '#0B3E52' }}>
                {quiz.mob.kind.name} — 마무리!
              </span>
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-black"
                style={{ background: '#DFF3FF', color: '#2A6F8C' }}
              >
                {quiz.q.grade}학년 문제
              </span>
            </div>

            <div className="text-[15px] font-bold leading-relaxed mb-4 mt-2" style={{ color: '#233A44' }}>
              {quiz.q.q}
            </div>

            {quiz.q.kind === 'choice' ? (
              <div className="flex flex-col gap-2">
                {(quiz.q.choices ?? []).map((c, i) => (
                  <button
                    key={i}
                    onClick={() => submitAnswer(i)}
                    disabled={!!quizMsg?.ok}
                    className="rounded-xl px-4 py-3 text-left text-[14px] font-bold"
                    style={{ background: '#FFFFFF', color: '#233A44', border: '2px solid #CDE7F2' }}
                  >
                    {i + 1}. {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(answer); }}
                  placeholder="답을 적어요"
                  disabled={!!quizMsg?.ok}
                  className="flex-1 rounded-xl px-3 py-3 text-[15px] outline-none"
                  style={{ background: '#FFFFFF', color: '#233A44', border: '2px solid #CDE7F2' }}
                />
                <button
                  onClick={() => submitAnswer(answer)}
                  disabled={!!quizMsg?.ok}
                  className="rounded-xl px-4 text-[14px] font-black text-white"
                  style={{ background: '#4E9FC2' }}
                >
                  내기
                </button>
              </div>
            )}

            {quizMsg && (
              <div
                className="mt-3 rounded-xl px-3 py-2.5 text-[13px] font-bold leading-relaxed"
                style={{
                  background: quizMsg.ok ? '#E4F7EA' : '#FFF1E8',
                  color: quizMsg.ok ? '#1E7B45' : '#A6522A',
                }}
              >
                {quizMsg.ok ? '🛡️ 껍질이 깨졌어요! ' : '💧 '}{quizMsg.text}
              </div>
            )}

            {!quizMsg?.ok && (
              <button
                onClick={closeQuiz}
                className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold"
                style={{ background: 'rgba(0,0,0,0.05)', color: '#5B7A88' }}
              >
                나중에 할래요
              </button>
            )}
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
          coast={data.cl}
          me={mePos}
          targets={targets}
          civicIds={civicIds}
          onWarp={warpTo}
          onClose={() => setWarpOpen(false)}
          spots={spots}
          currentSpot={currentSpot}
          onGoSpot={(id) => { setWarpOpen(false); onGoSpot?.(id); }}
        />
      )}

      {/*
        자리를 넘어갈까 — **한 번 물어본다.**
        걸어다니다 화살표를 스쳐 눌러 딴 동네로 끌려가면, 아이는 돌아오는 길을 모른다.
      */}
      {gateAsk && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4"
          style={{ background: 'rgba(24,20,16,0.55)' }}
          {...backdropClose(() => setGateAsk(null))}
        >
          <div
            className="w-full max-w-[380px] rounded-3xl overflow-hidden"
            style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-2 text-center">
              <div className="text-[44px]">{gateAsk.emoji}</div>
              <div className="text-[19px] font-black mt-1" style={{ color: '#3A3226' }}>
                {gateAsk.name}
              </div>
              <div className="text-[13px] leading-relaxed mt-1.5 px-2" style={{ color: '#6B5B43' }}>
                {gateAsk.tagline}
              </div>
            </div>
            <div className="flex gap-2 px-4 pb-4 pt-2">
              <button
                onClick={() => setGateAsk(null)}
                className="rounded-full px-5 py-3 text-[15px] font-bold"
                style={{ background: 'white', color: '#8A7A5F' }}
              >
                아니요
              </button>
              <button
                onClick={() => { const id = gateAsk.id; setGateAsk(null); onGoSpot?.(id); }}
                className="flex-1 rounded-full py-3 text-[15px] font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                네, 가볼래요 ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
