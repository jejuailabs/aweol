'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls,
  type AvatarCustom, type AvatarTint,
} from './walker';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';
import {
  heightAt, summit, PATH, PLAZA, STAGE_HALF, SILVERGRASS_MIN_H,
} from '@/lib/terrain';
import { lightRGB, shadeRGB, shadowFactor, hexToRGB, type Occluder } from '@/lib/baked';
import { BAKED_MAT, bakeGeometry, bakeTerrainGeometry } from './baked-three';

/**
 * 오름 무대 — 지형 위를 걷는 첫 무대. (docs/10-jeju-warp-map.md 3층)
 *
 * 진짜 오르막이다: 땅은 `lib/terrain.ts` 의 heightAt 이 정하고(검증됨),
 * 아바타·친구·카메라가 같은 함수를 따라 올라간다.
 * 렌더링은 전부 baked — 조명·그림자맵 0, 억새·잔디는 인스턴싱.
 */

/** 씨앗 있는 난수 — 매번 같은 오름이어야 친구와 같은 풍경을 본다 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 길 위인가 — 잔디·억새를 안 심는 자리 */
function onPath(x: number, z: number, pad: number): boolean {
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x0, z0] = PATH[i];
    const [x1, z1] = PATH[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2));
    const px = x0 + dx * t, pz = z0 + dz * t;
    if ((x - px) ** 2 + (z - pz) ** 2 < (1.6 + pad) ** 2) return true;
  }
  return false;
}

/** 흙길 — 지형을 따라 이어 붙인 띠 */
function makePathGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    PATH.map(([x, z]) => new THREE.Vector3(x, 0, z))
  );
  const N = Math.max(60, Math.round(curve.getLength() / 1.1));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = hexToRGB(0xC9A878);
  const width = 3.0;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N);
    const tan = curve.getTangentAt(i / N);
    const nl = Math.hypot(tan.x, tan.z) || 1;
    const nx = -tan.z / nl, nz = tan.x / nl;
    for (const s of [-1, 1]) {
      const x = p.x + nx * (width / 2) * s;
      const z = p.z + nz * (width / 2) * s;
      pos.push(x, heightAt(x, z) + 0.08, z);
      const li = lightRGB(0, 1, 0);
      const c = shadeRGB([base[0] * li[0], base[1] * li[1], base[2] * li[2]], 1);
      col.push(c[0], c[1], c[2]);
    }
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 정적인 무대 전부 — 땅·길·억새·잔디·바위. 한 번 만들고 그대로 둔다. */
function OreumStage() {
  const built = useMemo(() => {
    const rand = mulberry32(20260807);

    // 바위 — 지형에 그림자도 드리운다
    const rocks: { x: number; z: number; s: number; rot: [number, number, number] }[] = [];
    const occluders: Occluder[] = [];
    let guard = 0;
    while (rocks.length < 26 && guard++ < 400) {
      const x = (rand() - 0.5) * STAGE_HALF * 1.8;
      const z = (rand() - 0.5) * STAGE_HALF * 1.8;
      if (onPath(x, z, 1.5)) continue;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r * 0.8) continue;
      const s = 0.5 + rand() * 1.2;
      rocks.push({ x, z, s, rot: [rand() * 3, rand() * 3, rand() * 3] });
      occluders.push({ x, z, r: s * 1.2, k: 0.25 });
    }

    // 땅 — 높이·경사에 따라 풀색→마른 풀→흙. 바위 그림자를 굽는다.
    const grass = hexToRGB(0x84A03E);
    const dry = hexToRGB(0xC9A94F);
    const dirt = hexToRGB(0x9A7E58);
    const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
      [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const ground = bakeTerrainGeometry({
      size: STAGE_HALF * 2 + 20,
      segments: 170,
      heightAt,
      colorAt: (x, z, h, slope) => {
        let c = mix(grass, dry, Math.min(1, h / 13) * 0.85);
        c = mix(c, dirt, Math.min(1, slope * 0.9) * 0.5);
        const w = (Math.sin(x * 0.43) + Math.cos(z * 0.39)) * 0.02;
        return [c[0] + w, c[1] + w, c[2] + w];
      },
      occluders,
    });

    const path = makePathGeometry();

    // 억새 — 정상 일대(높이 SILVERGRASS_MIN_H 위)에만. 줄기+이삭 인스턴싱.
    const stalkGeo = bakeGeometry(
      new THREE.CylinderGeometry(0.015, 0.03, 1.5, 4).translate(0, 0.75, 0), 0xB6A268);
    const headBase = new THREE.IcosahedronGeometry(0.15, 0);
    headBase.scale(0.48, 2.3, 0.48);
    headBase.translate(0, 1.75, 0);
    const headGeo = bakeGeometry(headBase, 0xFFFFFF);
    headBase.dispose();

    const SG_COUNT = 2800;
    const sgMatrices: THREE.Matrix4[] = [];
    const sgColors: THREE.Color[] = [];
    guard = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    while (sgMatrices.length < SG_COUNT && guard++ < SG_COUNT * 10) {
      const x = (rand() - 0.5) * STAGE_HALF * 2;
      const z = (rand() - 0.5) * STAGE_HALF * 2;
      const h = heightAt(x, z);
      if (h < SILVERGRASS_MIN_H) continue;
      if (onPath(x, z, 0.6)) continue;
      eu.set((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.35);
      q.setFromEuler(eu);
      const s = 0.85 + rand() * 0.8;
      sgMatrices.push(m.clone().compose(v.set(x, h - 0.05, z), q, sc.set(s, s, s)));
      const c = new THREE.Color(0xEFE0C2);
      c.offsetHSL((rand() - 0.5) * 0.06, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.14);
      sgColors.push(c);
    }

    // 잔디 — 뾰족 원뿔. 밑동 어둡고 끝 밝은 건 지오메트리 정점 색에 굽는다.
    const spikeBase = new THREE.ConeGeometry(0.1, 0.72, 4, 1).translate(0, 0.36, 0);
    const spike = spikeBase.toNonIndexed();
    spikeBase.dispose();
    {
      const p = spike.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = Math.min(1, p.getY(i) / 0.72);
        const vv = 0.52 + t * 0.75;
        col[i * 3] = vv; col[i * 3 + 1] = vv; col[i * 3 + 2] = vv * 0.82;
      }
      spike.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const G_COUNT = 9000;
    const gMatrices: THREE.Matrix4[] = [];
    const gColors: THREE.Color[] = [];
    guard = 0;
    while (gMatrices.length < G_COUNT && guard++ < G_COUNT * 4) {
      const cx = (rand() - 0.5) * STAGE_HALF * 2;
      const cz = (rand() - 0.5) * STAGE_HALF * 2;
      if (onPath(cx, cz, 0.4)) continue;
      if (heightAt(cx, cz) >= SILVERGRASS_MIN_H) continue;   // 정상은 억새 몫
      const clump = 4 + ((rand() * 4) | 0);
      const ch = heightAt(cx, cz);
      const base = new THREE.Color(0x8CA83C).lerp(new THREE.Color(0xCCA84E), Math.min(1, ch / 12) * 0.8);
      for (let j = 0; j < clump && gMatrices.length < G_COUNT; j++) {
        const x = cx + (rand() - 0.5) * 1.3;
        const z = cz + (rand() - 0.5) * 1.3;
        if (onPath(x, z, 0.1)) continue;
        eu.set((rand() - 0.5) * 0.45, rand() * 6.28, (rand() - 0.5) * 0.45);
        q.setFromEuler(eu);
        const s = 0.65 + rand() * 0.9;
        gMatrices.push(m.clone().compose(
          v.set(x, heightAt(x, z) - 0.04, z), q, sc.set(s, s * (0.7 + rand() * 0.7), s)));
        const li = lightRGB(0, 1, 0);
        const c = base.clone().offsetHSL((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.09);
        const sr = shadeRGB([c.r * li[0], c.g * li[1], c.b * li[2]], shadowFactor(occluders, x, z));
        gColors.push(new THREE.Color(sr[0], sr[1], sr[2]));
      }
    }

    const rockGeo = bakeGeometry(new THREE.IcosahedronGeometry(1, 0), 0x9C948D);

    return {
      ground, path, stalkGeo, headGeo, spike, rockGeo,
      sgMatrices, sgColors, gMatrices, gColors, rocks,
    };
  }, []);

  useEffect(() => () => {
    built.ground.dispose(); built.path.dispose();
    built.stalkGeo.dispose(); built.headGeo.dispose();
    built.spike.dispose(); built.rockGeo.dispose();
  }, [built]);

  /** InstancedMesh 에 행렬·색을 채운다 */
  const fill = (mesh: THREE.InstancedMesh | null, mats: THREE.Matrix4[], cols?: THREE.Color[]) => {
    if (!mesh) return;
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    if (cols) cols.forEach((cc, i) => mesh.setColorAt(i, cc));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return (
    <group>
      <mesh geometry={built.ground} material={BAKED_MAT} />
      <mesh geometry={built.path} material={BAKED_MAT} />

      {/* 억새 줄기·이삭 */}
      <instancedMesh
        ref={(el) => fill(el, built.sgMatrices)}
        args={[built.stalkGeo, BAKED_MAT, built.sgMatrices.length]}
      />
      <instancedMesh
        ref={(el) => fill(el, built.sgMatrices, built.sgColors)}
        args={[built.headGeo, BAKED_MAT, built.sgMatrices.length]}
      />

      {/* 잔디 */}
      <instancedMesh
        ref={(el) => fill(el, built.gMatrices, built.gColors)}
        args={[built.spike, BAKED_MAT, built.gMatrices.length]}
      />

      {/* 바위 */}
      {built.rocks.map((r, i) => (
        <mesh
          key={i}
          geometry={built.rockGeo}
          material={BAKED_MAT}
          position={[r.x, heightAt(r.x, r.z) + r.s * 0.25, r.z]}
          rotation={r.rot}
          scale={[r.s, r.s * 0.7, r.s]}
        />
      ))}
    </group>
  );
}

export default function OreumScene({
  schoolId, me, avatarId, avatarCustom, avatarTint,
}: {
  schoolId: string;
  me: { uid: string; look: PeerLook } | null;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(PLAZA.x, 0, PLAZA.z));
  const avatarYaw = useRef(0);
  const top = useMemo(() => summit(), []);

  useEffect(() => {
    resetControls(0, 10, 0.42);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 5, maxDist: 26 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* baked 무대 — 씬에 조명이 하나도 없다. 아바타는 matcap 이라 필요 없다. */}
      <Canvas
        camera={{ position: [PLAZA.x, 9, PLAZA.z + 16], fov: 58, near: 0.5, far: 400 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: '#BFE0F0' }}
      >
        <OreumStage />

        {/* 정상 표지 */}
        <Html
          position={[top.x, top.h + 2.2, top.z]}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[5, 0]}
        >
          <div
            style={{
              background: '#FFF8E7', color: '#5B4A3B', fontWeight: 900, fontSize: '15px',
              padding: '5px 14px', borderRadius: '12px', whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif', border: '3px solid #B08860',
              boxShadow: '0 4px 0 #9C7448', userSelect: 'none',
            }}
          >
            ⛰️ 정상 {Math.round(top.h)}m
          </div>
        </Html>

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -STAGE_HALF, xMax: STAGE_HALF, zMin: -STAGE_HALF, zMax: STAGE_HALF }}
          start={[PLAZA.x, 0, PLAZA.z]}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          heightAt={heightAt}
        />

        {me && (
          <Peers
            schoolId={schoolId}
            roomKey="oreum"
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
            heightAt={heightAt}
          />
        )}

        <DustPuffs />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.3} heightAt={heightAt} />
      </Canvas>
    </div>
  );
}
