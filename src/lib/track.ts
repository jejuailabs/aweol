/**
 * 운동장 트랙 판정.
 *
 * 트랙은 직선 두 개와 반원 두 개로 된 타원형이다.
 * 화면(3D)과 판정이 **같은 숫자**를 봐야 해서 여기 한 곳에만 둔다 —
 * 그림과 판정선이 어긋나면 아이는 안 밟았는데 탈락한다.
 */

/** 직선 구간 길이 (x 방향) */
export const STRAIGHT = 14;
/** 반원 반지름 — 트랙 중심선까지 */
export const RADIUS = 7;
/** 중심선에서 좌우로 이만큼이 달릴 수 있는 폭. 넘으면 선을 밟은 것 */
export const LANE_HALF = 2.2;

export const HALF_STRAIGHT = STRAIGHT / 2;
export const PERIMETER = 2 * STRAIGHT + 2 * Math.PI * RADIUS;

/** 통과해야 하는 지점 수. 많을수록 질러가기가 어렵다 */
export const CHECKPOINTS = 8;

/**
 * 중심선에서 얼마나 벗어났나.
 * 0이면 정확히 트랙 한가운데, LANE_HALF 를 넘으면 선 밖이다.
 */
export function offCenter(x: number, z: number): number {
  if (Math.abs(x) <= HALF_STRAIGHT) {
    // 직선 구간 — 위아래 어느 쪽이든 중심선까지 거리
    return Math.abs(Math.abs(z) - RADIUS);
  }
  // 곡선 구간 — 반원 중심에서의 거리
  const cx = x > 0 ? HALF_STRAIGHT : -HALF_STRAIGHT;
  const d = Math.sqrt((x - cx) * (x - cx) + z * z);
  return Math.abs(d - RADIUS);
}

/**
 * 트랙을 얼마나 돌았나 (0 ~ PERIMETER).
 *
 * 출발선은 위쪽 직선의 왼쪽 끝. 거기서 시계 반대 방향으로 센다.
 * 이 값이 있어야 '가로질러 갔는지'를 잡을 수 있다 — 거리만 보면
 * 트랙 안쪽으로 질러가도 중심선 근처라 통과해버린다.
 */
export function progress(x: number, z: number): number {
  if (z >= 0 && Math.abs(x) <= HALF_STRAIGHT) {
    // 위쪽 직선: 왼 → 오
    return x + HALF_STRAIGHT;
  }
  if (x > HALF_STRAIGHT) {
    // 오른쪽 반원: 위(90°) → 아래(-90°)
    const ang = Math.atan2(z, x - HALF_STRAIGHT);
    const t = (Math.PI / 2 - ang + Math.PI * 2) % (Math.PI * 2);
    return STRAIGHT + t * RADIUS;
  }
  if (z < 0 && Math.abs(x) <= HALF_STRAIGHT) {
    // 아래쪽 직선: 오 → 왼
    return STRAIGHT + Math.PI * RADIUS + (HALF_STRAIGHT - x);
  }
  // 왼쪽 반원: 아래 → 위
  const ang = Math.atan2(z, x + HALF_STRAIGHT);
  const t = (-Math.PI / 2 - ang + Math.PI * 2) % (Math.PI * 2);
  return 2 * STRAIGHT + Math.PI * RADIUS + t * RADIUS;
}

/** 중심선 위의 좌표 — 트랙을 그릴 때 쓴다 */
export function pointAt(s: number): [number, number] {
  const p = ((s % PERIMETER) + PERIMETER) % PERIMETER;
  if (p < STRAIGHT) return [p - HALF_STRAIGHT, RADIUS];
  if (p < STRAIGHT + Math.PI * RADIUS) {
    const t = (p - STRAIGHT) / RADIUS;
    const ang = Math.PI / 2 - t;
    return [HALF_STRAIGHT + Math.cos(ang) * RADIUS, Math.sin(ang) * RADIUS];
  }
  if (p < 2 * STRAIGHT + Math.PI * RADIUS) {
    return [HALF_STRAIGHT - (p - STRAIGHT - Math.PI * RADIUS), -RADIUS];
  }
  const t = (p - 2 * STRAIGHT - Math.PI * RADIUS) / RADIUS;
  const ang = -Math.PI / 2 - t;
  return [-HALF_STRAIGHT + Math.cos(ang) * RADIUS, Math.sin(ang) * RADIUS];
}

/** 출발 지점 (출발선 바로 뒤) */
export const START_POS: [number, number, number] = [-HALF_STRAIGHT + 0.5, 0, RADIUS];

/**
 * 한 바퀴를 제대로 돌았는지 세는 상태기.
 *
 * 체크포인트를 **순서대로** 지나야 한 바퀴로 친다.
 * 안 그러면 출발선 앞에서 앞뒤로 왔다갔다만 해도 기록이 찍힌다.
 */
export class LapCounter {
  private next = 1;
  /** 지금까지 지난 체크포인트 수 */
  get passed() { return this.next - 1; }
  get total() { return CHECKPOINTS; }

  /** 위치를 넣는다. 한 바퀴를 막 채웠으면 true */
  update(x: number, z: number): boolean {
    const s = progress(x, z);
    const zoneSize = PERIMETER / CHECKPOINTS;

    if (this.next < CHECKPOINTS) {
      // 다음 체크포인트 구간에 들어왔나
      if (s >= this.next * zoneSize && s < (this.next + 1) * zoneSize) {
        this.next += 1;
      }
      return false;
    }
    // 마지막 — 출발선(진행도 0 근처)으로 돌아오면 한 바퀴
    if (s < zoneSize * 0.5) {
      this.next = 1;
      return true;
    }
    return false;
  }

  reset() { this.next = 1; }
}

/** 1분 12초 34 처럼 보여준다 */
export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  const body = `${s}.${String(cs).padStart(2, '0')}초`;
  return m > 0 ? `${m}분 ${body}` : body;
}
