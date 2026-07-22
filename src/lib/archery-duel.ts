/**
 * 양궁 대결 — 턴제.
 *
 * 둘이 각자 기계로 들어와 **번갈아** 쏜다. 1번이 한 발 쏘면 2번 차례,
 * 다시 1번… 서로 상대가 쏘는 걸 보며 기다린다.
 *
 * 계산만 둔다(3D·화면·서버를 모른다). 누구 차례인지·끝났는지·이겼는지는
 * 여기서 정하고 검증한다. 점수 자체는 서버가 씨앗으로 낸다(`scoreRound` 옆).
 */

/** 한 사람이 쏘는 화살 수 (혼자 할 때와 같다) */
export const DUEL_SHOTS = 5;

/** 격발 제한(ms). 넘으면 그 발은 0점이고 차례가 넘어간다. */
export const SHOT_LIMIT_MS = 15_000;

export interface DuelPlayer {
  uid: string;
  name: string;
  /** 지금까지 쏜 발 점수 (서버가 채운다) */
  shots: number[];
}

export interface DuelState {
  /** 방에 들어온 순서. [0] 이 1번. */
  players: DuelPlayer[];
  /** 몇 명이 모여야 시작하나 (1:1 이면 2) */
  size: number;
}

/** 다 모였나 — 그래야 시작한다 */
export function isReady(s: DuelState): boolean {
  return s.players.length >= s.size && s.size >= 2;
}

/**
 * 지금 누가 쏠 차례인가. 다 끝났거나 아직 안 모였으면 `null`.
 *
 * **가장 적게 쏜 사람**이 차례다. 같으면 방에 먼저 들어온 사람(순서 앞).
 * 이러면 1번→2번→1번→2번… 으로 공평하게 번갈아 돈다.
 */
export function whoseTurn(s: DuelState): string | null {
  if (!isReady(s)) return null;
  if (isDone(s)) return null;
  let best: DuelPlayer | null = null;
  for (const p of s.players) {
    if (p.shots.length >= DUEL_SHOTS) continue;
    if (!best || p.shots.length < best.shots.length) best = p;
  }
  return best ? best.uid : null;
}

/** 이 사람이 몇 번째 화살을 쏠 차례인가 (0부터). 씨앗으로 판을 만들 때 쓴다. */
export function shotIndexOf(s: DuelState, uid: string): number {
  const p = s.players.find((x) => x.uid === uid);
  return p ? p.shots.length : 0;
}

/** 모두 다 쐈나 */
export function isDone(s: DuelState): boolean {
  if (!isReady(s)) return false;
  return s.players.every((p) => p.shots.length >= DUEL_SHOTS);
}

export function totalOf(p: DuelPlayer): number {
  return p.shots.reduce((a, b) => a + b, 0);
}

export interface DuelResult {
  /** 이긴 사람 uid. 비기면 null. */
  winnerUid: string | null;
  draw: boolean;
  /** uid → 총점 */
  totals: Record<string, number>;
}

/**
 * 끝난 판의 결과. 아직 안 끝났으면 `null`.
 *
 * 점수가 같으면 비김이다 — 억지로 한 명을 이기게 만들지 않는다.
 */
export function duelResult(s: DuelState): DuelResult | null {
  if (!isDone(s)) return null;
  const totals: Record<string, number> = {};
  let top = -1;
  let topCount = 0;
  let topUid: string | null = null;
  for (const p of s.players) {
    const t = totalOf(p);
    totals[p.uid] = t;
    if (t > top) { top = t; topCount = 1; topUid = p.uid; }
    else if (t === top) topCount += 1;
  }
  const draw = topCount > 1;
  return { winnerUid: draw ? null : topUid, draw, totals };
}
