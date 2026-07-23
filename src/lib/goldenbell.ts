import { isShortAnswerCorrect, normalizeAnswer } from './quiz-utils.ts';

/**
 * 도전 골든벨 — **판에 답을 써서 든다.**
 *
 * 자리에 앉아 문제를 듣고, 각자 판에 답을 적는다. 시간이 끝나면 다 같이
 * 들어 보이고, 틀린 사람은 자리에서 물러난다. 문제는 뒤로 갈수록 어려워진다.
 *
 * OX 퀴즈와 뼈대가 같다 — **정답은 서버만 쥐고**, 시간이 지나면 규칙이
 * 답 고치기를 막는다. 다른 점은 세 가지다.
 *
 * 1. **객관식과 주관식이 섞인다.** 초등학교 골든벨이 그렇다.
 * 2. **우승이 여러 명일 수 있다.** 마지막 문제까지 살아남은 사람이 여럿이면
 *    다 우승이다 — 한 명을 억지로 가리려고 문제를 더 내지 않는다.
 * 3. **학년을 고를 수 있다.** 3학년과 6학년이 같은 문제를 풀면
 *    3학년은 첫 문제에 다 나간다.
 *
 * ---
 *
 * **손글씨는 안 받는다.**
 *
 * 원래 골든벨은 판에 손으로 쓴다. 이 프로젝트에 손글씨 입력(`DrawingPad`)이
 * 이미 있지만, **손글씨를 채점하려면 글자를 알아보는 기능이 있어야 한다.**
 * 그건 지금 없고, 어설프게 붙이면 맞게 쓴 아이가 틀린 것으로 나온다.
 * 그래서 **객관식은 눌러서, 주관식은 글로 적어** 낸다. 판처럼 보이게는 해뒀다.
 */

export type BellKind = 'choice' | 'short';

export interface BellQuestion {
  q: string;
  kind: BellKind;
  /** 객관식일 때 보기 (4개) */
  choices?: string[];
  /** 객관식이면 보기 번호(0부터), 주관식이면 인정하는 답들 */
  answer: number | string[];
  /** 정답을 열 때 함께 보여주는 한 줄 */
  why: string;
  /** 1(쉬움) ~ 5(어려움) */
  level: 1 | 2 | 3 | 4 | 5;
  grade: number;
}

/** 자리 수 — 이보다 많으면 화면에도 안 들어가고 진행도 안 된다 */
export const MAX_SEATS = 30;
/** 객관식에 주는 시간 */
export const CHOICE_MS = 20_000;
/** 주관식에 주는 시간 — 글로 적어야 하니 더 준다 */
export const SHORT_MS = 30_000;
/** 시간이 끝나고 정답을 열기까지 */
export const REVEAL_MS = 3_000;
/** 정답을 보고 다음 문제로 */
export const NEXT_MS = 5_000;
/** 한 판에 낼 문제 수 */
export const TOTAL_ROUNDS = 15;

export const timeFor = (kind: BellKind) => (kind === 'short' ? SHORT_MS : CHOICE_MS);

/**
 * 문제 은행.
 *
 * OX 와 같은 선을 지킨다 — **자료에 따라 갈리는 것은 안 낸다**(국보 몇 호,
 * 성의 둘레 같은 것). 아이를 갈라놓는 것도 안 낸다.
 * 주관식은 **답이 하나로 떨어지는 것만** 낸다. '가장 아름다운 산' 같은 건
 * 채점이 안 된다.
 */
export const BELL_QUESTIONS: BellQuestion[] = [
  // ── 1단계 ──
  { q: '일주일은 며칠일까요?', kind: 'short', answer: ['7', '7일', '칠일'], why: '월화수목금토일, 7일이에요.', level: 1, grade: 1 },
  { q: '무지개 색은 모두 몇 가지로 볼까요?', kind: 'choice', choices: ['5가지', '6가지', '7가지', '8가지'], answer: 2, why: '빨주노초파남보, 일곱 가지예요.', level: 1, grade: 2 },
  { q: '우리나라의 수도는 어디일까요?', kind: 'short', answer: ['서울', '서울특별시'], why: '우리나라의 수도는 서울이에요.', level: 1, grade: 3 },
  { q: '곤충의 다리는 몇 개일까요?', kind: 'choice', choices: ['4개', '6개', '8개', '10개'], answer: 1, why: '곤충은 다리가 6개예요. 거미는 8개라 곤충이 아니고요.', level: 1, grade: 3 },
  { q: '한글을 만든 임금님은 누구일까요?', kind: 'short', answer: ['세종대왕', '세종', '세종 대왕'], why: '세종대왕이 훈민정음을 만들었어요.', level: 1, grade: 3 },
  { q: '1년은 몇 달일까요?', kind: 'choice', choices: ['10달', '11달', '12달', '13달'], answer: 2, why: '1월부터 12월까지 열두 달이에요.', level: 1, grade: 1 },

  // ── 2단계 ──
  { q: '우리나라에서 가장 높은 산은?', kind: 'short', answer: ['한라산'], why: '한라산이 1,947m 로 가장 높아요.', level: 2, grade: 4 },
  { q: '물이 끓기 시작하는 온도는?', kind: 'choice', choices: ['50도', '80도', '100도', '120도'], answer: 2, why: '1기압에서 물은 100도에 끓어요.', level: 2, grade: 4 },
  { q: '위험한 일이 생겼을 때 거는 전화번호는?', kind: 'short', answer: ['112'], why: '위험한 일은 112, 불이 나면 119 예요.', level: 2, grade: 2 },
  { q: '태양계에서 태양과 가장 가까운 행성은?', kind: 'choice', choices: ['수성', '금성', '지구', '화성'], answer: 0, why: '수성이 태양과 가장 가까워요.', level: 2, grade: 5 },
  { q: '삼각형의 세 각을 모두 더하면 몇 도일까요?', kind: 'short', answer: ['180', '180도'], why: '어떤 삼각형이든 세 각의 합은 180도예요.', level: 2, grade: 4 },
  { q: '식물이 햇빛을 받아 스스로 양분을 만드는 것을 무엇이라 할까요?', kind: 'short', answer: ['광합성'], why: '잎에서 햇빛을 받아 양분을 만드는 것을 광합성이라고 해요.', level: 2, grade: 5 },
  { q: '제주도에서 가장 큰 산은?', kind: 'choice', choices: ['한라산', '성산일출봉', '산방산', '오름'], answer: 0, why: '한라산이 제주도 한가운데 있어요.', level: 2, grade: 3 },

  // ── 3단계 ──
  { q: '우리 몸에서 피를 온몸으로 보내는 기관은?', kind: 'short', answer: ['심장'], why: '심장이 펌프처럼 피를 밀어내요.', level: 3, grade: 5 },
  { q: '지구가 스스로 한 바퀴 도는 것을 무엇이라 할까요?', kind: 'choice', choices: ['공전', '위성', '중력', '자전'], answer: 3, why: '스스로 도는 것은 자전, 태양 둘레를 도는 것은 공전이에요.', level: 3, grade: 6 },
  { q: '조선을 세운 임금님은 누구일까요?', kind: 'short', answer: ['이성계', '태조', '태조 이성계', '조선 태조'], why: '이성계가 1392년에 조선을 세웠어요.', level: 3, grade: 5 },
  { q: '세계에서 가장 넓은 바다는?', kind: 'choice', choices: ['대서양', '인도양', '북극해', '태평양'], answer: 3, why: '태평양이 가장 넓어요.', level: 3, grade: 5 },
  { q: '소금물에서 물만 날려 소금을 얻는 방법을 무엇이라 할까요?', kind: 'short', answer: ['증발', '증발법'], why: '물을 증발시키면 소금만 남아요.', level: 3, grade: 5 },
  { q: '우리나라 국회의원을 뽑는 나이는 만 몇 세부터일까요?', kind: 'choice', choices: ['만 16세', '만 17세', '만 18세', '만 20세'], answer: 2, why: '만 18세부터 투표할 수 있어요.', level: 3, grade: 6 },
  { q: '빛이 물이나 유리를 지날 때 꺾이는 것을 무엇이라 할까요?', kind: 'short', answer: ['굴절', '빛의 굴절'], why: '물속의 젓가락이 꺾여 보이는 것이 굴절이에요.', level: 3, grade: 6 },

  // ── 4단계 ──
  { q: '고려를 세운 사람은 누구일까요?', kind: 'short', answer: ['왕건', '태조 왕건'], why: '왕건이 918년에 고려를 세웠어요.', level: 4, grade: 6 },
  { q: '거북선을 만들어 왜군을 물리친 장군은?', kind: 'short', answer: ['이순신', '이순신 장군', '충무공 이순신', '충무공'], why: '이순신 장군이 거북선으로 바다를 지켰어요.', level: 4, grade: 5 },
  { q: '물질이 액체에서 기체로 변하는 것을 무엇이라 할까요?', kind: 'choice', choices: ['응결', '융해', '승화', '기화'], answer: 3, why: '액체 → 기체는 기화예요. 반대는 응결이고요.', level: 4, grade: 6 },
  { q: '삼별초가 제주에서 마지막까지 싸운 곳의 이름은? (○○○ 항파두리)', kind: 'short', answer: ['항파두리', '항파두리성', '항파두성'], why: '제주 항파두리에서 마지막까지 싸웠어요.', level: 4, grade: 6 },
  { q: '1초에 소리가 공기 중에서 나아가는 거리는 대략?', kind: 'choice', choices: ['약 34m', '약 340m', '약 3,400m', '약 34,000m'], answer: 1, why: '소리는 공기 중에서 1초에 약 340m 나아가요.', level: 4, grade: 6 },
  { q: '우리나라 최초의 한글 소설로 알려진 작품은?', kind: 'choice', choices: ['홍길동전', '춘향전', '심청전', '흥부전'], answer: 0, why: '허균이 쓴 홍길동전이 최초의 한글 소설로 알려져 있어요.', level: 4, grade: 6 },
  { q: '지도에서 높이가 같은 곳을 이은 선을 무엇이라 할까요?', kind: 'short', answer: ['등고선'], why: '같은 높이를 이은 선이 등고선이에요.', level: 4, grade: 5 },

  // ── 5단계 ──
  { q: '훈민정음을 만든 해는 몇 년일까요?', kind: 'choice', choices: ['1392년', '1443년', '1592년', '1897년'], answer: 1, why: '1443년에 만들고 1446년에 널리 알렸어요.', level: 5, grade: 6 },
  { q: '식물의 뿌리가 물을 빨아올려 잎에서 내보내는 것을 무엇이라 할까요?', kind: 'short', answer: ['증산작용', '증산', '증산 작용'], why: '잎의 기공으로 물이 빠져나가는 것을 증산작용이라고 해요.', level: 5, grade: 6 },
  { q: '임진왜란이 일어난 해는?', kind: 'choice', choices: ['1392년', '1443년', '1592년', '1636년'], answer: 2, why: '1592년, 임진년에 일어나서 임진왜란이에요.', level: 5, grade: 6 },
  { q: '물에 녹아 있는 물질을 무엇이라 할까요? (소금물에서 소금)', kind: 'short', answer: ['용질'], why: '녹는 것이 용질, 녹이는 것이 용매예요.', level: 5, grade: 6 },
  { q: '태양계 행성 중 가장 큰 행성은?', kind: 'choice', choices: ['지구', '토성', '해왕성', '목성'], answer: 3, why: '목성이 가장 커요.', level: 5, grade: 6 },
  { q: '제주도가 만들어진 원인이 된 자연 현상은?', kind: 'short', answer: ['화산', '화산활동', '화산 활동', '화산폭발', '화산 폭발'], why: '화산 활동으로 한라산과 오름이 생겼어요.', level: 5, grade: 5 },
];

/**
 * 채점.
 *
 * **주관식은 너그럽게 본다.** 공백·문장부호·전각 숫자로 아는 아이를
 * 틀렸다고 하면 안 된다(`quiz-utils` 의 규칙을 그대로 쓴다 —
 * 서버와 화면이 같은 규칙을 써야 하므로 거기 한 벌만 둔다).
 *
 * 아무것도 안 낸 것은 틀린 것이다. 골든벨은 판을 들어야 하는 놀이다.
 */
export function isCorrect(q: BellQuestion, given: unknown): boolean {
  if (q.kind === 'choice') {
    return typeof given === 'number' && given === q.answer;
  }
  if (typeof given !== 'string' || !normalizeAnswer(given)) return false;
  return isShortAnswerCorrect(given, Array.isArray(q.answer) ? q.answer : []);
}

/** 정답을 사람이 읽는 말로 (정답을 열 때 보여준다) */
export function answerText(q: BellQuestion): string {
  if (q.kind === 'choice') {
    const i = typeof q.answer === 'number' ? q.answer : 0;
    return `${i + 1}번 ${q.choices?.[i] ?? ''}`;
  }
  return Array.isArray(q.answer) ? q.answer[0] : String(q.answer);
}

/**
 * 문제를 뽑는다.
 *
 * **쉬운 것부터, 뒤로 갈수록 어렵게.** 골든벨이 재미있는 이유가 이것이다 —
 * 처음엔 다 같이 맞히다가 뒤로 갈수록 하나둘 자리에서 물러난다.
 *
 * **객관식과 주관식을 섞는다.** 객관식만 내면 찍어서 살아남고,
 * 주관식만 내면 3학년은 첫 문제부터 못 쓴다.
 * 그래서 **앞은 객관식을 많이, 뒤로 갈수록 주관식**을 섞는다.
 */
export function pickBellQuestions(
  seed: number,
  count = TOTAL_ROUNDS,
  grade?: number
): BellQuestion[] {
  const pool = grade
    ? BELL_QUESTIONS.filter((q) => Math.abs(q.grade - grade) <= 2)
    : BELL_QUESTIONS;
  const usable = pool.length >= count ? pool : BELL_QUESTIONS;

  // 단계별로 나눠 섞어둔다
  const byLevel = ([1, 2, 3, 4, 5] as const).map((lv) =>
    shuffle(usable.filter((q) => q.level === lv), seed + lv * 31)
  );

  const out: BellQuestion[] = [];
  for (let i = 0; i < count; i++) {
    // 15문제라면 1~3번은 1단계, 4~6번은 2단계 … 로 올라간다
    const want = Math.min(4, Math.floor((i * 5) / count));
    const q = takeFrom(byLevel, want);
    if (!q) break;
    out.push(q);
  }
  return out;
}

function takeFrom(byLevel: BellQuestion[][], want: number): BellQuestion | null {
  for (const i of [want, want - 1, want + 1, want - 2, want + 2, want - 3, want + 3, want - 4, want + 4]) {
    if (i >= 0 && i < byLevel.length && byLevel[i].length) return byLevel[i].shift()!;
  }
  return null;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 이번 문제로 누가 남나.
 *
 * **끝까지 살아남은 사람이 여럿이면 다 우승이다.**
 * 한 명을 억지로 가리려고 문제를 더 내지 않는다 — 골든벨은 원래
 * 마지막 문제를 맞히면 다 같이 울리는 종이다.
 */
export function bellOutcome(
  before: string[],
  survivors: string[],
  round: number,
  totalRounds: number
): { done: boolean; winners: string[]; keep: string[] } {
  // 모두 틀리면 그 문제를 없던 것으로 하고 직전 사람들이 이긴다 (OX 와 같다)
  if (survivors.length === 0) return { done: true, winners: before, keep: before };
  if (round >= totalRounds) return { done: true, winners: survivors, keep: survivors };
  return { done: false, winners: [], keep: survivors };
}
