/**
 * 광장 OX 퀴즈 — **몸으로 답하는 퀴즈.**
 *
 * 광장 왼쪽이 O, 오른쪽이 X 다. 문제가 나오면 10초 안에 자기가 맞다고
 * 생각하는 쪽으로 걸어간다. 시간이 끝나면 3초 뒤에 정답이 열리고,
 * 틀린 쪽에 서 있던 아이는 탈락한다. 마지막 한 명이 남을 때까지.
 *
 * ---
 *
 * **정답은 서버만 안다.**
 *
 * 이 파일의 문제 은행은 서버에서만 읽는다. 문제와 정답을 함께 실시간 판에
 * 올려두면 화면 개발자도구 한 번이면 다 보인다 — 반 전체가 하는 놀이에서
 * 한 명이 답을 미리 보면 놀이가 끝난다.
 * 그래서 판에는 **문제 글만** 올라가고, 정답은 시간이 지난 뒤에 서버가 올린다.
 *
 * 답을 고르는 것도 **시간이 지나면 못 바꾼다** — 실시간 규칙(`database.rules.json`)이
 * `now < endsAt` 일 때만 쓰게 막는다. 정답을 보고 슬쩍 옮기는 것을 막는 건
 * 화면이 아니라 규칙이어야 한다.
 */

export type OX = 'O' | 'X';

export interface OXQuestion {
  /** 문제 글 */
  q: string;
  /** 정답 */
  a: OX;
  /** 정답을 열 때 함께 보여주는 한 줄. 틀린 아이도 배우고 나가야 한다. */
  why: string;
  /** 1(쉬움) ~ 3(어려움) */
  level: 1 | 2 | 3;
  /** 어느 학년쯤인가 — 학년을 가려 뽑을 때 쓴다 */
  grade: number;
}

/** 답을 고를 수 있는 시간 */
export const ANSWER_MS = 10_000;
/** 시간이 끝나고 정답을 열기까지 — 이 사이가 제일 조마조마하다 */
export const REVEAL_MS = 3_000;
/** 정답을 보고 다음 문제로 넘어가기까지 */
export const NEXT_MS = 4_000;
/** 한 판에 낼 수 있는 문제 수 (이만큼 내고도 안 끝나면 남은 사람 모두 우승) */
export const MAX_ROUNDS = 20;

/**
 * 문제 은행.
 *
 * **초등학교 교실에서 다 같이 하는 놀이다.** 그래서 규칙을 뒀다:
 * - 정답이 **자료에 따라 갈리지 않는 것**만 낸다(유적 이야기에서와 같은 선이다).
 * - 아이를 갈라놓는 것(집안 형편·외모·종교)은 안 낸다.
 * - 틀려도 **왜 그런지 한 줄**은 꼭 붙인다. 틀린 아이가 그냥 앉기만 하면 배울 게 없다.
 */
export const OX_QUESTIONS: OXQuestion[] = [
  // ── 1단계: 거의 다 맞히는 것. 첫 문제로 다 탈락하면 놀이가 안 된다 ──
  { q: '제주도는 우리나라에서 가장 큰 섬이다.', a: 'O', why: '맞아요. 제주도가 가장 큰 섬이에요.', level: 1, grade: 3 },
  { q: '해는 서쪽에서 뜬다.', a: 'X', why: '해는 동쪽에서 떠서 서쪽으로 져요.', level: 1, grade: 1 },
  { q: '물은 얼면 부피가 커진다.', a: 'O', why: '그래서 언 페트병이 빵빵해져요.', level: 1, grade: 4 },
  { q: '거미는 곤충이다.', a: 'X', why: '곤충은 다리가 6개예요. 거미는 8개라 곤충이 아니에요.', level: 1, grade: 3 },
  { q: '한글을 만든 임금은 세종대왕이다.', a: 'O', why: '세종대왕이 훈민정음을 만들었어요.', level: 1, grade: 3 },
  { q: '박쥐는 새다.', a: 'X', why: '박쥐는 새끼를 낳고 젖을 먹이는 젖먹이동물이에요.', level: 1, grade: 3 },
  { q: '1년은 12달이다.', a: 'O', why: '1월부터 12월까지 열두 달이에요.', level: 1, grade: 1 },
  { q: '무지개는 색이 다섯 가지다.', a: 'X', why: '빨주노초파남보, 일곱 가지로 봐요.', level: 1, grade: 2 },
  { q: '고래는 물속에 살지만 숨을 쉬러 물 위로 올라온다.', a: 'O', why: '고래는 폐로 숨을 쉬어요.', level: 1, grade: 3 },
  { q: '태극기 가운데 그림은 네모다.', a: 'X', why: '가운데는 빨강·파랑이 도는 둥근 태극이에요.', level: 1, grade: 2 },

  // ── 2단계: 헷갈리는 것 ──
  { q: '한라산은 우리나라에서 가장 높은 산이다.', a: 'O', why: '한라산이 1,947m 로 가장 높아요.', level: 2, grade: 4 },
  { q: '토마토는 채소가 아니라 과일이다.', a: 'X', why: '먹는 방법으로 나누면 채소로 봐요. 열매인 건 맞고요.', level: 2, grade: 4 },
  { q: '달은 스스로 빛을 낸다.', a: 'X', why: '달은 햇빛을 받아서 반사할 뿐이에요.', level: 2, grade: 5 },
  { q: '소리는 물속에서도 퍼진다.', a: 'O', why: '오히려 공기 중보다 빠르게 퍼져요.', level: 2, grade: 5 },
  { q: '식물도 숨을 쉰다.', a: 'O', why: '식물도 밤낮으로 숨을 쉬어요.', level: 2, grade: 4 },
  { q: '지구에서 가장 가까운 별은 북극성이다.', a: 'X', why: '가장 가까운 별은 태양이에요.', level: 2, grade: 5 },
  { q: '독도는 우리나라 땅이다.', a: 'O', why: '독도는 경상북도 울릉군에 속한 우리 땅이에요.', level: 2, grade: 4 },
  { q: '얼음이 물에 뜨는 것은 물보다 가볍기 때문이다.', a: 'O', why: '같은 부피일 때 얼음이 더 가벼워요.', level: 2, grade: 5 },
  { q: '112는 불이 났을 때 거는 번호다.', a: 'X', why: '불은 119, 위험한 일은 112 예요.', level: 2, grade: 2 },
  { q: '우리 몸에서 가장 큰 기관은 피부다.', a: 'O', why: '온몸을 덮고 있어 가장 커요.', level: 2, grade: 5 },
  { q: '펭귄은 날 수 있다.', a: 'X', why: '펭귄은 날개로 헤엄쳐요. 날지는 못해요.', level: 2, grade: 3 },
  { q: '제주도는 화산이 터져서 만들어졌다.', a: 'O', why: '한라산도 오름도 화산으로 생겼어요.', level: 2, grade: 4 },

  // ── 3단계: 마지막 몇 명을 가른다 ──
  { q: '빛은 소리보다 빠르다.', a: 'O', why: '그래서 번개가 먼저 보이고 천둥이 나중에 들려요.', level: 3, grade: 5 },
  { q: '북극에는 펭귄이 산다.', a: 'X', why: '펭귄은 남극 쪽에 살아요. 북극에는 북극곰이 살고요.', level: 3, grade: 4 },
  { q: '공기는 무게가 없다.', a: 'X', why: '공기도 무게가 있어요. 그래서 기압이 생겨요.', level: 3, grade: 6 },
  { q: '지구는 태양 둘레를 하루에 한 바퀴 돈다.', a: 'X', why: '하루에 한 바퀴 도는 건 스스로 도는 자전이에요. 태양 둘레는 1년에 한 바퀴 돌아요.', level: 3, grade: 6 },
  { q: '세계에서 가장 넓은 바다는 대서양이다.', a: 'X', why: '가장 넓은 바다는 태평양이에요.', level: 3, grade: 5 },
  { q: '심장은 몸 왼쪽에만 붙어 있다.', a: 'X', why: '가운데쯤에 있고 왼쪽으로 조금 치우쳐 있어요.', level: 3, grade: 6 },
  { q: '바닷물이 짠 것은 소금이 녹아 있기 때문이다.', a: 'O', why: '강물이 녹여 온 소금기가 바다에 쌓였어요.', level: 3, grade: 5 },
  { q: '나침반의 N극은 지구의 북극을 가리킨다.', a: 'O', why: '북쪽을 가리켜서 N(North) 이에요.', level: 3, grade: 6 },
  { q: '삼별초는 제주에서 마지막까지 싸웠다.', a: 'O', why: '진도를 거쳐 제주 항파두리에서 마지막까지 싸웠어요.', level: 3, grade: 6 },
];

/**
 * 문제를 뽑는다.
 *
 * **쉬운 것부터 낸다.** 첫 문제에 절반이 나가면 나머지 판이 시시해지고,
 * 끝까지 쉬우면 마지막 한 명이 안 가려진다. 그래서 앞은 1단계, 뒤로 갈수록 3단계.
 *
 * `seed` 로 섞는다 — `Math.random` 을 쓰면 서버가 다시 계산할 때 답이 달라진다.
 * 같은 판에서는 늘 같은 순서가 나와야 한다.
 */
export function pickQuestions(seed: number, count = MAX_ROUNDS, grade?: number): OXQuestion[] {
  const pool = grade
    ? OX_QUESTIONS.filter((q) => Math.abs(q.grade - grade) <= 2)
    : OX_QUESTIONS;
  const usable = pool.length >= 8 ? pool : OX_QUESTIONS;

  const byLevel = ([1, 2, 3] as const).map((lv) => shuffle(usable.filter((q) => q.level === lv), seed + lv));

  const out: OXQuestion[] = [];
  for (let i = 0; i < count; i++) {
    // 앞 1/3 은 1단계, 가운데는 2단계, 뒤는 3단계. 모자라면 아래 단계에서 꾸어 온다
    const want = i < count / 3 ? 0 : i < (count * 2) / 3 ? 1 : 2;
    const q = takeFrom(byLevel, want);
    if (!q) break;
    out.push(q);
  }
  return out;
}

/** 원하는 단계에서 하나 꺼내고, 없으면 옆 단계에서 꺼낸다 */
function takeFrom(byLevel: OXQuestion[][], want: number): OXQuestion | null {
  for (const i of [want, want - 1, want + 1, want - 2, want + 2]) {
    if (i >= 0 && i < byLevel.length && byLevel[i].length) return byLevel[i].shift()!;
  }
  return null;
}

/** 씨앗으로 섞는다 (같은 씨앗 → 같은 차례) */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    // 작은 난수 발생기 하나. 판마다 다르되, 같은 판에서는 늘 같아야 한다.
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 이번 문제로 누가 떨어지나.
 *
 * **답을 안 낸 사람도 떨어진다.** 광장에 서 있으면 어느 쪽이든 밟게 되어 있고,
 * 아무 데도 안 가는 것은 답을 안 낸 것이다. 다만 **이미 떨어진 사람은
 * 다시 안 센다** — 두 번 떨어질 수는 없다.
 */
export function judgeRound(
  alive: string[],
  picks: Record<string, OX | undefined>,
  answer: OX
): { survivors: string[]; eliminated: string[] } {
  const survivors: string[] = [];
  const eliminated: string[] = [];
  for (const uid of alive) {
    if (picks[uid] === answer) survivors.push(uid);
    else eliminated.push(uid);
  }
  return { survivors, eliminated };
}

/**
 * 판이 끝났나, 끝났으면 누가 이겼나.
 *
 * **모두 틀려서 아무도 안 남으면 판을 되돌린다.** 어려운 문제 하나에
 * 전원이 나가면 우승자가 없다 — 그럴 때는 **그 문제를 없던 것으로 하고**
 * 직전에 남아 있던 사람들이 그대로 이긴다. 아무도 못 이기는 놀이는 놀이가 아니다.
 */
export function roundOutcome(
  before: string[],
  survivors: string[],
  round: number,
  totalRounds: number
): { done: boolean; winners: string[]; keep: string[] } {
  if (survivors.length === 0) return { done: true, winners: before, keep: before };
  if (survivors.length === 1) return { done: true, winners: survivors, keep: survivors };
  if (round >= totalRounds) return { done: true, winners: survivors, keep: survivors };
  return { done: false, winners: [], keep: survivors };
}
