import type { PetKind } from './firestore-schema';

/**
 * 학교 동물의 기분 계산.
 *
 * 배고픔·목마름을 숫자로 저장하지 않고 **마지막으로 챙겨준 시각**만 두는 이유:
 * 수치를 저장하면 시간마다 깎아줄 서버가 필요한데 그건 학교 수만큼 도는 배치다.
 * 시각 하나면 아무도 안 볼 때도 알아서 배가 고파진다.
 */

/** 몇 시간이 지나면 완전히 배고픈가 */
const HUNGRY_HOURS = 8;
const THIRSTY_HOURS = 6;
const LONELY_HOURS = 4;

export const PET_KINDS: { kind: PetKind; label: string; emoji: string }[] = [
  { kind: 'dog', label: '강아지', emoji: '🐶' },
  { kind: 'cat', label: '고양이', emoji: '🐱' },
  { kind: 'rabbit', label: '토끼', emoji: '🐰' },
];

/** 0(방금 챙겨줌) ~ 1(오래됨) */
function elapsed(at: Date | null, hours: number, now: number): number {
  if (!at) return 1;
  const h = (now - at.getTime()) / 3600000;
  return Math.max(0, Math.min(1, h / hours));
}

export interface PetMood {
  /** 0~1, 클수록 배고픔 */
  hunger: number;
  thirst: number;
  lonely: number;
  /** 셋 중 가장 급한 것 */
  need: 'food' | 'water' | 'pet' | 'none';
  /** 0~100, 클수록 행복 */
  happiness: number;
  emoji: string;
}

export function petMood(
  fedAt: Date | null,
  wateredAt: Date | null,
  pettedAt: Date | null,
  now = Date.now()
): PetMood {
  const hunger = elapsed(fedAt, HUNGRY_HOURS, now);
  const thirst = elapsed(wateredAt, THIRSTY_HOURS, now);
  const lonely = elapsed(pettedAt, LONELY_HOURS, now);

  // 가장 급한 것 하나만 말한다. 셋을 한꺼번에 조르면 아이가 뭘 해야 할지 모른다.
  const worst = Math.max(hunger, thirst, lonely);
  const need =
    worst < 0.5 ? 'none'
      : hunger === worst ? 'food'
        : thirst === worst ? 'water'
          : 'pet';

  const happiness = Math.round((1 - (hunger + thirst + lonely) / 3) * 100);
  const emoji = happiness > 70 ? '😊' : happiness > 40 ? '🙂' : happiness > 20 ? '😟' : '😢';

  return { hunger, thirst, lonely, need, happiness, emoji };
}

/**
 * 동물이 하는 말.
 *
 * AI 를 부르지 않는다. 한 반 25명이 쉬는 시간마다 말을 걸면 그게 다 요금이고,
 * 아이가 하는 말을 그대로 모델에 보내는 것도 내키지 않는다.
 * 상태에 맞는 말을 골라 주는 것만으로도 아이는 충분히 반응을 느낀다.
 */
const LINES: Record<PetMood['need'], string[]> = {
  food: ['배가 고파요... 밥 주세요!', '꼬르륵... 뭐 먹을 거 없나요?', '오늘 아직 아무것도 못 먹었어요'],
  water: ['목말라요! 물 좀 주세요', '물그릇이 비었어요...', '컥컥, 물 한 모금만요'],
  pet: ['심심해요. 놀아주세요!', '오늘 아무도 안 만져줬어요...', '여기 있어요! 저 좀 봐주세요'],
  none: [
    '오늘 기분이 아주 좋아요!',
    '학교에서 제일 행복한 건 저예요',
    '같이 있어줘서 고마워요',
    '오늘 급식 맛있었어요?',
    '운동장 한 바퀴 뛰고 왔어요!',
  ],
};

/** 같은 말만 반복하지 않도록 인덱스를 돌려가며 고른다 */
export function petLine(need: PetMood['need'], turn: number): string {
  const list = LINES[need];
  return list[turn % list.length];
}

export const CARE_LABEL = {
  food: { emoji: '🍚', label: '먹이 주기', done: '맛있게 먹었어요!' },
  water: { emoji: '💧', label: '물 주기', done: '시원해요!' },
  pet: { emoji: '🤚', label: '쓰다듬기', done: '기분이 좋아요~' },
} as const;
