/**
 * 양궁 — 집중력 게임.
 *
 * **점수를 클라이언트가 계산하지 않는다.** 순위표가 걸리는 게임이라
 * 점수를 보내게 하면 아무 숫자나 보낼 수 있다. 대신 아이는 '언제 쏘았는지'(ms)만
 * 보내고, 서버가 씨앗으로 조준점을 **다시 계산해서** 점수를 낸다.
 *
 * 그러려면 흔들림·바람이 **씨앗만으로 정해져야** 한다 — 여기 있는 함수는
 * 전부 그 성질을 지킨다(같은 씨앗·같은 시각 → 같은 값).
 */

/** 한 판에 쏘는 화살 수 */
export const SHOTS = 5;
/** 과녁 반지름(화면과 무관한 단위). 이 밖은 0점. */
export const TARGET_R = 100;

/**
 * 난이도.
 *
 * 예전엔 하나뿐이라 44/50 이 쉽게 나왔다 — 흔들림이 느려 타이밍이 넉넉하고
 * 바람도 약했다. 둘을 난이도로 묶는다.
 * - `mul`: 흔들리는 **빠르기** 배수. 빠를수록 정중앙을 지나는 순간이 짧아 어렵다.
 * - `windMul`: 바람 배수. 셀수록 가운데서 쏴도 밀려 손해가 크다(반대쪽을 노려야).
 *
 * **서버가 이 값으로 다시 채점한다.** 그래서 판을 시작할 때 고른 난이도를
 * `archeryRounds` 에 적어두고, 낼 때 그걸로 되짚는다 — 화면이 난이도를 우겨도 안 통한다.
 */
export type Level = 'easy' | 'normal' | 'hard';

export const LEVELS: Record<Level, { label: string; mul: number; windMul: number }> = {
  easy: { label: '쉬움', mul: 0.62, windMul: 0.5 },
  normal: { label: '보통', mul: 1, windMul: 1 },
  hard: { label: '어려움', mul: 1.7, windMul: 1.5 },
};

export function asLevel(v: unknown): Level {
  return v === 'easy' || v === 'hard' ? v : 'normal';
}

/**
 * 판을 정하는 씨앗에서 화살마다 다른 수를 뽑는다 (0~1).
 *
 * 섞기가 약하면 **씨앗이 달라도 같은 값**이 나온다. 처음에 xorshift 를 얕게
 * 돌렸다가 첫 화살 바람이 씨앗 20개에서 전부 7.0 으로 나왔다 — 아이가 한 번
 * 외우면 매번 같은 곳을 노리면 된다. 그래서 곱셈으로 제대로 흩는다.
 */
function hash(seed: number, i: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (i | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface ShotSetup {
  /**
   * 흔들리는 **선의 길이**(중앙에서 한쪽 끝까지).
   *
   * 조준점은 한 직선 위를 오간다 — 그래서 **반 주기마다 정중앙을 지난다.**
   * 그 순간에 쏘면 만점이다. 요령이 생기려면 중앙을 실제로 지나야 한다.
   * (예전엔 x·y 를 따로 흔들어 리사주 곡선을 그렸고, 정중앙을 한 번도 안 지났다)
   */
  reach: number;
  /** 흔들리는 선의 기울기(rad). 화살마다 달라 늘 같은 자리를 노릴 수 없다. */
  angle: number;
  /** 흔들리는 빠르기 (rad/s) */
  speed: number;
  /** 바람 — 화살이 날아가는 동안 옆으로 밀리는 양 */
  wind: number;
}

/**
 * 이 화살의 조건. 씨앗과 몇 번째 화살인지만으로 정해진다.
 *
 * 뒤로 갈수록 조금씩 어려워진다 — 처음부터 어려우면 아이가 그만둔다.
 */
export function shotSetup(seed: number, i: number, level: Level = 'normal'): ShotSetup {
  const a = hash(seed, i * 3);
  const b = hash(seed, i * 3 + 1);
  const c = hash(seed, i * 3 + 2);
  const step = i / Math.max(1, SHOTS - 1); // 0 → 1
  const L = LEVELS[level];
  return {
    // 뒤로 갈수록 선이 길어져(멀리까지 흔들려) 타이밍 잡기가 어려워진다
    reach: 34 + a * 26 + step * 24,
    // 기울기는 화살마다 다르다 — 한 바퀴 어디로든
    angle: b * Math.PI * 2,
    // 난이도가 흔들리는 빠르기를 정한다 — 빠를수록 중앙을 지나는 순간이 짧다
    speed: (1.7 + c * 1.1 + step * 0.5) * L.mul,
    // 바람은 좌우 어느 쪽이든. 난이도가 셀수록 세게 분다.
    wind: (hash(seed, i * 3 + 7) - 0.5) * (16 + step * 14) * L.windMul,
  };
}

/**
 * 시각 t(ms)일 때 조준점이 어디에 있나.
 *
 * 좌우와 위아래의 빠르기를 살짝 다르게 둔다 — 같으면 대각선으로만 왔다갔다해서
 * 타이밍이 뻔해진다. 어긋나게 두면 8자를 그리며 돈다.
 */
export function aimAt(setup: ShotSetup, tMs: number): { x: number; y: number } {
  const t = tMs / 1000;
  // 한 직선 위를 오간다. sin 이 0 일 때(반 주기마다) 정중앙을 지난다.
  const along = Math.sin(t * setup.speed) * setup.reach;
  return {
    x: Math.cos(setup.angle) * along,
    y: Math.sin(setup.angle) * along,
  };
}

/** 화살이 실제로 꽂히는 자리 — 조준점에서 바람만큼 밀린다 */
export function landing(setup: ShotSetup, tMs: number): { x: number; y: number } {
  const aim = aimAt(setup, tMs);
  return { x: aim.x + setup.wind, y: aim.y };
}

/**
 * 점수 — 가운데에 가까울수록 높다.
 *
 * 10점(가운데)부터 1점까지, 과녁 밖은 0점.
 * 실제 양궁과 같은 방식이라 아이가 설명 없이도 안다.
 */
export function ringScore(x: number, y: number): number {
  const d = Math.hypot(x, y);
  if (d > TARGET_R) return 0;
  /*
    반지름을 10등분 — 가운데 칸이 10점.
    한가운데(d=0)는 ceil(0)=0 이라 11 이 나온다. 만점을 넘으면 안 되니 눌러준다.
  */
  return Math.min(10, Math.max(1, 11 - Math.ceil((d / TARGET_R) * 10)));
}

/**
 * 한 판 점수 매기기 — **서버가 부른다.**
 *
 * `times` 는 아이가 각 화살을 쏜 시각(ms). 조준점도 바람도 여기서 다시 계산하므로
 * 아이가 점수를 꾸며 보낼 수 없다.
 *
 * 안 쏜 화살(빠진 값)은 0점이다. 화살 수를 넘겨 보내도 앞의 `SHOTS` 개만 센다.
 */
export function scoreRound(
  seed: number,
  times: unknown,
  level: Level = 'normal'
): { shots: number[]; total: number } {
  const list = Array.isArray(times) ? times : [];
  const shots: number[] = [];
  for (let i = 0; i < SHOTS; i++) {
    const t = list[i];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) {
      shots.push(0);
      continue;
    }
    const p = landing(shotSetup(seed, i, level), t);
    shots.push(ringScore(p.x, p.y));
  }
  return { shots, total: shots.reduce((a, b) => a + b, 0) };
}

/** 만점 (아이에게 '몇 점 만점'인지 보여준다) */
export const PERFECT = SHOTS * 10;
