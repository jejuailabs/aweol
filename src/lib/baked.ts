/**
 * baked — 조명을 켜지 않고 굽는 계산. (docs/10-jeju-warp-map.md)
 *
 * 브루노 시몽 방식: 실시간 조명·그림자 대신, 로드할 때 한 번
 * 정점 색에 명암을 새기고 땅 색에 그림자를 새긴다. 런타임 재질은 전부 unlit.
 *
 * 이 파일은 **3D 를 모르는 산수만** 있다 — three 없이 노드에서 검증한다.
 * `node --experimental-strip-types scripts/verify-baked.mjs`
 */

/** 태양 방향(정규화됨). 씬들이 같은 해를 쓰게 여기 한 곳에만 둔다. */
export const SUN = (() => {
  const x = 0.55, y = 0.8, z = 0.38;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
})();

/** 해 드는 면의 색 기울기(따뜻) / 그늘 면(차가움) / 바닥 반사광(풀색) */
const WARM = [1.04, 1.0, 0.93] as const;
const COOL = [0.72, 0.76, 0.95] as const;
const BOUNCE = [0.62, 0.5, 0.26] as const;

export type RGB = [number, number, number];

/**
 * 노멀 하나가 받는 빛 — 기본색에 **곱할** RGB 를 준다.
 *
 * 램버트(태양) + 반구광(하늘/땅) 에 두 가지 문법을 얹는다:
 * - 해 드는 면은 따뜻하고 그늘 면은 푸르다 (손으로 칠한 그림의 색 규칙)
 * - 아래를 향한 면일수록 바닥의 풀색이 스민다 (라이트 바운스 흉내 — 브루노 공식)
 */
export function lightRGB(nx: number, ny: number, nz: number): RGB {
  const lam = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
  const amb = 0.4 + 0.14 * (ny * 0.5 + 0.5);
  const l = Math.min(1.14, amb + 0.85 * lam);
  const t = Math.min(1, lam * 1.4);
  const bounce = Math.max(0, -ny) * 0.75;
  return [
    (COOL[0] + (WARM[0] - COOL[0]) * t) * l + BOUNCE[0] * bounce,
    (COOL[1] + (WARM[1] - COOL[1]) * t) * l + BOUNCE[1] * bounce,
    (COOL[2] + (WARM[2] - COOL[2]) * t) * l + BOUNCE[2] * bounce,
  ];
}

/**
 * 땅에 그림자를 드리우는 것. r 은 대략의 반지름(m), k 는 진하기(0~1).
 * 나무 0.4~0.5, 건물 0.4~0.5, 담·소품 0.1~0.2 쯤.
 */
export interface Occluder { x: number; z: number; r: number; k: number }

/** 태양의 XZ 방향(그림자가 밀리는 반대 방향 계산에 쓴다) */
const SXZ = (() => {
  const l = Math.hypot(SUN.x, SUN.z);
  return { x: SUN.x / l, z: SUN.z / l };
})();

/**
 * (x,z) 가 받는 그림자 계수 0.45~1.
 *
 * 그림자는 원이 아니다 — **해 반대쪽으로 밀려 길쭉한 타원**이다.
 * 가리개 중심을 해 반대쪽으로 반지름의 45% 밀고, 그 방향으로 1.5배 늘인다.
 */
export function shadowFactor(occluders: readonly Occluder[], x: number, z: number): number {
  let s = 1;
  for (const o of occluders) {
    const cx = o.x - SXZ.x * o.r * 0.45;
    const cz = o.z - SXZ.z * o.r * 0.45;
    const dx = x - cx;
    const dz = z - cz;
    const along = dx * -SXZ.x + dz * -SXZ.z;
    const perp = dx * -SXZ.z + dz * SXZ.x;
    const d2 = (along / 1.5) ** 2 + perp ** 2;
    s -= o.k * Math.exp(-d2 / (2 * (o.r * 0.62) ** 2));
  }
  return Math.max(0.45, s);
}

/**
 * 색에 그림자를 입힌다 — 어두워질 뿐 아니라 **푸르게** 기운다.
 * rgb 는 0~1. 제자리에서 고쳐 쓰지 않고 새 배열을 준다.
 */
export function shadeRGB(rgb: readonly [number, number, number], s: number): RGB {
  const r = rgb[0] * s, g = rgb[1] * s, b = rgb[2] * s;
  const t = (1 - s) * 0.85;
  return [
    r + (r * 0.78 - r) * t,
    g + (g * 0.82 - g) * t,
    b,   // 파랑은 그대로 둔다 — 상대적으로 파래진다
  ];
}

/** hex(0xRRGGBB) → 0~1 RGB. three 없이도 쓰라고 여기 둔다. */
export function hexToRGB(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
