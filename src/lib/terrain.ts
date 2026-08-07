/**
 * terrain — 오름 무대의 땅 모양. (docs/10-jeju-warp-map.md 3층의 '작은 무대')
 *
 * 3D 를 모르는 산수만 있다 — 검증: `node --experimental-strip-types scripts/verify-terrain.mjs`
 *
 * 무대는 한 변 160m. 남쪽(z+)에 평평한 입구 마당이 있고,
 * 북쪽(z-)에 오름이 서 있다. 흙길이 마당에서 능선을 지그재그로 탄다.
 */

/** 무대 절반 크기 — walker bounds 와 땅 판이 같이 쓴다 */
export const STAGE_HALF = 80;

/** 오름 — 자리·크기. 봉우리는 살짝 서쪽으로 치우쳐 능선이 단조롭지 않다. */
export const OREUM = { x: -6, z: -34, r: 34, h: 16 };

/** 입구 마당 — 여기는 평평하다. 아이가 처음 서는 곳. */
export const PLAZA = { x: 0, z: 52, r: 22 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * (x,z) 의 땅 높이.
 *
 * - 종 모양(가우시안) 봉우리에, 각도 따라 울퉁불퉁한 능선을 얹는다
 *   (균일한 종은 인공적으로 보인다)
 * - 들판에는 잔굴곡을 깐다
 * - 마당 둘레는 평평하게 눌러둔다
 */
export function heightAt(x: number, z: number): number {
  const dx = x - OREUM.x;
  const dz = z - OREUM.z;
  const d = Math.hypot(dx, dz);
  const s = OREUM.r * 0.52;
  let h = OREUM.h * Math.exp(-(d * d) / (2 * s * s));
  // 능선의 울퉁불퉁함. 봉우리 바로 옆에서는 죽인다 —
  // 각도항은 중심에 가까울수록 가팔라져서(1/d) 정상이 절벽이 된다.
  h *= 1 + 0.18 * Math.cos(Math.atan2(dz, dx) * 3 + 0.7) * smooth(3, 14, d);
  h += OREUM.h * 0.22 * Math.exp(-(d * d) / (2 * (OREUM.r * 1.15) ** 2));
  h += Math.sin(x * 0.055) * 0.8 + Math.cos(z * 0.047) * 0.6 + Math.sin((x + z) * 0.09) * 0.3;
  h *= smooth(PLAZA.r * 0.7, PLAZA.r * 1.6, Math.hypot(x - PLAZA.x, z - PLAZA.z));
  return h;
}

/** 경사(무차원). 0.7이면 약 35도 — 잔디·나무를 심을지 정할 때 쓴다. */
export function slopeAt(x: number, z: number): number {
  const e = 0.9;
  const hx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const hz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(hx, hz);
}

/**
 * 오름길 — 마당에서 정상까지 비탈을 지그재그로 탄다.
 * 능선을 곧장 오르면 경사가 급해서, 길이 접혀 올라가는 것이 오름답기도 하다.
 */
export const PATH: [number, number][] = [
  [0, 62], [2, 46], [-2, 30], [10, 16], [16, 2],
  [4, -10], [-14, -16], [-22, -30], [-12, -44], [-4, -36],
];

/** 억새가 자라기 시작하는 높이 — 이 위가 '정상 억새밭' 이다 */
export const SILVERGRASS_MIN_H = 8;

/** 정상 근처(표지판·도착 판정에 쓴다) */
export function summit(): { x: number; z: number; h: number } {
  // 봉우리가 치우쳐 있어 수식으로 못 찍는다 — 격자로 훑는다. 로드할 때 한 번이다.
  let best = { x: OREUM.x, z: OREUM.z, h: -1 };
  for (let x = OREUM.x - OREUM.r; x <= OREUM.x + OREUM.r; x += 1) {
    for (let z = OREUM.z - OREUM.r; z <= OREUM.z + OREUM.r; z += 1) {
      const h = heightAt(x, z);
      if (h > best.h) best = { x, z, h };
    }
  }
  return best;
}
