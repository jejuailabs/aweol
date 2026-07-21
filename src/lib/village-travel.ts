/**
 * 마을을 어떻게 돌아다니는가 — 걷기와 자동차, 그리고 워프.
 *
 * 계산만 하는 곳이다(3D 를 모른다). 이렇게 떼어놔야 검증할 수 있다 —
 * 3D 안은 눈으로 확인할 방법이 마땅치 않다.
 */

export type TravelMode = 'walk' | 'car';

/** 걸어다니는 속도 (m/s 에 가깝다) */
export const WALK_SPEED = 7;
/** 자동차 속도. 학교 근처를 벗어나면 걸어서는 너무 멀다. */
export const CAR_SPEED = 18;

/**
 * 마을 경계.
 *
 * **들어가는 선과 나오는 선을 다르게 둔다.** 하나로 두면 그 선 위에 서 있을 때
 * 걷기↔자동차가 매 프레임 뒤집혀서 화면이 떨린다.
 * (온도조절기가 켜짐/꺼짐 온도를 다르게 두는 것과 같은 이유)
 */
export const CAR_ON_M = 90;
export const CAR_OFF_M = 70;

/**
 * 지금 어떤 모드여야 하는가. **지금 모드를 알아야** 답할 수 있다.
 *
 * - 걷는 중이면 `CAR_ON_M` 을 넘어야 차를 탄다.
 * - 차를 탄 중이면 `CAR_OFF_M` 안으로 들어와야 내린다.
 * - 그 사이(70~90m)에서는 **하던 대로 둔다.**
 */
export function nextTravelMode(distanceFromSchool: number, current: TravelMode): TravelMode {
  if (current === 'walk') return distanceFromSchool > CAR_ON_M ? 'car' : 'walk';
  return distanceFromSchool < CAR_OFF_M ? 'walk' : 'car';
}

export function speedOf(mode: TravelMode): number {
  return mode === 'car' ? CAR_SPEED : WALK_SPEED;
}

export interface WarpTarget {
  id: string;
  name: string;
  x: number;
  z: number;
  /** 학교까지 몇 m 인가. 가까운 곳부터 보여주려고 쓴다. */
  dist: number;
}

interface PoiLike { x: number; z: number; k: string; n?: string }

/**
 * 워프할 수 있는 곳을 고른다.
 *
 * 동네에서 이름 붙은 곳이 수백 개씩 나올 수 있는데 다 보여주면 고를 수가 없다.
 * 그래서 **이름이 있고**, 서로 너무 붙어 있지 않은 곳만 남긴다.
 * 학교는 언제나 첫 번째다 — 길을 잃었을 때 돌아올 곳이 있어야 한다.
 */
export function warpTargets(
  pois: PoiLike[],
  schoolName: string,
  opts: { max?: number; minGapM?: number } = {}
): WarpTarget[] {
  const max = opts.max ?? 8;
  const minGap = opts.minGapM ?? 60;

  const school: WarpTarget = { id: 'school', name: schoolName, x: 0, z: 0, dist: 0 };

  const named = pois
    .filter((p) => (p.n ?? '').trim().length > 0)
    .map((p) => ({
      id: `${p.k}:${p.n}:${Math.round(p.x)}:${Math.round(p.z)}`,
      name: (p.n as string).trim(),
      x: p.x,
      z: p.z,
      dist: Math.hypot(p.x, p.z),
    }))
    .sort((a, b) => a.dist - b.dist);

  const picked: WarpTarget[] = [school];
  for (const t of named) {
    if (picked.length >= max) break;
    // 이미 고른 곳과 너무 가까우면 건너뛴다 (같은 건물의 여러 이름이 줄줄이 뜬다)
    if (picked.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < minGap)) continue;
    // 이름이 같은 곳도 한 번만
    if (picked.some((p) => p.name === t.name)) continue;
    picked.push(t);
  }
  return picked;
}
