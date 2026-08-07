'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  islandHeight, coastDistance, project, PLACES, HALLASAN, type JejuPlace,
} from '@/lib/jeju-map';
import { BAKED_MAT, bakeTerrainGeometry, getMatcap } from './baked-three';

/**
 * 제주 전도 — 워프 허브. (docs/10-jeju-warp-map.md 3층의 ①)
 *
 * 실좌표를 투영한 섬 위에 장소가 앉아 있다. 열린 곳(애월·한담·곽지)을 누르면
 * 그 무대로 가고, 나머지는 '예정중'.
 * 렌더링은 baked — 섬 명암은 정점 색에 굽고, 씬에 조명은 없다(마커 구슬만 matcap).
 */

/** 지도는 넓다 — 마커가 손가락만 해야 폰에서 눌린다 */
const MARKER_SCALE = 1.6;

function Island() {
  const geo = useMemo(() => {
    const sand = [0.91, 0.84, 0.62] as const;
    const grass = [0.5, 0.63, 0.3] as const;
    const forest = [0.3, 0.45, 0.26] as const;
    const rock = [0.48, 0.42, 0.36] as const;
    const shallow = [0.55, 0.8, 0.88] as const;
    const deep = [0.28, 0.55, 0.75] as const;
    const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
      [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    return bakeTerrainGeometry({
      size: 96,
      segments: 190,
      heightAt: islandHeight,
      colorAt: (x, z, h) => {
        const d = coastDistance(x, z);
        if (d <= 0) {
          // 바다 — 해안 가까이는 옥빛, 멀어질수록 짙다
          return mix(shallow, deep, Math.min(1, -d / 6));
        }
        if (d < 0.9) return mix(sand, grass, d / 0.9);       // 모래 해안 띠
        let c = mix(grass, forest, Math.min(1, h / 2.2));    // 낮은 들 → 숲
        if (h > 3.6) c = mix(c, rock, Math.min(1, (h - 3.6) / 2.2));  // 한라산 위쪽
        return c;
      },
    });
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={BAKED_MAT} />;
}

/** 구름 — 지도 위를 천천히 흐른다. 살아 있는 느낌은 이거 하나로 충분하다. */
function Clouds() {
  const group = useRef<THREE.Group>(null);
  const puffs = useMemo(() => {
    const out: { x: number; z: number; y: number; s: number; speed: number }[] = [];
    for (let i = 0; i < 7; i++) {
      out.push({
        x: -50 + i * 16 + (i % 3) * 5,
        z: -16 + ((i * 37) % 30),
        y: 10 + (i % 3) * 1.6,
        s: 1.6 + (i % 4) * 0.7,
        speed: 0.55 + (i % 3) * 0.22,
      });
    }
    return out;
  }, []);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      c.position.x += puffs[i].speed * delta;
      if (c.position.x > 55) c.position.x = -55;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} scale={p.s}>
          {([[-1, 0, 0.9], [0, 0.35, 1.2], [1.1, 0, 0.85]] as const).map(([ox, oy, r], j) => (
            <mesh key={j} position={[ox, oy, 0]}>
              <sphereGeometry args={[r, 10, 8]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={0.88} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** 장소 마커 — 열린 곳은 색 구슬 + 이름표, 예정은 잿빛 */
function Marker({ place, onPick }: { place: JejuPlace; onPick: (p: JejuPlace) => void }) {
  const { x, z } = project(place.lng, place.lat);
  const y = Math.max(0.1, islandHeight(x, z)) + 0.4;
  const open = place.status === 'open';
  const bob = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!bob.current) return;
    // 열린 곳만 살짝 떠서 숨쉰다 — 눌러도 되는 것이 먼저 눈에 띈다
    bob.current.position.y = open ? Math.sin(state.clock.elapsedTime * 2 + x) * 0.25 : 0;
  });

  return (
    <group position={[x, y, z]}>
      <group ref={bob}>
        {/* 핀 구슬 */}
        <mesh
          onClick={(e) => { e.stopPropagation(); onPick(place); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          scale={MARKER_SCALE}
        >
          <sphereGeometry args={[0.55, 16, 14]} />
          <meshMatcapMaterial matcap={getMatcap()} color={open ? '#E8604C' : '#9A948C'} />
        </mesh>
        <mesh position={[0, -0.75 * MARKER_SCALE, 0]} scale={MARKER_SCALE}>
          <coneGeometry args={[0.22, 0.8, 8]} />
          <meshMatcapMaterial matcap={getMatcap()} color={open ? '#C0432F' : '#7A756E'} />
        </mesh>

        {/*
          이름표가 곧 버튼이다 — 간판 사건에서 배운 것.
          center 모드는 style 로 직접 pointerEvents 를 준다.
        */}
        <Html position={[0, 1.6 * MARKER_SCALE, 0]} center style={{ pointerEvents: 'auto' }} zIndexRange={[5, 0]}>
          <div
            onClick={() => onPick(place)}
            style={{
              background: open ? '#FFF8E7' : 'rgba(240,237,230,0.88)',
              color: open ? '#5B4A3B' : '#8B857B',
              fontWeight: 800,
              fontSize: open ? '14px' : '12px',
              padding: open ? '4px 12px' : '3px 9px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif',
              border: open ? '2.5px solid #E8A33C' : '2px solid #C9C4BA',
              boxShadow: open ? '0 3px 0 #D8B36A' : 'none',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {place.emoji} {place.name}
            {open
              ? <span style={{ color: '#A6762A', marginLeft: '5px', fontSize: '12px' }}>가기 ›</span>
              : <span style={{ marginLeft: '5px', fontSize: '11px' }}>예정</span>}
          </div>
        </Html>
      </group>
    </group>
  );
}

export default function JejuMapScene({ onPick }: { onPick: (p: JejuPlace) => void }) {
  const halla = project(HALLASAN.lng, HALLASAN.lat);
  return (
    <div className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* baked 지도 — 조명 0개. 섬 명암은 정점에, 마커는 matcap. */}
      <Canvas
        camera={{ position: [0, 62, 46], fov: 50, near: 1, far: 300 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#8FC4E4' }}
        onCreated={({ camera }) => camera.lookAt(0, 0, -4)}
      >
        <Island />
        <Clouds />

        {/* 한라산 이름 — 누르는 곳이 아니라 land mark 라 작게 */}
        <Html position={[halla.x, 7.6, halla.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[3, 0]}>
          <div
            style={{
              color: '#4A5A42', fontWeight: 900, fontSize: '13px',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
              textShadow: '0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            🗻 한라산
          </div>
        </Html>

        {PLACES.map((p) => (
          <Marker key={p.id} place={p} onPick={onPick} />
        ))}
      </Canvas>
    </div>
  );
}
