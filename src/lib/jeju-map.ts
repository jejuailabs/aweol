/**
 * jeju-map — 제주 전도 워프 허브의 산수. (docs/10-jeju-warp-map.md 3층의 ①)
 *
 * 실좌표(위도·경도)를 km 평면으로 투영해 섬 모양과 장소를 앉힌다.
 * 3D 를 모르는 계산만 — 검증: `node --experimental-strip-types scripts/verify-jeju-map.mjs`
 *
 * 좌표계: 1 단위 = 1km. 동쪽 = +x, 북쪽 = -z (three 의 화면 위쪽).
 */

/** 투영 중심 — 제주도 한가운데쯤 */
export const CENTER = { lng: 126.55, lat: 33.385 };

/** 위도 1도 ≈ 111km. 경도는 위도에 따라 줄어든다. */
const KM_PER_DEG = 111;
const LNG_SCALE = Math.cos((CENTER.lat * Math.PI) / 180);

export function project(lng: number, lat: number): { x: number; z: number } {
  return {
    x: (lng - CENTER.lng) * KM_PER_DEG * LNG_SCALE,
    z: -(lat - CENTER.lat) * KM_PER_DEG,
  };
}

/**
 * 해안선 — 실제 제주 윤곽을 20여 점으로 단순화한 것.
 * 정밀 지도가 아니라 **아이가 "제주도다!" 하고 알아보는 모양**이 목표다.
 * (lng, lat) 반시계 방향.
 */
export const COAST: [number, number][] = [
  [126.16, 33.31],   // 수월봉(서쪽 끝)
  [126.19, 33.245],
  [126.25, 33.215],  // 모슬포
  [126.31, 33.228],  // 산방산
  [126.42, 33.238],  // 중문
  [126.56, 33.238],  // 서귀포
  [126.63, 33.248],
  [126.72, 33.278],  // 남원
  [126.84, 33.315],  // 표선
  [126.90, 33.378],
  [126.945, 33.43],
  [126.935, 33.472], // 성산(동쪽 끝)
  [126.84, 33.52],   // 세화
  [126.75, 33.556],  // 김녕
  [126.63, 33.545],  // 조천
  [126.52, 33.512],  // 제주시
  [126.40, 33.49],
  [126.33, 33.482],  // 애월 해안
  [126.295, 33.472], // 한담 앞바다 — 실제로 해안이 여기서 볼록하다
  [126.26, 33.42],   // 한림
  [126.21, 33.38],
];

/** km 평면으로 투영한 해안선 */
export const COAST_KM: [number, number][] = COAST.map(([lng, lat]) => {
  const p = project(lng, lat);
  return [p.x, p.z];
});

/** 점이 다각형 안에 있는가 (ray casting) */
export function insideCoast(x: number, z: number): boolean {
  let inside = false;
  const n = COAST_KM.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = COAST_KM[i];
    const [xj, zj] = COAST_KM[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 해안선까지의 거리(km). 안이면 양수, 밖이면 음수. */
export function coastDistance(x: number, z: number): number {
  let best = Infinity;
  const n = COAST_KM.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = COAST_KM[i];
    const [xj, zj] = COAST_KM[j];
    const dx = xj - xi, dz = zj - zi;
    const len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / len2));
    const px = xi + dx * t, pz = zi + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return insideCoast(x, z) ? best : -best;
}

/** 한라산 — 섬의 등뼈. 시각적 높이는 과장한다(실축이면 안 보인다). */
export const HALLASAN = { lng: 126.5312, lat: 33.3616, hKm: 6.2, sigmaKm: 9.5 };

/**
 * 전도의 땅 높이(시각 단위). 바다는 -0.35 평평.
 * 해안에서 안쪽으로 완만히 오르다 한라산이 솟는다.
 */
export function islandHeight(x: number, z: number): number {
  const d = coastDistance(x, z);
  if (d <= 0) return -0.35;
  const rim = Math.min(1, d / 2.2);           // 해안 띠는 낮다
  const hp = project(HALLASAN.lng, HALLASAN.lat);
  const dh = Math.hypot(x - hp.x, z - hp.z);
  const halla = HALLASAN.hKm * Math.exp(-(dh * dh) / (2 * HALLASAN.sigmaKm ** 2));
  // 오름들 — 실제 자리를 다 앉히는 대신 낮은 물결로 눈에만 보인다
  const ripple = 0.18 * (Math.sin(x * 0.55) * Math.cos(z * 0.5) + Math.sin((x + z) * 0.33));
  return rim * (0.35 + halla + ripple);
}

/** 워프 장소 */
export interface JejuPlace {
  id: string;
  name: string;
  emoji: string;
  lng: number;
  lat: number;
  /** open 이면 지금 들어갈 수 있다. soon 은 '예정중'. */
  status: 'open' | 'soon';
  /** open 일 때 이동할 경로 */
  route?: string;
}

export const PLACES: JejuPlace[] = [
  // ── 열린 곳 — 애월·곽지·한담 ──
  { id: 'aewol', name: '애월', emoji: '🏫', lng: 126.3312, lat: 33.4626, status: 'open', route: '/village' },
  { id: 'handam', name: '한담해변', emoji: '☕', lng: 126.3105, lat: 33.461, status: 'open', route: '/village?spot=handam' },
  { id: 'gwakji', name: '곽지과물해변', emoji: '🏖️', lng: 126.3047, lat: 33.4513, status: 'open', route: '/village?spot=gwakji' },
  // 오름 무대 — 애월 안쪽 들판의 오름이다 (어도오름 자리쯤)
  { id: 'oreum', name: '오름', emoji: '⛰️', lng: 126.345, lat: 33.428, status: 'open', route: '/village/oreum' },
  // ── 예정중 ──
  { id: 'jeju-si', name: '제주시', emoji: '🏙️', lng: 126.5312, lat: 33.4996, status: 'soon' },
  { id: 'hallim', name: '한림', emoji: '⛵', lng: 126.2692, lat: 33.414, status: 'soon' },
  { id: 'hyeopjae', name: '협재', emoji: '🐚', lng: 126.2397, lat: 33.394, status: 'soon' },
  { id: 'hallasan', name: '한라산', emoji: '🗻', lng: 126.5312, lat: 33.3616, status: 'soon' },
  { id: 'seongsan', name: '성산일출봉', emoji: '🌅', lng: 126.92, lat: 33.459, status: 'soon' },
  { id: 'gimnyeong', name: '김녕', emoji: '🐬', lng: 126.758, lat: 33.543, status: 'soon' },
  { id: 'pyoseon', name: '표선', emoji: '🏝️', lng: 126.832, lat: 33.327, status: 'soon' },
  { id: 'seogwipo', name: '서귀포', emoji: '🍊', lng: 126.56, lat: 33.253, status: 'soon' },
  { id: 'jungmun', name: '중문', emoji: '🐋', lng: 126.425, lat: 33.251, status: 'soon' },
  { id: 'mosulpo', name: '모슬포', emoji: '🎣', lng: 126.251, lat: 33.227, status: 'soon' },
];
