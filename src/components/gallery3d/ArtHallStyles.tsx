'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HallThemeSpec } from '@/lib/art-hall';

/**
 * 전시관 바깥 — **양식마다 다른 건물·마당·조형물.**
 *
 * 처음에는 벽 색만 갈아 끼웠다. 그래서 셋 다 **같은 건물에 페인트만 다시
 * 칠한 것** 이었다. 세계의 미술관이 저마다 다른 이유는 색이 아니라 형태다 —
 * 열주가 선 신전과 티타늄이 물결치는 덩어리는 색이 달라서 다른 게 아니다.
 *
 * 여기는 **바깥만** 맡는다. 전시실 안(`ArtShowScene`)은 흰 벽이 정답인 경우가
 * 많아서 색 정도만 바뀐다 — 그림을 보러 들어간 방이 화려하면 그림이 죽는다.
 */

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

export const PLAZA_W = 62;
export const PLAZA_D = 54;
export const FACADE_Z = -22;
export const FACADE_W = 42;
export const FACADE_H = 14;

/** 씨앗 하나에서 0~1 — 박석처럼 '불규칙하지만 늘 같은' 것에 쓴다 */
function seeded(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ 0x12345, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ══════════════════ 마당 ══════════════════ */

/**
 * 마당 — **무늬가 건물을 말해준다.**
 *
 * 곧은 격자는 다듬은 돌 광장이고, 붉은 벽돌 경사는 유럽 도심 광장이고,
 * 불규칙한 박석은 궁궐 마당이다. 같은 회색 판에 건물만 바꾸면
 * 건물이 붕 떠 보인다.
 */
export function Plaza({ spec }: { spec: HallThemeSpec }) {
  const lines = useMemo(() => {
    const out: { key: string; pos: [number, number, number]; rot: number; w: number; d: number }[] = [];

    if (spec.paving === 'grid' || spec.paving === 'brick') {
      /** 격자 — 벽돌은 칸을 넓게 잡아 큼직하게 깔린다 */
      const nx = spec.paving === 'brick' ? 7 : 11;
      const nz = spec.paving === 'brick' ? 6 : 9;
      for (let i = 0; i <= nx; i++) {
        out.push({
          key: `x${i}`,
          pos: [-PLAZA_W / 2 + (i * PLAZA_W) / nx, 0.03, 0],
          rot: 0, w: 0.12, d: PLAZA_D,
        });
      }
      for (let i = 0; i <= nz; i++) {
        /** 벽돌은 줄마다 반 칸씩 어긋난다 — 그래야 벽돌로 보인다 */
        const off = spec.paving === 'brick' && i % 2 ? PLAZA_W / (nx * 2) : 0;
        out.push({
          key: `z${i}`,
          pos: [off, 0.03, -PLAZA_D / 2 + (i * PLAZA_D) / nz],
          rot: 0, w: PLAZA_W, d: 0.12,
        });
      }
    }
    return out;
  }, [spec.paving]);

  /** 박석 — 크기가 제각각인 넓적 돌. 궁궐 마당이 그렇다. */
  const stones = useMemo(() => {
    if (spec.paving !== 'stone') return [];
    const out: { key: string; x: number; z: number; w: number; d: number; r: number; c: number }[] = [];
    let i = 0;
    for (let gz = -PLAZA_D / 2 + 2; gz < PLAZA_D / 2 - 1; gz += 3.1) {
      for (let gx = -PLAZA_W / 2 + 2; gx < PLAZA_W / 2 - 1; gx += 3.4) {
        const s = i * 7919;
        out.push({
          key: `s${i}`,
          x: gx + (seeded(s) - 0.5) * 1.1,
          z: gz + (seeded(s + 1) - 0.5) * 1.1,
          w: 2.3 + seeded(s + 2) * 1.3,
          d: 2.1 + seeded(s + 3) * 1.1,
          r: (seeded(s + 4) - 0.5) * 0.24,
          c: seeded(s + 5),
        });
        i++;
      }
    }
    return out;
  }, [spec.paving]);

  /** 물결 — 동심원. 물가에 선 건물 앞이라 파문처럼 퍼진다. */
  const rings = useMemo(() => {
    if (spec.paving !== 'wave') return [];
    return Array.from({ length: 12 }, (_, i) => 4 + i * 3.2);
  }, [spec.paving]);

  /** 방사형 — 가운데에서 뻗어 나간다. 피라미드가 선 광장이 그렇다. */
  const spokes = useMemo(() => {
    if (spec.paving !== 'radial') return [];
    return Array.from({ length: 24 }, (_, i) => (i / 24) * PI * 2);
  }, [spec.paving]);

  return (
    <group>
      {/* 바깥 땅 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[PLAZA_W + 60, PLAZA_D + 60]} />
        <meshStandardMaterial color={spec.plazaBase} roughness={0.94} />
      </mesh>
      {/* 마당 */}
      <mesh position={[0, 0.02, 0]} rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[PLAZA_W, PLAZA_D]} />
        <meshStandardMaterial color={spec.plazaTile} roughness={0.9} />
      </mesh>

      {lines.map((l) => (
        <mesh key={l.key} position={l.pos} rotation={[NEG_HALF_PI, 0, l.rot]}>
          <planeGeometry args={[l.w, l.d]} />
          <meshStandardMaterial color={spec.plazaLine} roughness={0.95} />
        </mesh>
      ))}

      {stones.map((s) => (
        <mesh key={s.key} position={[s.x, 0.035, s.z]} rotation={[NEG_HALF_PI, 0, s.r]} receiveShadow>
          <planeGeometry args={[s.w, s.d]} />
          <meshStandardMaterial
            // 돌마다 조금씩 다른 빛깔 — 다 같으면 장판이다
            color={s.c > 0.6 ? spec.plazaBase : s.c > 0.3 ? spec.plazaTile : spec.plazaLine}
            roughness={0.96}
          />
        </mesh>
      ))}

      {rings.map((r) => (
        <mesh key={r} position={[0, 0.035, 2]} rotation={[NEG_HALF_PI, 0, 0]}>
          <ringGeometry args={[r, r + 0.34, 64]} />
          <meshStandardMaterial color={spec.plazaLine} roughness={0.9} />
        </mesh>
      ))}

      {spokes.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a) * 17, 0.035, 2 + Math.sin(a) * 17]}
          rotation={[NEG_HALF_PI, 0, -a]}
        >
          <planeGeometry args={[32, 0.16]} />
          <meshStandardMaterial color={spec.plazaLine} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

/* ══════════════════ 건물 ══════════════════ */

/** 고전 신전 — 열주와 페디먼트. 미술관을 미술관으로 보이게 하는 것. */
function TempleFacade({ spec }: { spec: HallThemeSpec }) {
  return (
    <group>
      <mesh position={[0, FACADE_H / 2, FACADE_Z - 6]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W, FACADE_H, 14]} />
        <meshStandardMaterial color={spec.facade} roughness={0.82} />
      </mesh>
      <mesh position={[0, FACADE_H + 0.5, FACADE_Z - 6]} castShadow>
        <boxGeometry args={[FACADE_W + 2.4, 1, 16]} />
        <meshStandardMaterial color="#8F8A80" roughness={0.8} />
      </mesh>

      {/* 유리 파사드 */}
      <mesh position={[0, 6.2, FACADE_Z + 0.06]}>
        <planeGeometry args={[19, 11]} />
        <meshStandardMaterial color="#9EC4D6" roughness={0.08} metalness={0.5} transparent opacity={0.82} />
      </mesh>
      {[-7.6, -3.8, 0, 3.8, 7.6].map((gx) => (
        <mesh key={gx} position={[gx, 6.2, FACADE_Z + 0.09]}>
          <boxGeometry args={[0.14, 11, 0.06]} />
          <meshStandardMaterial color="#6F6A64" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* 열주 */}
      {[-17.5, -12.5, -7.5, 7.5, 12.5, 17.5].map((cx) => (
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
      <mesh position={[0, 12.2, FACADE_Z + 2.6]} castShadow>
        <boxGeometry args={[FACADE_W - 2, 1.2, 2.4]} />
        <meshStandardMaterial color="#D8D3CA" roughness={0.85} />
      </mesh>
      {/* 페디먼트 — 삼각 박공. 신전의 얼굴이다. */}
      <mesh position={[0, 14.6, FACADE_Z + 2.6]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.01, 4.2, FACADE_W - 4, 3, 1, false]} />
        <meshStandardMaterial color="#DCD8D0" roughness={0.86} />
      </mesh>

      <Steps color="#CFCAC2" />
      <Doorway />
    </group>
  );
}

/** 퐁피두 — 배관을 밖으로 냈다. 속을 뒤집어 보여주는 건물. */
function HiTechFacade({ spec }: { spec: HallThemeSpec }) {
  const PIPES = [
    { x: -15, c: '#4A90D9' },  // 파랑 = 공조
    { x: -9, c: '#3BAF9F' },   // 초록 = 물
    { x: 9, c: '#E8A33C' },    // 노랑 = 전기
    { x: 15, c: '#E8604C' },   // 빨강 = 사람이 다니는 길
  ];
  return (
    <group>
      <mesh position={[0, FACADE_H / 2, FACADE_Z - 6]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W, FACADE_H, 14]} />
        <meshStandardMaterial color={spec.facade} roughness={0.7} metalness={0.25} />
      </mesh>

      {/* 노출 철골 — 가로세로 뼈대가 다 보인다 */}
      {[2.6, 6.4, 10.2, 13.6].map((y) => (
        <mesh key={y} position={[0, y, FACADE_Z + 1.3]} castShadow>
          <boxGeometry args={[FACADE_W + 1, 0.34, 0.34]} />
          <meshStandardMaterial color="#B8BCC2" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {[-20, -13, -6, 6, 13, 20].map((x) => (
        <mesh key={x} position={[x, FACADE_H / 2, FACADE_Z + 1.3]} castShadow>
          <boxGeometry args={[0.34, FACADE_H + 1.4, 0.34]} />
          <meshStandardMaterial color="#B8BCC2" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* 사선 브레이스 — 하이테크의 표식 */}
      {[-16.5, 16.5].map((x) => (
        <mesh key={x} position={[x, 8, FACADE_Z + 1.3]} rotation={[0, 0, 0.62]} castShadow>
          <boxGeometry args={[0.26, 16, 0.26]} />
          <meshStandardMaterial color="#B8BCC2" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* 색색 배관 — 이 건물의 얼굴이다 */}
      {PIPES.map((p) => (
        <group key={p.x}>
          <mesh position={[p.x, FACADE_H / 2 + 0.6, FACADE_Z + 2.6]} castShadow>
            <cylinderGeometry args={[0.52, 0.52, FACADE_H + 1.2, 14]} />
            <meshStandardMaterial color={p.c} roughness={0.42} metalness={0.3} />
          </mesh>
          {/* 이음쇠 — 파이프가 그냥 막대로 보이지 않게 */}
          {[3.5, 9.5].map((y) => (
            <mesh key={y} position={[p.x, y, FACADE_Z + 2.6]}>
              <cylinderGeometry args={[0.64, 0.64, 0.5, 14]} />
              <meshStandardMaterial color="#8E9298" metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 바깥 에스컬레이터 튜브 — 비스듬히 올라가는 유리관 */}
      <group position={[0, 7.2, FACADE_Z + 4.4]} rotation={[0, 0, -0.5]}>
        <mesh castShadow>
          <cylinderGeometry args={[1.5, 1.5, 20, 14, 1, true]} />
          <meshStandardMaterial
            color="#CFE4F0" transparent opacity={0.5}
            roughness={0.12} metalness={0.4} side={THREE.DoubleSide}
          />
        </mesh>
        {[-8, -4, 0, 4, 8].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[1.52, 0.09, 6, 16]} />
            <meshStandardMaterial color="#E8604C" roughness={0.4} />
          </mesh>
        ))}
      </group>

      <Steps color="#9A6A52" />
      <Doorway />
    </group>
  );
}

/** 기와 마당 — 지붕이 크고 처마가 깊다. 우리 건물의 얼굴은 지붕이다. */
function HanokFacade({ spec }: { spec: HallThemeSpec }) {
  return (
    <group>
      {/* 기단 — 한옥은 늘 돌 위에 올라앉는다 */}
      <mesh position={[0, 0.55, FACADE_Z - 5]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W + 5, 1.1, 17]} />
        <meshStandardMaterial color="#B3AA9B" roughness={0.94} />
      </mesh>

      <mesh position={[0, 5.4, FACADE_Z - 5]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W, 8.6, 13]} />
        <meshStandardMaterial color={spec.facade} roughness={0.9} />
      </mesh>

      {/* 나무 기둥 — 붉은 칠 */}
      {[-18, -12, -6, 0, 6, 12, 18].map((x) => (
        <mesh key={x} position={[x, 5.4, FACADE_Z + 1.6]} castShadow>
          <cylinderGeometry args={[0.44, 0.48, 8.6, 12]} />
          <meshStandardMaterial color="#8E4A38" roughness={0.85} />
        </mesh>
      ))}
      {/* 창방 — 기둥을 잇는 가로재 */}
      <mesh position={[0, 9.4, FACADE_Z + 1.6]} castShadow>
        <boxGeometry args={[FACADE_W + 2, 0.7, 0.7]} />
        <meshStandardMaterial color="#8E4A38" roughness={0.85} />
      </mesh>
      {/* 단청 띠 — 초록. 우리 건물의 색이다. */}
      <mesh position={[0, 10.1, FACADE_Z + 1.7]}>
        <boxGeometry args={[FACADE_W + 2, 0.6, 0.5]} />
        <meshStandardMaterial color="#2E6B4F" roughness={0.8} />
      </mesh>

      {/*
        지붕 — **두 켜로 겹쳐 처마를 깊게 낸다.**
        한옥은 지붕이 몸체보다 넓고, 그 그늘이 건물을 무겁게 만든다.
      */}
      {[
        { y: 11.2, w: FACADE_W + 12, d: 20, h: 1.5 },
        { y: 12.5, w: FACADE_W + 7, d: 15, h: 1.5 },
        { y: 13.6, w: FACADE_W + 2, d: 10, h: 1.3 },
      ].map((r) => (
        <mesh key={r.y} position={[0, r.y, FACADE_Z - 5]} castShadow>
          <boxGeometry args={[r.w, r.h, r.d]} />
          <meshStandardMaterial color="#4A5158" roughness={0.86} />
        </mesh>
      ))}
      {/* 용마루 */}
      <mesh position={[0, 14.4, FACADE_Z - 5]} castShadow>
        <boxGeometry args={[FACADE_W + 3, 0.7, 1.4]} />
        <meshStandardMaterial color="#3A4046" roughness={0.85} />
      </mesh>
      {/* 추녀 — 네 귀퉁이가 살짝 들린다. 이것 하나로 한옥이 된다. */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh
          key={i}
          position={[sx * (FACADE_W / 2 + 5.6), 11.9, FACADE_Z - 5 + sz * 9.4]}
          rotation={[0, 0, sx * -0.34]}
          castShadow
        >
          <boxGeometry args={[3.4, 0.9, 3]} />
          <meshStandardMaterial color="#4A5158" roughness={0.86} />
        </mesh>
      ))}

      <Steps color="#B3AA9B" />
      <Doorway />
    </group>
  );
}

/** 구겐하임 빌바오 — 티타늄 판이 물결친다. 곧은 선이 거의 없다. */
function TitaniumFacade({ spec }: { spec: HallThemeSpec }) {
  const blobs = useMemo(() => (
    [
      { x: -13, y: 5.5, z: -6, rx: 0.16, ry: 0.5, rz: 0.22, s: [9, 11, 10] },
      { x: 0, y: 7.5, z: -8, rx: -0.1, ry: 0.2, rz: 0.12, s: [13, 15, 12] },
      { x: 14, y: 6, z: -5, rx: 0.2, ry: -0.4, rz: -0.18, s: [10, 12, 10] },
      { x: -5, y: 10, z: -2, rx: 0.3, ry: 0.9, rz: 0.4, s: [7, 8, 7] },
      { x: 8, y: 11, z: -3, rx: -0.25, ry: -0.7, rz: -0.3, s: [6, 9, 6] },
    ] as const
  ), []);

  return (
    <group>
      {blobs.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y, FACADE_Z + b.z]}
          rotation={[b.rx, b.ry, b.rz]}
          scale={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]}
          castShadow
          receiveShadow
        >
          {/*
            **면을 적게 쪼갠 공**을 눕혀서 쓴다. 각진 면이 남아 있어야
            티타늄 판이 겹쳐 붙은 것처럼 빛이 조각조각 튄다 —
            매끈한 공이면 그냥 풍선이다.
          */}
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={i % 2 ? '#D6DCE2' : spec.facade}
            metalness={0.86}
            roughness={0.28}
            flatShading
          />
        </mesh>
      ))}

      {/* 유리 로비 — 덩어리 사이를 채운다 */}
      <mesh position={[0, 4.5, FACADE_Z + 3]}>
        <planeGeometry args={[16, 9]} />
        <meshStandardMaterial color="#AFD0E0" roughness={0.06} metalness={0.6} transparent opacity={0.72} />
      </mesh>

      <Steps color="#9FB2BE" />
      <Doorway />
    </group>
  );
}

/** 루브르 — 낮고 긴 옛 건물 앞에 유리 피라미드가 하나 선다. */
function PyramidFacade({ spec }: { spec: HallThemeSpec }) {
  return (
    <group>
      {/* 옛 건물 — 낮고 길다. 피라미드를 돋보이게 하는 배경이다. */}
      <mesh position={[0, 5, FACADE_Z - 7]} castShadow receiveShadow>
        <boxGeometry args={[FACADE_W + 14, 10, 12]} />
        <meshStandardMaterial color={spec.facade} roughness={0.88} />
      </mesh>
      {/* 창을 줄지어 낸다 — 궁전은 창이 많다 */}
      {[-22, -16, -10, 10, 16, 22].map((x) => (
        <group key={x}>
          <mesh position={[x, 3.4, FACADE_Z - 1.05]}>
            <planeGeometry args={[2.4, 4]} />
            <meshStandardMaterial color="#5E6B74" roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[x, 7.6, FACADE_Z - 1.05]}>
            <planeGeometry args={[2.2, 3.2]} />
            <meshStandardMaterial color="#5E6B74" roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      ))}
      {/* 지붕 — 회색 망사르 */}
      <mesh position={[0, 11.2, FACADE_Z - 7]} castShadow>
        <boxGeometry args={[FACADE_W + 15, 2.4, 13]} />
        <meshStandardMaterial color="#6B6F74" roughness={0.84} />
      </mesh>

      {/*
        유리 피라미드 — **광장 한가운데.**
        건물에 붙이지 않는다. 떨어져 홀로 서야 그 모양이 산다.
      */}
      <mesh position={[0, 5.2, FACADE_Z + 12]} castShadow>
        <coneGeometry args={[9.5, 10.4, 4]} />
        <meshStandardMaterial
          color="#CFE2EE" transparent opacity={0.42}
          roughness={0.05} metalness={0.35} side={THREE.DoubleSide}
        />
      </mesh>
      {/* 격자 살 — 유리 피라미드는 살이 보여야 피라미드다 */}
      {[0.22, 0.45, 0.68, 0.86].map((t) => (
        <mesh key={t} position={[0, 0.2 + 10.4 * t, FACADE_Z + 12]} rotation={[0, PI / 4, 0]}>
          <torusGeometry args={[9.5 * (1 - t) * 1.32, 0.09, 4, 4]} />
          <meshStandardMaterial color="#8E939A" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* 작은 피라미드 둘 — 큰 것 옆에 나란히 */}
      {[-15, 15].map((x) => (
        <mesh key={x} position={[x, 1.6, FACADE_Z + 15]} castShadow>
          <coneGeometry args={[3, 3.2, 4]} />
          <meshStandardMaterial
            color="#CFE2EE" transparent opacity={0.42}
            roughness={0.05} metalness={0.35} side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      <Steps color="#C6BCA8" />
    </group>
  );
}

/** 계단 — 미술관은 늘 조금 올라가서 들어간다 */
function Steps({ color }: { color: string }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[0, 0.17 + i * 0.34, FACADE_Z + 7.4 - i * 1.15]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[FACADE_W - 4 + i * 1.4, 0.34, 1.2]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

/** 현관 안쪽 어둠 — 문이 뚫려 있다는 느낌 */
function Doorway() {
  return (
    <mesh position={[0, 3.2, FACADE_Z + 0.04]}>
      <planeGeometry args={[8, 6.4]} />
      <meshStandardMaterial color="#2A2A2E" roughness={0.9} />
    </mesh>
  );
}

export function StyledFacade({ spec }: { spec: HallThemeSpec }) {
  switch (spec.arch) {
    case 'hitech': return <HiTechFacade spec={spec} />;
    case 'hanok': return <HanokFacade spec={spec} />;
    case 'titanium': return <TitaniumFacade spec={spec} />;
    case 'pyramid': return <PyramidFacade spec={spec} />;
    default: return <TempleFacade spec={spec} />;
  }
}

/* ══════════════════ 마당에 놓는 것 ══════════════════ */

/** 분수 — 고전·궁전 마당에 선다 */
function Fountain({ accent }: { accent: string }) {
  const jets = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = jets.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((c, i) => {
      c.scale.y = 0.7 + Math.abs(Math.sin(t * 1.6 + i * 0.8)) * 0.7;
    });
  });
  return (
    <group position={[0, 0, 2]}>
      <mesh position={[0, 0.3, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[5.4, 5.8, 0.6, 28]} />
        <meshStandardMaterial color="#BFB9AF" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[4.9, 4.9, 0.12, 28]} />
        <meshStandardMaterial color="#7FC3DE" roughness={0.12} metalness={0.2} transparent opacity={0.86} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.9, 1.6, 12]} />
        <meshStandardMaterial color="#CFCAC2" roughness={0.85} />
      </mesh>
      <group ref={jets}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.5, 1.9, Math.sin(a) * 1.5]}>
              <cylinderGeometry args={[0.09, 0.14, 2.2, 6]} />
              <meshStandardMaterial color={accent} transparent opacity={0.5} roughness={0.1} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** 반사 수반 — 물가 건물 앞. 물이 건물을 되비춘다. */
function ReflectPool({ accent }: { accent: string }) {
  return (
    <group position={[0, 0, -2]}>
      <mesh position={[0, 0.06, 0]} rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[38, 13]} />
        <meshStandardMaterial color="#5E8FA8" roughness={0.06} metalness={0.72} />
      </mesh>
      {/* 테두리 돌 */}
      {[[0, 6.8], [0, -6.8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.16, z]} castShadow>
          <boxGeometry args={[38, 0.32, 0.7]} />
          <meshStandardMaterial color="#9FAAB2" roughness={0.9} />
        </mesh>
      ))}
      {/* 물 위로 솟은 기둥 몇 — 되비치는 것이 있어야 물로 보인다 */}
      {[-11, 0, 11].map((x) => (
        <mesh key={x} position={[x, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 3, 10]} />
          <meshStandardMaterial color={accent} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** 조형물 — 양식마다 모양이 다르다 */
function StyledSculpture({
  x, spec, alt,
}: { x: number; spec: HallThemeSpec; alt: boolean }) {
  const base = (
    <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
      <boxGeometry args={[3, 0.84, 3]} />
      <meshStandardMaterial color="#A9A399" roughness={0.92} />
    </mesh>
  );

  return (
    <group position={[x, 0, 8]}>
      {spec.arch !== 'hanok' && base}

      {spec.arch === 'temple' && (
        alt ? (
          <mesh position={[0, 2.5, 0]} rotation={[0.3, 0.6, 0]} castShadow>
            <torusKnotGeometry args={[1.1, 0.36, 80, 12]} />
            <meshStandardMaterial color="#E6E2DA" roughness={0.35} metalness={0.3} />
          </mesh>
        ) : (
          <mesh position={[0, 2.4, 0]} castShadow>
            <coneGeometry args={[1.2, 3, 5]} />
            <meshStandardMaterial color="#DCD8D0" roughness={0.5} metalness={0.2} />
          </mesh>
        )
      )}

      {spec.arch === 'hitech' && (
        /* 파이프 조형 — 건물과 같은 말을 한다 */
        <group position={[0, 0.84, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[(i - 1) * 0.9, 1.6 + i * 0.4, 0]}
              rotation={[0, 0, (i - 1) * 0.5]}
              castShadow
            >
              <cylinderGeometry args={[0.34, 0.34, 3.2, 12]} />
              <meshStandardMaterial
                color={['#4A90D9', '#E8A33C', '#3BAF9F'][i]}
                roughness={0.42}
                metalness={0.3}
              />
            </mesh>
          ))}
        </group>
      )}

      {spec.arch === 'titanium' && (
        <mesh position={[0, 2.6, 0]} rotation={[0.2, 0.8, 0.3]} castShadow>
          <torusGeometry args={[1.5, 0.5, 10, 26]} />
          <meshStandardMaterial color="#CDD4DA" metalness={0.9} roughness={0.22} flatShading />
        </mesh>
      )}

      {spec.arch === 'pyramid' && (
        <mesh position={[0, 2.2, 0]} rotation={[0, PI / 4, 0]} castShadow>
          <coneGeometry args={[1.4, 2.6, 4]} />
          <meshStandardMaterial color={spec.accent} metalness={0.6} roughness={0.35} />
        </mesh>
      )}

      {spec.arch === 'hanok' && (
        /* 석탑 — 층을 쌓아 올린다. 우리 마당의 조형물이다. */
        <group>
          <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.2, 0.68, 3.2]} />
            <meshStandardMaterial color="#9E958A" roughness={0.95} />
          </mesh>
          {[0, 1, 2, 3].map((i) => {
            const w = 2.4 - i * 0.45;
            const y = 1.1 + i * 1.15;
            return (
              <group key={i}>
                <mesh position={[0, y, 0]} castShadow>
                  <boxGeometry args={[w, 0.75, w]} />
                  <meshStandardMaterial color="#B0A79A" roughness={0.94} />
                </mesh>
                {/* 옥개석 — 처마처럼 넓게 내민 판 */}
                <mesh position={[0, y + 0.5, 0]} castShadow>
                  <boxGeometry args={[w + 1.1, 0.24, w + 1.1]} />
                  <meshStandardMaterial color="#A79E92" roughness={0.94} />
                </mesh>
              </group>
            );
          })}
          <mesh position={[0, 6, 0]} castShadow>
            <coneGeometry args={[0.5, 1, 8]} />
            <meshStandardMaterial color="#9E958A" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** 나무 — 양식마다 종류가 다르다 */
function StyledTree({ x, z, spec }: { x: number; z: number; spec: HallThemeSpec }) {
  if (spec.arch === 'hanok') {
    /* 소나무 — 굽은 줄기와 층진 잎. 궁궐 마당의 나무다. */
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0, 2, 0]} rotation={[0, 0, 0.14]} castShadow>
          <cylinderGeometry args={[0.24, 0.42, 4, 8]} />
          <meshStandardMaterial color="#7A5230" roughness={0.94} />
        </mesh>
        {[
          { y: 3.9, r: 2.2, x: 0.5 },
          { y: 5.0, r: 1.7, x: -0.3 },
          { y: 5.9, r: 1.1, x: 0.2 },
        ].map((L) => (
          <mesh key={L.y} position={[L.x, L.y, 0]} scale={[1, 0.4, 1]} castShadow>
            <icosahedronGeometry args={[L.r, 1]} />
            <meshStandardMaterial color="#3E6B44" roughness={0.95} flatShading />
          </mesh>
        ))}
      </group>
    );
  }
  /* 다듬은 가로수 — 광장에는 네모지게 다듬은 나무가 선다 */
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.34, 3.4, 8]} />
        <meshStandardMaterial color="#8B6C47" roughness={0.92} />
      </mesh>
      <mesh position={[0, 4.6, 0]} castShadow>
        <boxGeometry args={[3.2, 2.8, 3.2]} />
        <meshStandardMaterial color="#4E8B4A" roughness={0.96} />
      </mesh>
    </group>
  );
}

/** 벤치 — 양식에 맞춘 재료 */
function StyledBench({ x, spec }: { x: number; spec: HallThemeSpec }) {
  const metal = spec.arch === 'hitech' || spec.arch === 'titanium';
  return (
    <group position={[x, 0, 15]}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[3.4, 0.16, 0.9]} />
        <meshStandardMaterial
          color={metal ? '#9AA2AA' : spec.arch === 'hanok' ? '#8E6A44' : '#9A8570'}
          roughness={metal ? 0.35 : 0.9}
          metalness={metal ? 0.7 : 0}
        />
      </mesh>
      {[-1.4, 1.4].map((lx) => (
        <mesh key={lx} position={[lx, 0.19, 0]} castShadow>
          <boxGeometry args={[0.22, 0.38, 0.8]} />
          <meshStandardMaterial color={metal ? '#6E747A' : '#6E6862'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** 석등 — 한옥 마당에만 */
function StoneLantern({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.28, 0]} castShadow><boxGeometry args={[1.2, 0.56, 1.2]} /><meshStandardMaterial color="#A79E92" roughness={0.95} /></mesh>
      <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.24, 0.3, 1.4, 8]} /><meshStandardMaterial color="#B0A79A" roughness={0.94} /></mesh>
      <mesh position={[0, 2.2, 0]} castShadow><boxGeometry args={[1, 0.9, 1]} /><meshStandardMaterial color="#BDB4A6" roughness={0.92} /></mesh>
      <mesh position={[0, 2.85, 0]} castShadow><coneGeometry args={[0.95, 0.7, 4]} /><meshStandardMaterial color="#A79E92" roughness={0.93} /></mesh>
    </group>
  );
}

/**
 * 마당에 놓는 것 전부 — **양식이 정한다.**
 * 물가 건물 앞에는 분수 대신 반사 수반이 놓이고, 한옥 마당에는 석탑과 석등이 선다.
 */
export function PlazaProps({ spec }: { spec: HallThemeSpec }) {
  const water = spec.arch === 'titanium';
  return (
    <group>
      {water ? <ReflectPool accent={spec.accent} /> : <Fountain accent={spec.accent} />}

      <StyledSculpture x={-21} spec={spec} alt={false} />
      <StyledSculpture x={21} spec={spec} alt />

      {spec.trees && [-26, 26].map((tx) =>
        [-6, 4, 14].map((tz) => (
          <StyledTree key={`${tx}-${tz}`} x={tx} z={tz} spec={spec} />
        ))
      )}

      {spec.arch === 'hanok' && [-30, 30].map((lx) =>
        [0, 12].map((lz) => <StoneLantern key={`${lx}-${lz}`} x={lx} z={lz} />)
      )}

      {[-11, 11].map((bx) => <StyledBench key={bx} x={bx} spec={spec} />)}
    </group>
  );
}
