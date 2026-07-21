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

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -R, xMax: R, zMin: -R, zMax: R }}
          start={[0, 0, 30]}
          maxSpeed={7}
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
    </div>
  );
}
