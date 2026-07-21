/**
 * 낱말 묶음 — **여러 게임이 나눠 쓰는 재료.**
 *
 * 게임마다 따로 만들라고 하면 선생님이 안 쓴다. 퀴즈 만드는 것도 일인데
 * 게임 종류만큼 또 만들 수는 없다. 그래서 선생님은 '오늘 배운 낱말 10개' 만
 * 넣고, 아이는 짝맞추기·빙고·낱말맞추기 중 무엇으로든 그걸로 논다.
 *
 * 계산만 하는 곳이다(화면도 3D 도 모른다). 그래야 검증할 수 있다.
 */

export interface WordPair {
  /** 낱말 (예: '광합성') */
  a: string;
  /** 뜻 (예: '빛으로 양분을 만드는 일') */
  b: string;
}

/** 한 줄에 한 쌍. `낱말=뜻` 또는 `낱말:뜻` 또는 탭으로 나눈다. */
const SEP = /\s*[=:\t]\s*/;

export const MAX_PAIRS = 20;
const MAX_LEN = 40;

/**
 * 선생님이 붙여넣은 글을 낱말 쌍으로 바꾼다.
 *
 * 선생님은 대개 한글 파일이나 칠판에서 **줄로 적힌 것**을 가져온다.
 * 그래서 칸을 하나하나 만들게 하지 않고 통째로 붙여넣게 받는다.
 * 잘못된 줄은 버리지 않고 **몇 번째 줄이 왜 안 됐는지** 돌려준다 —
 * 조용히 버리면 선생님이 10개를 넣었는데 7개만 나오는 이유를 알 수 없다.
 */
export function parsePairs(text: string): { pairs: WordPair[]; problems: string[] } {
  const pairs: WordPair[] = [];
  const problems: string[] = [];

  const lines = (text || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    const bits = line.split(SEP);
    if (bits.length < 2) {
      problems.push(`${i + 1}번째 줄: '=' 로 낱말과 뜻을 나눠주세요 — "${line.slice(0, 20)}"`);
      return;
    }
    // '뜻' 안에 = 가 또 있으면 첫 번째만 나눈다
    const a = bits[0].trim();
    const b = bits.slice(1).join('=').trim();
    if (!a || !b) {
      problems.push(`${i + 1}번째 줄: 한쪽이 비었어요 — "${line.slice(0, 20)}"`);
      return;
    }
    if (a.length > MAX_LEN || b.length > MAX_LEN) {
      problems.push(`${i + 1}번째 줄: 너무 길어요 (${MAX_LEN}자까지)`);
      return;
    }
    if (pairs.some((p) => p.a === a)) {
      problems.push(`${i + 1}번째 줄: '${a}' 는 이미 있어요`);
      return;
    }
    if (pairs.length >= MAX_PAIRS) {
      problems.push(`${i + 1}번째 줄부터는 못 받아요 (${MAX_PAIRS}개까지)`);
      return;
    }
    pairs.push({ a, b });
  });

  return { pairs, problems };
}

export interface MatchCard {
  /** 같은 쌍끼리 같은 번호 */
  pairId: number;
  /** 카드에 적힌 글 */
  text: string;
  /** 낱말 쪽인가 뜻 쪽인가 — 화면에서 색을 달리한다 */
  side: 'a' | 'b';
}

/**
 * 짝맞추기 판을 만든다.
 *
 * 쌍이 많으면 카드가 너무 많아 한 화면에 안 들어가고 아이가 지친다.
 * 그래서 `count` 쌍만 뽑아 쓴다(기본 6쌍 = 카드 12장).
 *
 * **섞는 데 `Math.random` 을 안 쓴다.** `seed` 를 받아 섞는다 —
 * 같은 판을 다시 열면 같은 배치가 나와야 하고(새로고침으로 판을 바꿔가며
 * 쉬운 배치를 고를 수 없어야 한다), 무엇보다 검증할 수가 없다.
 */
export function buildMatchDeck(pairs: WordPair[], seed: number, count = 6): MatchCard[] {
  const usable = pairs.slice(0, Math.max(0, Math.min(count, pairs.length)));
  const cards: MatchCard[] = [];
  usable.forEach((p, i) => {
    cards.push({ pairId: i, text: p.a, side: 'a' });
    cards.push({ pairId: i, text: p.b, side: 'b' });
  });
  return shuffle(cards, seed);
}

/**
 * 정해진 순서로 섞기 (같은 seed → 같은 결과).
 *
 * 흔한 Fisher–Yates 인데 난수만 seed 로 만든다.
 */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = (seed | 0) || 1;
  const next = () => {
    // xorshift — 짧고 치우침이 적다
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return Math.abs(s) / 2147483647;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 뒤집은 두 장이 짝인가.
 *
 * 같은 쌍이면서 **서로 다른 쪽**이어야 한다. 낱말 카드 두 장이 우연히 같은
 * 글자여도 짝이 아니다.
 */
export function isMatch(a: MatchCard, b: MatchCard): boolean {
  return a.pairId === b.pairId && a.side !== b.side;
}

/**
 * 점수 — 적게 뒤집을수록 높다.
 *
 * 시간이 아니라 **뒤집은 횟수**로 센다. 시간으로 재면 손이 빠른 아이가
 * 유리하고, 아이가 화면을 급하게 넘기게 된다. 기억해서 맞히는 게 목적이다.
 */
export function matchScore(pairCount: number, flips: number): number {
  if (pairCount <= 0) return 0;
  // 한 번도 안 틀리면 쌍 수의 두 배만 뒤집는다 = 만점
  const best = pairCount * 2;
  const ratio = best / Math.max(flips, best);
  return Math.round(ratio * 100);
}

/** 판을 되짚어 본 결과 */
export interface MatchRun {
  ok: boolean;
  /** 왜 안 되는지 (ok 가 false 일 때만) */
  reason?: string;
  flips: number;
  score: number;
}

/**
 * 아이가 뒤집은 **순서를 그대로 되짚어** 채점한다.
 *
 * 랭킹에 올리려면 점수를 서버가 내야 하는데, 짝맞추기는 달리기·양궁처럼
 * '언제' 만으로는 안 된다. 대신 **무엇을 어떤 순서로 뒤집었는지**를 받으면
 * 판을 다시 만들어 그대로 따라가 볼 수 있다 — 거짓 순서는 도중에 막힌다.
 *
 * `order` 는 카드 자리 번호를 뒤집은 차례대로 늘어놓은 것이다.
 * 두 장씩 끊어 읽으며 확인한다.
 */
export function scoreMatchRun(
  pairs: WordPair[],
  seed: number,
  order: unknown,
  count = 6
): MatchRun {
  const deck = buildMatchDeck(pairs, seed, count);
  const pairCount = new Set(deck.map((c) => c.pairId)).size;
  const bad = (reason: string): MatchRun => ({ ok: false, reason, flips: 0, score: 0 });

  if (pairCount === 0) return bad('빈 판');
  if (!Array.isArray(order)) return bad('순서가 없어요');
  // 아무리 못해도 이보다 많이 뒤집지는 않는다. 끝없이 긴 입력을 막는다.
  if (order.length > pairCount * 40) return bad('너무 많이 뒤집었어요');
  if (order.length % 2 !== 0) return bad('짝이 안 맞는 순서예요');

  const matched = new Set<number>();
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i];
    const b = order[i + 1];
    if (!Number.isInteger(a) || !Number.isInteger(b)) return bad('자리 번호가 아니에요');
    const x = a as number;
    const y = b as number;
    if (x < 0 || y < 0 || x >= deck.length || y >= deck.length) return bad('없는 자리예요');
    // 같은 카드를 두 번 뒤집을 수는 없다
    if (x === y) return bad('같은 카드를 두 번 뒤집었어요');
    // 이미 맞힌 쌍은 덮여 있다
    if (matched.has(deck[x].pairId) || matched.has(deck[y].pairId)) return bad('이미 맞힌 카드예요');
    if (isMatch(deck[x], deck[y])) matched.add(deck[x].pairId);
  }

  if (matched.size !== pairCount) return bad('아직 다 맞히지 못했어요');
  return { ok: true, flips: order.length, score: matchScore(pairCount, order.length) };
}
