/**
 * 타자 — **한글 타수 세는 법**과 낱말·문장.
 *
 * 타자 게임에서 제일 먼저 정해야 하는 것이 '한 글자를 몇 타로 치나' 다.
 * 한글은 낱자를 모아 쓰므로 **글자 수와 타수가 다르다** — '값' 은 한 글자지만
 * ㄱ+ㅏ+ㅂ+ㅅ 네 타다. 글자 수로 세면 한글을 치는 아이가 손해를 본다.
 *
 * 그래서 한컴타자연습이 하는 대로 **자모 수**로 센다.
 * - 겹모음은 풀어 센다: ㅘ = ㅗ+ㅏ = 2타
 * - 겹받침도 풀어 센다: ㄳ = ㄱ+ㅅ = 2타
 * - **쌍자음은 1타로 센다**(ㄲ·ㅆ …). 자판에서는 시프트를 같이 누르지만,
 *   시프트까지 세면 대문자를 치는 영문과 견주기 어려워진다. 한 곳에서만
 *   정하면 되는 문제라 **덜 후한 쪽이 아니라 덜 헷갈리는 쪽**을 골랐다.
 * - 한글이 아닌 글자(영문·숫자·기호·띄어쓰기)는 1타.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 겹모음을 낱자로. 없는 것은 그대로 1타. */
const VOWEL_PARTS: Record<number, number> = {
  // ㅘ ㅙ ㅚ
  9: 2, 10: 3, 11: 2,
  // ㅝ ㅞ ㅟ
  14: 2, 15: 3, 16: 2,
  // ㅢ
  19: 2,
};

/** 겹받침을 낱자로. 인덱스는 종성 순서. */
const FINAL_PARTS: Record<number, number> = {
  // ㄳ, ㄵ, ㄶ
  3: 2, 5: 2, 6: 2,
  // ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ
  9: 2, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2,
  // ㅄ
  18: 2,
};

/** 글자 하나가 몇 타인가 */
function strokesOfChar(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return 1;

  const idx = code - HANGUL_BASE;
  const final = idx % 28;
  const vowel = Math.floor(idx / 28) % 21;

  // 초성 1 + 중성(겹모음이면 2~3) + 종성(있으면 1~2)
  return 1 + (VOWEL_PARTS[vowel] ?? 1) + (final === 0 ? 0 : FINAL_PARTS[final] ?? 1);
}

/**
 * 이 글이 몇 타인가.
 *
 * **순수 계산이다.** 점수와 랭킹이 여기에 달려 있으므로 화면과 서버가
 * 반드시 같은 함수를 써야 한다 — 두 벌이면 아이가 본 타수와 남는 기록이 달라진다.
 */
export function countStrokes(text: string): number {
  let n = 0;
  for (const ch of text) n += strokesOfChar(ch);
  return n;
}

/** 분당 타수 (CPM). 0초로 나누지 않는다. */
export function strokesPerMinute(strokes: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round((strokes / (ms / 60000)));
}

/**
 * 난이도 1~5.
 *
 * **아이가 고르는 숫자 하나로 세 가지가 같이 바뀐다.** 속도만 올리면
 * 금세 못 따라가고, 개수만 늘리면 화면이 어지럽다.
 * 1은 두 글자 낱말이 천천히 하나씩, 5는 긴 낱말이 여럿 빠르게 떨어진다.
 */
export interface RainLevel {
  level: number;
  label: string;
  /** 떨어지는 데 걸리는 시간(ms). 짧을수록 빠르다. */
  fallMs: number;
  /** 한 번에 화면에 있을 수 있는 낱말 수 */
  maxOnScreen: number;
  /** 새 낱말이 나오는 사이 (ms) */
  spawnMs: number;
  /** 이 난이도에서 쓰는 낱말 길이 */
  minLen: number;
  maxLen: number;
}

export const RAIN_LEVELS: RainLevel[] = [
  { level: 1, label: '1단계', fallMs: 11000, maxOnScreen: 2, spawnMs: 2600, minLen: 2, maxLen: 2 },
  { level: 2, label: '2단계', fallMs: 9500, maxOnScreen: 3, spawnMs: 2200, minLen: 2, maxLen: 3 },
  { level: 3, label: '3단계', fallMs: 8000, maxOnScreen: 4, spawnMs: 1800, minLen: 3, maxLen: 4 },
  { level: 4, label: '4단계', fallMs: 6800, maxOnScreen: 5, spawnMs: 1500, minLen: 3, maxLen: 5 },
  { level: 5, label: '5단계', fallMs: 5600, maxOnScreen: 6, spawnMs: 1200, minLen: 4, maxLen: 6 },
];

export const rainLevel = (n: unknown): RainLevel =>
  RAIN_LEVELS.find((l) => l.level === Number(n)) ?? RAIN_LEVELS[2];

/**
 * 떨어지는 낱말들.
 *
 * **아이가 아는 말만 쓴다.** 제주와 학교에서 쓰는 말을 골랐다 —
 * 모르는 낱말이 떨어지면 타자가 아니라 받아쓰기가 된다.
 */
export const RAIN_WORDS: string[] = [
  // 2글자
  '학교', '친구', '연필', '가방', '운동', '노래', '그림', '바다', '한라', '제주',
  '감귤', '돌담', '유채', '바람', '구름', '무지', '나무', '지우', '책상', '의자',
  '교실', '급식', '체육', '미술', '음악', '국어', '수학', '과학', '사회', '영어',
  // 3글자
  '운동장', '도서관', '선생님', '색연필', '한라산', '해녀들', '오름길', '돌하르',
  '자전거', '축구공', '피아노', '공책들', '실내화', '급식실', '보건실', '교무실',
  '방학날', '소풍날', '운동회', '학예회',
  // 4글자
  '제주바다', '감귤나무', '유채꽃밭', '돌하르방', '한라산길', '바닷바람',
  '친구사랑', '독서시간', '체육시간', '점심시간', '가을소풍', '겨울방학',
  // 5~6글자
  '우리반친구', '아침조회시간', '즐거운학교', '푸른제주바다', '따뜻한교실',
  '재미있는수업',
];

/**
 * 단문 연습 문장.
 *
 * 산성비는 낱말을 '맞히는' 놀이라 손가락 자리를 익히기 어렵다.
 * 문장을 처음부터 끝까지 치면 **끊지 않고 이어 치는 연습**이 된다.
 */
export const PRACTICE_LINES: string[] = [
  '한라산에 눈이 내리면 제주는 하얗게 변합니다.',
  '우리 반 친구들과 함께 운동장을 달렸습니다.',
  '도서관에서 빌린 책을 다 읽고 돌려주었어요.',
  '감귤 나무에 노란 열매가 주렁주렁 달렸습니다.',
  '바닷바람이 불어와 유채꽃이 흔들립니다.',
  '오늘 급식은 정말 맛있었고 국물도 따뜻했어요.',
  '선생님께서 내주신 숙제를 모두 마쳤습니다.',
  '해녀 할머니는 바다에서 소라를 캐 오셨어요.',
  '친구와 손을 잡고 천천히 오름을 올랐습니다.',
  '내일은 우리 학교 운동회가 열리는 날입니다.',
];

/**
 * 난이도에 맞는 낱말을 고른다.
 *
 * 조건에 맞는 것이 없으면 **빈손으로 돌려주지 않는다** — 놀이가 멈춘다.
 * 길이 조건을 넓혀서라도 하나는 준다.
 */
export function pickWord(level: RainLevel, rand: () => number = Math.random): string {
  const fit = RAIN_WORDS.filter((w) => w.length >= level.minLen && w.length <= level.maxLen);
  const pool = fit.length > 0 ? fit : RAIN_WORDS;
  return pool[Math.floor(rand() * pool.length)] ?? RAIN_WORDS[0];
}
