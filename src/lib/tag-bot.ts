/**
 * 술래잡기 연습 상대 — 로봇.
 *
 * 혼자 들어온 아이는 할 게 없었다. 친구가 없으면 시작 자체가 막히니
 * 들어왔다 그냥 나간다.
 *
 * **AI 가 아니다.** 가장 가까운 사람 쪽으로 조금씩 다가올 뿐이다. 오히려
 * 그래서 아이가 요령을 익힌다 — 어디로 돌면 따돌릴 수 있는지 몸으로 안다.
 *
 * **혼자일 때만 나온다.** 그래서 로봇은 그 아이 화면에만 있으면 되고,
 * 위치를 남과 맞출 일이 없다(맞추려 들면 사람마다 로봇이 딴 데 있게 된다).
 *
 * 계산만 둔다 — 3D 안은 눈으로 확인할 수 없으니 여기서 재봐야 한다.
 */

export interface Vec2 { x: number; z: number }

/** 잡혔다고 볼 거리 */
export const CATCH_DIST = 1.1;

/*
  ── 난이도 조율값 ──
  너무 쉽거나 어려우면 **여기 세 줄만** 고치면 된다.

  주의: 계산으로 시늉낸 '가상의 아이' 로는 난이도를 못 정한다.
  실제로 재봤더니 도망 속도를 3 으로 하든 4.8 로 하든 11초로 같게 나왔다 —
  가상의 아이가 벽 앞에서 실제 아이처럼 돌지 못하기 때문이다.
  **얼마나 재미있는지는 사람이 해봐야 안다.**
  여기서 확인할 수 있는 건 '아이보다 느린가'·'판이 끝나기는 하는가' 까지다.
*/

/** 처음 속도. 아이는 4.8~5 로 달리므로 넉넉히 느리다. */
const BASE_SPEED = 2.6;
/** 1초에 이만큼씩 빨라진다. 안 그러면 영영 안 잡혀 판이 안 끝난다. */
const SPEED_RAMP = 0.075;
/** 그래도 이보다 빠르지는 않다. 아이보다 빠르면 도망칠 방법이 없다. */
const MAX_SPEED = 4.4;

/** 붙잡히기 전 잠깐 봐주는 시간(초). 시작하자마자 잡히면 억울하다. */
export const GRACE_SEC = 2;

/** 몇 초쯤 지난 로봇의 속도 */
export function botSpeed(elapsedSec: number): number {
  const t = Math.max(0, elapsedSec);
  return Math.min(MAX_SPEED, BASE_SPEED + t * SPEED_RAMP);
}

/**
 * 로봇을 한 걸음 옮긴다.
 *
 * 곧장 직선으로만 오면 벽을 타고 도는 아이를 영영 못 잡고, 반대로 너무
 * 똑똑하면 도망칠 방법이 없다. 지금은 **곧장 오되 느리게** 다.
 *
 * `bounds` 를 넘지 않는다 — 운동장 밖으로 걸어나가면 로봇이 사라진 것처럼 보인다.
 */
export function stepBot(
  bot: Vec2,
  target: Vec2,
  dtSec: number,
  elapsedSec: number,
  bounds: { half: number }
): Vec2 {
  const dx = target.x - bot.x;
  const dz = target.z - bot.z;
  const dist = Math.hypot(dx, dz);
  // 이미 닿아 있으면 더 움직이지 않는다(덜덜 떠는 것처럼 보인다)
  if (dist < 0.001) return { ...bot };

  const step = Math.min(botSpeed(elapsedSec) * Math.max(0, dtSec), dist);
  const nx = bot.x + (dx / dist) * step;
  const nz = bot.z + (dz / dist) * step;

  const clamp = (v: number) => Math.max(-bounds.half, Math.min(bounds.half, v));
  return { x: clamp(nx), z: clamp(nz) };
}

/**
 * 잡혔나.
 *
 * 시작하자마자 코앞에 서 있으면 억울하므로 `GRACE_SEC` 동안은 안 잡힌다.
 */
export function isCaught(bot: Vec2, target: Vec2, elapsedSec: number): boolean {
  if (elapsedSec < GRACE_SEC) return false;
  return Math.hypot(bot.x - target.x, bot.z - target.z) <= CATCH_DIST;
}

/**
 * 로봇이 처음 설 자리 — 아이에게서 가장 먼 구석.
 *
 * 가까이서 시작하면 몇 초 만에 끝난다.
 */
export function botStart(target: Vec2, bounds: { half: number }): Vec2 {
  const h = bounds.half * 0.85;
  return { x: target.x >= 0 ? -h : h, z: target.z >= 0 ? -h : h };
}

/** 버틴 시간을 사람이 읽는 말로 */
export function formatSurvived(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1)}초`;
}
