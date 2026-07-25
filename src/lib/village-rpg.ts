/**
 * 우리 마을 조사대 — **심부름 표.**
 *
 * 아이는 마을 조사대의 견습 조사원이다. 사람을 만나 심부름을 받고,
 * 기관에 들어가 이야기를 듣고, 유적을 찾아가 조사하고, 돌아와서 알린다.
 *
 * 설계를 왜 이렇게 했는지는 `docs/village-rpg.md` 에 적어두었다.
 * 여기는 **표**다 — 한 줄 더 쓰면 심부름이 하나 는다. 화면은 안 건드려도 된다.
 *
 * ---
 *
 * **왜 심부름인가.**
 *
 * 읽으라고 두면 안 읽는다. 누가 시켜야 간다. 그리고 **갔다가 돌아와야** 한다 —
 * 갔다 온 이야기를 누군가에게 해야 그게 자기 것이 된다.
 * 벽에 붙인 안내문과, "애월진성에 가서 읽어보고 와 줄래요?" 는 아이가 하는 일이 다르다.
 *
 * ---
 *
 * **기록은 아이 문서에 남는다**(`users/{uid}/quests/{key}`).
 *
 * 열쇠는 세 가지다:
 * - `site-{siteId}`   그 곳을 조사했다
 * - `place-{kind}`    그 기관 이야기를 다 들었다
 * - `quest-{questId}` 그 심부름을 마치고 **알리기까지** 했다
 *
 * **다녀온 것과 알린 것을 따로 적는다.** 한 칸으로 두면 다녀오자마자 끝나서
 * 돌아갈 이유가 사라진다 — RPG 는 돌아가는 길이 반이다.
 */

/** 심부름이 끝났는지 재는 잣대 */
export type Condition =
  /** 그 곳을 조사했나 */
  | { kind: 'site'; siteId: string }
  /** 그 기관 이야기를 끝까지 들었나 */
  | { kind: 'guide'; placeKind: string }
  /** 앞 심부름을 마쳤나 — 이걸로 이야기가 이어진다 */
  | { kind: 'quest'; questId: string };

/** 심부름이 지금 어떤 상태인가 */
export type QuestState =
  /** 아직 뜨지 않았다 (앞 심부름을 안 했다) */
  | 'locked'
  /** 받을 수 있다 / 하는 중이다 */
  | 'todo'
  /** 다 해왔다 — 가서 알리면 된다 */
  | 'ready'
  /** 끝났다 */
  | 'done';

export interface Quest {
  id: string;
  /** 어느 이야기(에피소드)에 속하나 */
  chapter: string;
  /** 그 이야기 안에서 몇 번째인가 */
  order: number;
  /** 누가 주나 — 기관 종류와 그 기관 `people` 의 몇 번째 */
  giver: { placeKind: string; at: number };
  title: string;
  /** 시키는 말 */
  ask: string;
  /** 마치고 돌아왔을 때 해주는 말 */
  reward: string;
  /** 무엇을 해야 끝나나. `quiz` 가 있으면 그것도 맞혀야 한다. */
  need: Condition[];
  /** 언제 뜨나. 없으면 처음부터 뜬다. */
  unlock?: Condition[];
  /**
   * **묻고 가는 심부름.**
   * 다녀오는 것만이 심부름은 아니다. 아는지 물어보는 것도 심부름이다 —
   * 특히 '이사 오면 어디부터 가야 하나' 같은 건 갈 곳이 아니라 알 것이다.
   */
  quiz?: { q: string; choices: string[]; correct: number; why: string }[];
  /** 마치면 받는 뱃지 */
  badge?: { emoji: string; label: string };
  /** 이 학년쯤부터 */
  minGrade?: number;
}

export interface Chapter {
  id: string;
  title: string;
  emoji: string;
  /** 무슨 이야기인가 한 줄로 */
  blurb: string;
  /** 조사 수첩에서 어느 칸인가 */
  axis: 'today' | 'time' | 'life' | 'nature';
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'today-round',
    title: '우리 동네 살림',
    emoji: '🏛️',
    axis: 'today',
    blurb: '우리 동네를 돌보는 곳들을 한 바퀴 돌아봐요.',
  },
  {
    id: 'time-travel',
    title: '우리 학교는 성이었다',
    emoji: '🏯',
    axis: 'time',
    blurb: '운동장 밑에 있던 옛날을 거슬러 올라가요.',
  },
  {
    id: 'because-jeju',
    title: '제주라서 그렇다',
    emoji: '🧱',
    axis: 'life',
    blurb: '돌·바람·물. 우리 고장 살림에는 다 까닭이 있어요.',
  },
  {
    id: 'forest-oreum',
    title: '숲과 오름',
    emoji: '🌳',
    axis: 'nature',
    blurb: '우리 읍의 숲과 오름을 찾아가요.',
  },
  {
    id: 'new-friend',
    title: '이사 온 친구',
    emoji: '🤝',
    axis: 'today',
    blurb: '전학 온 친구가 자리를 잡을 때까지 도와줘요.',
  },
  {
    id: 'sea-town',
    title: '바다가 부르는 마을',
    emoji: '🌊',
    axis: 'life',
    blurb: '곽지와 한담 — 바닷가 마을은 무엇으로 살아갈까요?',
  },
];

/**
 * 심부름들.
 *
 * **한 이야기가 여러 기관을 거친다.** 기관을 하나씩 떼어 설명하면
 * 외울 것이 다섯 개지만, 한 사건으로 꿰면 이야기가 하나다.
 */
export const QUESTS: Quest[] = [
  // ── 「우리 동네 살림」 — 기관 한 바퀴 ────────────────────
  {
    id: 'round-post',
    chapter: 'today-round',
    order: 1,
    giver: { placeKind: 'townhall', at: 0 },
    title: '우체국은 무슨 일을 할까요?',
    // 읍사무소 이야기를 다 들은 뒤에 뜬다 — 여기가 이야기의 출발점이다
    unlock: [{ kind: 'guide', placeKind: 'townhall' }],
    ask:
      '우리 동네를 돌보는 곳이 읍사무소만은 아니에요.\n\n'
      + '**우체국**에 가서 무슨 일을 하는 곳인지 듣고 와 줄래요?\n'
      + '창구에 계신 분이 잘 알려 주실 거예요.',
    need: [{ kind: 'guide', placeKind: 'post_office' }],
    reward:
      '벌써 다녀왔군요!\n\n'
      + '편지 한 통이 제주에서 서울까지 가는 데 여러 사람 손을 거쳐요.\n'
      + '**우리 동네는 그렇게 여러 곳이 나눠서 돌보고 있어요.**',
    badge: { emoji: '📮', label: '우체국 조사' },
  },
  {
    id: 'round-police',
    chapter: 'today-round',
    order: 2,
    giver: { placeKind: 'post_office', at: 1 },
    title: '경찰서에도 가 보세요',
    unlock: [{ kind: 'quest', questId: 'round-post' }],
    ask:
      '우리는 편지를 나르지만, **지켜 주는 일**은 또 다른 곳이 해요.\n\n'
      + '**경찰서(지구대)** 에 가서 무슨 일을 하는지 듣고 오세요.\n'
      + '112 가 왜 있는지도 물어보고요.',
    need: [{ kind: 'guide', placeKind: 'police' }],
    reward:
      '잘 다녀왔어요!\n\n'
      + '**위험하면 112, 불이 나면 119.** 이건 꼭 외워 두세요.\n'
      + '외우는 게 아니라 **몸이 기억해야** 하는 번호예요.',
    badge: { emoji: '🚓', label: '경찰서 조사' },
  },
  {
    id: 'round-library',
    chapter: 'today-round',
    order: 3,
    giver: { placeKind: 'police', at: 0 },
    title: '도서관도 우리 동네 것이에요',
    unlock: [{ kind: 'quest', questId: 'round-police' }],
    ask:
      '순찰을 돌다 보면 **도서관**에 아이들이 많아요.\n\n'
      + '거기도 우리 모두의 것이에요. 가서 어떤 일을 하는지 듣고 오세요.',
    need: [{ kind: 'guide', placeKind: 'library' }],
    reward:
      '도서관은 **책을 나눠 읽는 곳**이에요.\n'
      + '내 것이 아니라 **우리 것**이라, 빌린 날짜를 지켜야 다음 사람이 읽어요.',
    badge: { emoji: '📚', label: '도서관 조사' },
  },
  {
    id: 'round-done',
    chapter: 'today-round',
    order: 4,
    giver: { placeKind: 'townhall', at: 0 },
    title: '동네를 한 바퀴 돌았어요',
    unlock: [{ kind: 'quest', questId: 'round-library' }],
    ask:
      '읍사무소, 우체국, 경찰서, 도서관.\n\n'
      + '네 곳을 다 돌아봤으면 마지막으로 하나만 물을게요.',
    quiz: [
      {
        q: '이사를 왔을 때 가장 먼저 가야 하는 곳은 어디일까요?',
        choices: ['우체국', '읍사무소(주민센터)', '경찰서', '도서관'],
        correct: 1,
        why: '읍사무소에 **전입신고**를 해야 우리 동네 사람으로 적혀요. 그래야 학교도 다니고 도움도 받아요.',
      },
      {
        q: '위험한 일이 생겼을 때 바로 전화해야 하는 번호는?',
        choices: ['110', '112', '114', '119'],
        correct: 1,
        why: '**112**는 경찰, **119**는 소방이에요. 위험하면 112, 불이 나면 119 — 꼭 외워 두세요.',
      },
      {
        q: '도서관에서 빌린 책을 날짜에 맞춰 돌려줘야 하는 까닭은?',
        choices: ['늦으면 벌금을 내야 해서', '다음 사람이 기다리고 있으니까', '책이 낡아지니까', '도서관이 문을 닫으니까'],
        correct: 1,
        why: '도서관 책은 **우리 모두의 것**이에요. 빌린 날짜를 지켜야 **다음 사람**이 읽을 수 있어요.',
      },
    ],
    need: [
      { kind: 'quest', questId: 'round-post' },
      { kind: 'quest', questId: 'round-police' },
      { kind: 'quest', questId: 'round-library' },
    ],
    reward:
      '훌륭해요! 이제 우리 동네 살림을 아는 사람이 되었어요.\n\n'
      + '**동네 살림 조사원** 자격을 드릴게요.',
    badge: { emoji: '🏛️', label: '동네 살림 조사원' },
  },

  // ── 「우리 학교는 성이었다」 — 시간을 거슬러 ─────────────
  {
    id: 'time-jinseong',
    chapter: 'time-travel',
    order: 1,
    giver: { placeKind: 'townhall', at: 2 },
    title: '우리 마을 유적을 알아봐 주세요',
    ask:
      '마침 잘 왔어요! 우리 마을 자랑거리를 정리하는 중인데 일손이 모자라요.\n\n'
      + '**애월진성**이라고, 여러분 학교가 서 있는 그 자리예요.\n'
      + '가서 어떤 곳이었는지 읽어 보고, **영상도 끝까지 보고** 와 줄래요?',
    need: [{ kind: 'site', siteId: 'aewol-jinseong' }],
    reward:
      '벌써 다녀왔어요? 고마워요!\n\n'
      + '여러분이 날마다 뛰노는 그 운동장이 옛날에는 **바다를 지키던 성**이었다니,\n'
      + '이제 우리 마을을 조금 더 알게 됐죠?',
    badge: { emoji: '🏯', label: '애월진성 조사' },
  },
  {
    id: 'time-hangpaduri',
    chapter: 'time-travel',
    order: 2,
    giver: { placeKind: 'townhall', at: 2 },
    title: '그 전에는 누가 있었을까요?',
    unlock: [{ kind: 'quest', questId: 'time-jinseong' }],
    ask:
      '애월진성은 조선 때 쌓은 거예요. 그럼 **그 전에는** 아무도 없었을까요?\n\n'
      + '우리 읍 안쪽, 남동쪽으로 4km 쯤 가면 **항파두리**가 있어요.\n'
      + '고려 때 이야기예요. 다녀와서 애월진성과 무엇이 다른지 알려 주세요.',
    need: [{ kind: 'site', siteId: 'hangpaduri' }],
    reward:
      '흙으로 쌓은 성과 돌로 쌓은 성, 삼백 년 차이.\n\n'
      + '**같은 읍 안에 두 시대의 성이 있는 셈이에요.**\n'
      + '땅은 그대로인데 그 위에 사는 사람이 바뀌어 온 거예요.',
    badge: { emoji: '🏇', label: '항파두리 조사' },
  },
  {
    id: 'time-oldest',
    chapter: 'time-travel',
    order: 3,
    giver: { placeKind: 'library', at: 0 },
    title: '더 옛날로 가 볼래요?',
    unlock: [{ kind: 'quest', questId: 'time-hangpaduri' }],
    ask:
      '고려까지 가 봤다면서요? 그럼 **더 옛날**도 있어요.\n\n'
      + '**곽지패총** — 조개껍데기가 이천 년 쌓인 곳,\n'
      + '**빌레못동굴** — 곰이 살던 곳.\n\n'
      + '두 곳 다 알아보고 오세요. 하나는 못 들어가니 읽기만 하고요.',
    need: [
      { kind: 'site', siteId: 'gwakji-shell' },
      { kind: 'site', siteId: 'billemot' },
    ],
    reward:
      '동굴에서 나온 **곰 뼈** 하나가, 제주가 육지와 이어져 있던 때를 알려 줘요.\n\n'
      + '조개껍데기 한 무더기가 이천 년을 알려 주고요.\n'
      + '**작은 것이 큰 이야기를 해요.** 조사란 그런 거예요.',
    badge: { emoji: '🐚', label: '아주 옛날 조사' },
  },
  {
    id: 'time-done',
    chapter: 'time-travel',
    order: 4,
    giver: { placeKind: 'library', at: 0 },
    title: '연표를 완성했어요',
    unlock: [{ kind: 'quest', questId: 'time-oldest' }],
    ask: '네 곳을 다 조사했으면, 마지막으로 하나만 맞혀 보세요.',
    quiz: [
      {
        q: '다음 중 가장 오래된 것은 무엇일까요?',
        choices: ['애월진성', '항파두리 토성', '빌레못동굴', '곽지패총'],
        correct: 2,
        why: '빌레못동굴은 **7~8만 년 전** 화산으로 생겼어요. 사람이 만든 것보다 훨씬 옛날이에요.',
      },
      {
        q: '애월진성은 어느 시대에 쌓은 성일까요?',
        choices: ['삼국 시대', '고려 시대', '조선 시대', '일제 강점기'],
        correct: 2,
        why: '애월진성은 **조선 시대**에 바다에서 오는 적(왜구)을 막으려고 쌓은 성이에요.',
      },
      {
        q: '곽지패총에서 많이 나온 것은 무엇일까요?',
        choices: ['금붙이', '토기 조각', '조개껍데기', '쇠붙이'],
        correct: 2,
        why: '**조개껍데기**가 이천 년 넘게 쌓인 곳이에요. 옛사람들이 바다에서 먹을 것을 구한 자취예요.',
      },
    ],
    need: [{ kind: 'quest', questId: 'time-oldest' }],
    reward:
      '연표가 완성됐어요! 조사 수첩에서 볼 수 있어요.\n\n'
      + '**시간 여행자** 자격을 드릴게요.',
    badge: { emoji: '📜', label: '시간 여행자' },
  },

  // ── 「제주라서 그렇다」 — 살림 ──────────────────────────
  {
    id: 'life-salt',
    chapter: 'because-jeju',
    order: 1,
    giver: { placeKind: 'nonghyup', at: 1 },
    title: '돌 위의 소금밭',
    ask:
      '우리 고장 물건을 정리하고 있어요. 그런데 궁금한 게 있어요.\n\n'
      + '**구엄리에 돌로 만든 소금밭**이 있었대요. 왜 돌 위에서 소금을 만들었을까요?\n'
      + '가서 알아보고 와 주세요.',
    need: [{ kind: 'site', siteId: 'gueom-salt' }],
    reward:
      '모래밭이 없으니 **바위 위에서** 만든 거군요!\n\n'
      + '없는 걸 탓하지 않고 **있는 걸로** 살림을 꾸린 거예요.\n'
      + '제주 사람 살림이 대개 그래요.',
    badge: { emoji: '🧂', label: '돌염전 조사' },
  },
  {
    id: 'life-batdam',
    chapter: 'because-jeju',
    order: 2,
    giver: { placeKind: 'nonghyup', at: 2 },
    title: '밭담을 다시 보세요',
    unlock: [{ kind: 'quest', questId: 'life-salt' }],
    ask:
      '학교 오는 길에 **검은 돌담** 봤죠? 너무 흔해서 그냥 지나쳤을 거예요.\n\n'
      + '그게 **세계가 인정한 유산**이에요. 왜 그런지 알아보고 오세요.',
    need: [{ kind: 'site', siteId: 'batdam' }],
    reward:
      '틈이 숭숭한 게 **일부러 그런 것**이었다니!\n\n'
      + '꽉 막으면 바람이 넘어와 소용돌이쳐요. 흘려보내야 힘이 빠지고요.\n'
      + '**오래 해 보고 알아낸 지혜**예요.',
    badge: { emoji: '🧱', label: '밭담 조사' },
  },
  {
    id: 'life-water',
    chapter: 'because-jeju',
    order: 3,
    giver: { placeKind: 'nonghyup', at: 3 },
    title: '물이 귀한 섬',
    unlock: [{ kind: 'quest', questId: 'life-batdam' }],
    ask:
      '밭에 물을 대는 일을 맡고 있어요. 그런데 제주는 **물이 참 귀해요.**\n\n'
      + '**하가리 연화못**에 가 보면 옛날 사람들이 어떻게 했는지 알 수 있어요.',
    need: [{ kind: 'site', siteId: 'haga-yeonhwa' }],
    reward:
      '**봉천수** — 하늘이 준 물을 받아 두는 못이에요.\n\n'
      + '땅이 물을 안 붙잡아 주니 사람이 붙잡아 둔 거예요.\n'
      + '마을 모두의 것이라 함께 지켰고요.',
    badge: { emoji: '🪷', label: '연화못 조사' },
  },
  {
    id: 'life-done',
    chapter: 'because-jeju',
    order: 4,
    giver: { placeKind: 'nonghyup', at: 0 },
    title: '왜 그랬는지 알겠어요?',
    unlock: [{ kind: 'quest', questId: 'life-water' }],
    ask: '소금밭, 밭담, 연못. 세 가지를 다 봤으면 이제 알 거예요.',
    quiz: [
      {
        q: '돌염전·밭담·봉천수, 이 셋의 공통점은 무엇일까요?',
        choices: [
          '모두 나라에서 만들어 준 것이다',
          '모두 제주의 땅과 날씨에 맞춰 사람들이 만든 것이다',
          '모두 관광객을 위해 만든 것이다',
          '모두 최근에 만들어진 것이다',
        ],
        correct: 1,
        why: '현무암·바람·물이 잘 빠지는 땅. **제주라는 땅에 맞춰** 사람들이 스스로 찾아낸 방법이에요.',
      },
      {
        q: '밭담에 틈이 숭숭 뚫려 있는 까닭은?',
        choices: ['돌이 모자라서', '바람을 흘려보내려고', '비를 잘 빠지게 하려고', '모양이 예뻐서'],
        correct: 1,
        why: '꽉 막으면 바람이 소용돌이쳐서 담이 넘어져요. **틈을 두어 흘려보내면** 힘이 빠져요.',
      },
      {
        q: '제주에서 "봉천수"를 만든 까닭은?',
        choices: ['물놀이를 하려고', '물고기를 키우려고', '빗물을 받아 두려고', '빨래를 하려고'],
        correct: 2,
        why: '제주는 땅이 물을 안 붙잡아요. **빗물을 받아 두는 못**을 만들어야 마을에 물이 있었어요.',
      },
    ],
    need: [{ kind: 'quest', questId: 'life-water' }],
    reward:
      '맞아요. 답은 늘 **제주라는 땅**으로 돌아와요.\n\n'
      + '**살림 조사원** 자격을 드릴게요.',
    badge: { emoji: '🌾', label: '살림 조사원' },
  },

  // ── 「숲과 오름」 — 자연 ────────────────────────────────
  {
    id: 'nature-forest',
    chapter: 'forest-oreum',
    order: 1,
    giver: { placeKind: 'library', at: 1 },
    title: '손대지 않은 숲',
    ask:
      '식물 책을 찾는 아이들이 많아요. 그런데 **진짜 숲**을 보고 오면 더 좋을 텐데.\n\n'
      + '**납읍 난대림(금산공원)** 에 가 보세요. 겨울에도 푸른 숲이에요.',
    need: [{ kind: 'site', siteId: 'napeup-forest' }],
    reward:
      '마을 사람들이 **오래 지켜서** 남은 숲이에요.\n\n'
      + '제주 다른 곳의 난대림은 밭이 되고 집이 되면서 사라졌어요.\n'
      + '**남아 있는 건 저절로 남은 게 아니에요.**',
    badge: { emoji: '🌳', label: '난대림 조사' },
  },
  {
    id: 'nature-oreum',
    chapter: 'forest-oreum',
    order: 2,
    giver: { placeKind: 'health', at: 1 },
    title: '걷기 좋은 오름 하나',
    unlock: [{ kind: 'quest', questId: 'nature-forest' }],
    ask:
      '건강하려면 **걸어야** 해요. 우리 읍에는 걷기 좋은 오름이 많아요.\n\n'
      + '**새별오름**에 가 보세요. 봄이면 거기서 들불축제도 해요.\n'
      + '왜 불을 놓는지도 알아보고요.',
    need: [{ kind: 'site', siteId: 'saebyeol' }],
    reward:
      '구경거리로 시작한 게 아니었군요!\n\n'
      + '묵은 풀을 태워야 **새 풀이 돋고 진드기가 죽어요.**\n'
      + '**살림에서 나온 일이 축제가 된 거예요.**',
    badge: { emoji: '🌋', label: '새별오름 조사' },
  },
  {
    id: 'nature-done',
    chapter: 'forest-oreum',
    order: 3,
    giver: { placeKind: 'health', at: 0 },
    title: '우리 읍 자연 조사',
    unlock: [{ kind: 'quest', questId: 'nature-oreum' }],
    ask: '숲과 오름을 다 봤으면 하나만 맞혀 보세요.',
    quiz: [
      {
        q: '제주에 오름이 삼백 개가 넘는 까닭은 무엇일까요?',
        choices: [
          '사람들이 흙을 쌓아 만들어서',
          '한라산이 무너져 내려서',
          '여기저기서 화산이 여러 번 터져서',
          '바닷물이 흙을 밀어 올려서',
        ],
        correct: 2,
        why: '오름은 **작은 화산**이에요. 한 번 크게 터진 게 아니라 여기저기서 여러 번 터져 생겼어요.',
      },
      {
        q: '납읍 난대림이 지금까지 남아 있는 까닭은?',
        choices: ['아무도 몰라서', '마을 사람들이 오래 지켜서', '나라에서 울타리를 쳐서', '나무가 너무 단단해서'],
        correct: 1,
        why: '제주 다른 곳의 숲은 밭과 집이 되면서 사라졌어요. **마을 사람들이 지켜서** 남은 거예요.',
      },
      {
        q: '새별오름 들불축제에서 불을 놓는 진짜 이유는?',
        choices: ['불꽃놀이를 보여주려고', '묵은 풀을 태워 새 풀이 돋게 하려고', '오름을 뜨겁게 하려고', '밤하늘을 밝히려고'],
        correct: 1,
        why: '묵은 풀을 태우면 **새 풀이 돋고 진드기가 줄어요.** 살림에서 나온 일이 축제가 된 거예요.',
      },
    ],
    need: [{ kind: 'quest', questId: 'nature-oreum' }],
    reward:
      '잘 알고 있네요!\n\n'
      + '**자연 조사원** 자격을 드릴게요.',
    badge: { emoji: '🍃', label: '자연 조사원' },
  },

  // ── 「이사 온 친구」 — 행정을 한 사건으로 ────────────────
  {
    id: 'friend-move-in',
    chapter: 'new-friend',
    order: 1,
    giver: { placeKind: 'townhall', at: 0 },
    title: '전학 온 친구를 도와주세요 ①',
    unlock: [{ kind: 'quest', questId: 'round-done' }],
    ask:
      '오늘 아침에 한 가족이 우리 동네로 이사 왔어요. 여러분 또래 친구도 있고요.\n\n'
      + '그 친구가 우리 동네에서 살려면 여러 곳을 거쳐야 해요.\n'
      + '**하나씩 같이 따라가 볼까요?** 먼저 우리 읍사무소부터.',
    quiz: [{
      q: '이사를 오면 며칠 안에 전입신고를 해야 할까요?',
      choices: ['3일', '7일', '14일', '30일'],
      correct: 2,
      why: '**14일 안에** 전입신고를 해야 해요. 그래야 우리 동네 사람으로 적혀서 학교도 다니고 도움도 받아요.',
    }],
    need: [],
    reward:
      '맞아요! 전입신고를 하면 **주소**가 생겨요.\n\n'
      + '주소가 생기면 그다음은 우체국 차례예요. 가 보세요.',
    badge: { emoji: '📋', label: '전입신고' },
  },
  {
    id: 'friend-address',
    chapter: 'new-friend',
    order: 2,
    giver: { placeKind: 'post_office', at: 1 },
    title: '전학 온 친구를 도와주세요 ②',
    unlock: [{ kind: 'quest', questId: 'friend-move-in' }],
    ask:
      '새 주소가 생겼다고요? 그럼 이제 **편지가 올 수 있어요.**\n\n'
      + '그런데 편지가 제대로 오려면 꼭 있어야 하는 게 있어요.',
    quiz: [{
      q: '편지가 제대로 도착하려면 봉투에 꼭 써야 하는 것은?',
      choices: [
        '보내는 사람의 나이',
        '받는 사람의 주소와 우편번호',
        '편지를 쓴 날짜',
        '우체국 이름',
      ],
      correct: 1,
      why: '전국에서 온 편지를 **주소를 보고** 동네별로 나눠요. 주소가 틀리면 갈 곳을 못 찾아요.',
    }],
    need: [],
    reward:
      '정확해요!\n\n'
      + '**주소는 그냥 글자가 아니에요.** 그 집을 찾아가는 길이에요.\n'
      + '이제 그 친구도 할머니 편지를 받을 수 있겠네요.',
    badge: { emoji: '✉️', label: '주소 알기' },
  },
  {
    id: 'friend-safe',
    chapter: 'new-friend',
    order: 3,
    giver: { placeKind: 'police', at: 1 },
    title: '전학 온 친구를 도와주세요 ③',
    unlock: [{ kind: 'quest', questId: 'friend-address' }],
    ask:
      '새로 온 친구는 **길을 잘 몰라요.** 등하굣길이 낯설죠.\n\n'
      + '길에서 헤매는 친구에게 뭐라고 알려 주면 좋을까요?',
    quiz: [{
      q: '길을 잃어서 무서울 때, 가장 먼저 할 일은?',
      choices: [
        '모르는 사람 차를 타고 간다',
        '경찰관이나 가까운 가게 어른에게 도움을 청한다',
        '어두워질 때까지 그 자리에서 기다린다',
        '아무에게도 말하지 않고 혼자 찾아본다',
      ],
      correct: 1,
      why: '**어른에게 도움을 청하는 건 부끄러운 일이 아니에요.** 경찰관, 가게 아저씨·아주머니 누구든 좋아요. 급하면 112.',
    }],
    need: [],
    reward:
      '잘 알고 있어요.\n\n'
      + '**도와달라고 말할 줄 아는 것**도 배워야 하는 일이에요.\n'
      + '그 친구에게도 꼭 알려 주세요.',
    badge: { emoji: '🦺', label: '안전 알기' },
  },
  {
    id: 'friend-library',
    chapter: 'new-friend',
    order: 4,
    giver: { placeKind: 'library', at: 1 },
    title: '전학 온 친구를 도와주세요 ④',
    unlock: [{ kind: 'quest', questId: 'friend-safe' }],
    ask:
      '그 친구가 책을 좋아한다고요? 잘됐네요.\n\n'
      + '우리 도서관에서 책을 빌리려면 뭐가 필요할까요?',
    quiz: [{
      q: '도서관에서 책을 빌리려면 무엇이 필요할까요?',
      choices: ['돈', '회원증', '선생님 허락', '아무것도 필요 없다'],
      correct: 1,
      why: '**회원증**을 만들면 빌릴 수 있어요. 돈은 안 들어요 — 도서관은 **우리 모두의 것**이니까요.',
    }],
    need: [],
    reward:
      '맞아요. 돈은 안 들어요.\n\n'
      + '다만 **빌린 날짜는 꼭 지켜야** 해요. 다음 사람이 기다리고 있으니까요.',
    badge: { emoji: '🎫', label: '회원증 알기' },
  },
  {
    id: 'friend-settled',
    chapter: 'new-friend',
    order: 5,
    giver: { placeKind: 'townhall', at: 1 },
    title: '친구가 자리를 잡았어요',
    unlock: [{ kind: 'quest', questId: 'friend-library' }],
    ask:
      '그 친구네가 잘 자리 잡았다고 들었어요. 여러분 덕분이에요.\n\n'
      + '이 일을 하면서 뭘 느꼈나요?',
    quiz: [
      {
        q: '한 가족이 이사 와서 자리를 잡는 데 여러 곳이 필요했어요. 왜 그럴까요?',
        choices: [
          '한 곳이 다 하면 힘드니까 일부러 나눈 것이다',
          '기관마다 잘하는 일이 달라서, 나눠서 맡고 서로 이어 준다',
          '옛날부터 그래서 이유는 없다',
          '사람들을 여러 번 오게 하려고',
        ],
        correct: 1,
        why: '주소는 읍사무소가, 편지는 우체국이, 안전은 경찰이, 책은 도서관이. **나눠 맡고 서로 이어 주는 것**이 우리 동네가 돌아가는 방식이에요.',
      },
      {
        q: '이사를 오면 며칠 안에 전입신고를 해야 할까요?',
        choices: ['3일', '7일', '14일', '30일'],
        correct: 2,
        why: '**14일 안에** 전입신고를 해야 해요. 그래야 학교도 다니고 도움도 받을 수 있어요.',
      },
      {
        q: '길에서 무서울 때 가장 먼저 해야 할 일은?',
        choices: ['혼자 찾아본다', '경찰관이나 가까운 어른에게 도움을 청한다', '그 자리에서 기다린다', '모르는 사람 차를 탄다'],
        correct: 1,
        why: '**도와달라고 말할 줄 아는 것**도 배워야 하는 일이에요. 경찰관, 가게 어른 누구든 좋아요.',
      },
    ],
    need: [{ kind: 'quest', questId: 'friend-library' }],
    reward:
      '그거예요.\n\n'
      + '동네는 한 사람이 다 하는 게 아니라 **여럿이 나눠 맡아** 돌아가요.\n'
      + '여러분도 이제 그 안에 있는 사람이고요.\n\n'
      + '**이웃 도우미** 자격을 드릴게요.',
    badge: { emoji: '🤝', label: '이웃 도우미' },
  },

  /*
    ── 「바다가 부르는 마을」 — 곽지·한담 ──────────────────

    **자리(spot)를 넘어가는 첫 이야기다.** 앞의 이야기들은 애월리 안에서
    끝났지만, 이건 서쪽 한담과 남서쪽 곽지까지 걸어가야 끝난다.
    맵 끝단 화살표를 쓸 이유가 처음으로 생긴다.

    심부름을 주는 사람은 **가게 사장님들**이다. 관공서가 아니라 장사하는
    사람에게 듣는 이야기라 결이 다르다 — 관광지 상권은 교과서보다
    가게 주인이 더 잘 안다.
  */
  {
    id: 'sea-gwamul',
    chapter: 'sea-town',
    order: 1,
    giver: { placeKind: 'cafe', at: 0 },
    title: '바닷가에서 솟는 민물',
    ask:
      '우리 가게 물도 이 동네 물이에요. 그런데 재미있는 게 있어요.\n\n'
      + '**곽지 해변에서는 바닷가인데 민물이 솟아요.** 짜지도 않고요.\n'
      + '거기 가서 왜 그런지 알아보고 와 줄래요?\n\n'
      + '마을 끝 **남서쪽 화살표**로 곽지에 갈 수 있어요.',
    need: [{ kind: 'site', siteId: 'gwakji-gwamul' }],
    reward:
      '**용천수** — 땅속으로 스며든 빗물이 바닷가에서 다시 솟는 거예요.\n\n'
      + '제주 땅이 현무암이라 비가 와도 고이지 않고 쑥 스며들어요.\n'
      + '그 물이 단단한 층을 만나면 바닷가 쪽으로 밀려 나오는 거죠.\n\n'
      + '**물이 먼저고 마을이 나중**이에요. 곽지리도 그래요.',
    badge: { emoji: '💧', label: '용천수 조사' },
  },
  {
    id: 'sea-shell',
    chapter: 'sea-town',
    order: 2,
    giver: { placeKind: 'cafe', at: 1 },
    title: '이천 년 전에도 여기 살았대요',
    unlock: [{ kind: 'quest', questId: 'sea-gwamul' }],
    ask:
      '물이 있어서 마을이 생겼다고 들었죠?\n\n'
      + '그런데 **얼마나 오래됐을까요?** 곽지에 조개껍데기가 잔뜩 쌓인\n'
      + '유적이 있대요. 가서 알아보고 오세요.',
    need: [{ kind: 'site', siteId: 'gwakji-shell' }],
    reward:
      '**이천 년**이라니!\n\n'
      + '층층이 쌓인 게 다 다른 시대예요. 아래가 옛날, 위가 나중.\n'
      + '한 자리에서 이천 년을 파 내려가는 셈이죠.\n\n'
      + '**사람이 모이는 자리에는 늘 까닭이 있어요** — 먹을 것과 물이에요.',
    badge: { emoji: '🐚', label: '패총 조사' },
  },
  {
    id: 'sea-handam',
    chapter: 'sea-town',
    order: 3,
    giver: { placeKind: 'convenience', at: 0 },
    title: '표류했다 살아 돌아온 사람',
    unlock: [{ kind: 'quest', questId: 'sea-shell' }],
    ask:
      '우리 가게 앞으로 **한담해안산책로**가 지나가요. 손님들이 많이 걷죠.\n\n'
      + '그 길에 옛날 이야기가 하나 있어요. **애월 사람이 배를 탔다가\n'
      + '풍랑을 만나 표류했는데, 살아 돌아와 책을 썼대요.**\n\n'
      + '누구인지 알아보고 오세요. 마을 **서쪽 화살표**로 한담에 가요.',
    need: [{ kind: 'site', siteId: 'handam-trail' }],
    reward:
      '**장한철** — 1770년에 과거 보러 가다 표류했어요.\n\n'
      + '살아 돌아와 겪은 일을 날짜별로 적었는데, 그게 **『표해록』**이에요.\n\n'
      + '패총이 남긴 것이 조개껍데기라면, 장한철이 남긴 것은 글이에요.\n'
      + '**남겨진 것이 그때를 알려줘요.**',
    badge: { emoji: '📜', label: '표해록 조사' },
  },
  {
    id: 'sea-market',
    chapter: 'sea-town',
    order: 4,
    giver: { placeKind: 'restaurant', at: 0 },
    title: '왜 여기에 가게가 많을까',
    unlock: [{ kind: 'quest', questId: 'sea-handam' }],
    ask:
      '곽지랑 한담을 다녀왔다면서요? 뭘 봤어요?\n\n'
      + '**민박, 펜션, 카페, 식당.** 사는 사람은 얼마 안 되는데\n'
      + '가게는 참 많죠. 왜 그럴까요?\n\n'
      + '**편의점이랑 카페에 들러** 사장님들 이야기를 들어보고 오세요.',
    need: [
      { kind: 'guide', placeKind: 'convenience' },
      { kind: 'guide', placeKind: 'cafe' },
    ],
    reward:
      '맞아요. **사는 사람이 아니라 오는 사람**을 보고 연 가게예요.\n\n'
      + '바다가 예쁘니 사람이 오고, 사람이 오니 잘 데와 먹을 데가 필요하고,\n'
      + '그래서 민박과 식당이 생겨요.\n\n'
      + '**관광지 상권**이라고 해요. 우리 동네 살림이 바다에 기대고 있는 거죠.',
    badge: { emoji: '🏪', label: '상권 조사' },
  },
  {
    id: 'sea-done',
    chapter: 'sea-town',
    order: 5,
    giver: { placeKind: 'restaurant', at: 1 },
    title: '바다가 먹여 살린다',
    unlock: [{ kind: 'quest', questId: 'sea-market' }],
    ask:
      '곽지도 한담도 다 다녀왔군요. 마지막으로 물어볼게요.\n\n'
      + '**바닷가 마을이 무엇으로 살아왔는지** 알겠어요?',
    quiz: [
      {
        q: '곽지에 아주 오래전부터 사람이 살았던 가장 큰 까닭은?',
        choices: [
          '바다 경치가 아름다워서',
          '먹을 것(조개·물고기)과 마실 물(용천수)이 가까이 있어서',
          '나라에서 살라고 시켜서',
          '길이 잘 닦여 있어서',
        ],
        correct: 1,
        why: '패총은 **먹은 흔적**이고 과물은 **마실 물**이에요. 사람이 모이는 자리에는 늘 이 둘이 있어요. 경치는 나중 이야기예요.',
      },
      {
        q: '제주에서 용천수가 주로 바닷가에 솟는 까닭은?',
        choices: [
          '바닷물이 민물로 바뀌기 때문에',
          '현무암에 스며든 빗물이 단단한 층을 만나 바닷가 쪽으로 밀려 나오기 때문에',
          '바닷가 땅이 더 낮아서 비가 모이기 때문에',
          '사람들이 우물을 바닷가에만 팠기 때문에',
        ],
        correct: 1,
        why: '제주 땅은 구멍이 숭숭한 **현무암**이라 비가 고이지 않고 스며들어요. 그 물이 더 못 내려가는 층을 만나면 옆으로 흘러 **바닷가에서 솟아요.**',
      },
      {
        q: '한담·곽지에 민박과 카페가 유난히 많은 까닭은?',
        choices: [
          '이 동네 사람이 아주 많아서',
          '바다를 보러 오는 사람이 많아서, 그 사람들에게 필요한 것을 파는 가게가 생긴 것',
          '나라에서 가게를 지어 준 것',
          '농사지을 땅이 아예 없어서',
        ],
        correct: 1,
        why: '**사는 사람이 아니라 오는 사람**을 보고 연 가게예요. 이런 것을 관광지 상권이라고 해요. 관광객이 쓴 돈이 우리 동네에 남아요.',
      },
    ],
    need: [{ kind: 'quest', questId: 'sea-market' }],
    reward:
      '훌륭해요.\n\n'
      + '옛날 사람은 바다에서 **먹을 것**을 얻었고,\n'
      + '지금 사람은 바다를 보러 오는 손님에게 **살림**을 얻어요.\n\n'
      + '천 년이 지나도 **바다가 이 마을을 먹여 살리는 것**은 그대로예요.\n'
      + '**바다마을 조사원** 자격을 드릴게요.',
    badge: { emoji: '🌊', label: '바다마을 조사원' },
  },
];

// ───────────────────────────────────────────────────────────
// 조사원 등급
// ───────────────────────────────────────────────────────────

/**
 * **점수를 안 붙였다.**
 *
 * 순위표를 붙이면 빨리 넘기는 아이가 이긴다. 조사는 빨리 하는 일이 아니다.
 * 그래서 **마친 심부름 수**만 본다 — 누구든 다 하면 마을 박사가 된다.
 */
export const RANKS = [
  { need: 0, label: '견습 조사원', emoji: '🔰' },
  { need: 3, label: '3급 조사원', emoji: '🥉' },
  { need: 8, label: '2급 조사원', emoji: '🥈' },
  { need: 14, label: '1급 조사원', emoji: '🥇' },
  { need: 20, label: '마을 박사', emoji: '🎓' },
] as const;

export function rankOf(doneCount: number): { need: number; label: string; emoji: string } {
  let cur: { need: number; label: string; emoji: string } = RANKS[0];
  for (const r of RANKS) if (doneCount >= r.need) cur = r;
  return cur;
}

/** 다음 등급까지 몇 개 남았나. 최고 등급이면 `null`. */
export function toNextRank(doneCount: number): { label: string; left: number } | null {
  const next = RANKS.find((r) => doneCount < r.need);
  return next ? { label: next.label, left: next.need - doneCount } : null;
}

// ───────────────────────────────────────────────────────────
// 판정
// ───────────────────────────────────────────────────────────

/** 조사 기록 — `site-*`, `place-*`, `quest-*` 열쇠들 */
export type Progress = ReadonlySet<string>;

export const siteKey = (id: string) => `site-${id}`;
export const placeKey = (kind: string) => `place-${kind}`;
export const questKey = (id: string) => `quest-${id}`;

function met(c: Condition, done: Progress): boolean {
  if (c.kind === 'site') return done.has(siteKey(c.siteId));
  if (c.kind === 'guide') return done.has(placeKey(c.placeKind));
  return done.has(questKey(c.questId));
}

/**
 * 이 심부름이 지금 어떤 상태인가.
 *
 * **`ready` 가 따로 있는 게 요점이다.** 다 해왔어도 **돌아가서 알려야** 끝난다.
 * 그래야 아이가 마을을 두 번 걷는다.
 */
export function questState(q: Quest, done: Progress): QuestState {
  if (done.has(questKey(q.id))) return 'done';
  if (q.unlock && !q.unlock.every((c) => met(c, done))) return 'locked';
  // 묻고 가는 심부름은 답을 맞혀야 끝나므로 여기서 `ready` 가 되지 않는다
  if (q.quiz?.length) return 'todo';
  return q.need.every((c) => met(c, done)) ? 'ready' : 'todo';
}

/**
 * 이 기관에서 만날 수 있는 심부름들 (안 뜬 것은 뺀다).
 *
 * **심부름 목록을 밖에서 받는다.** 학교가 어드민에서 고칠 수 있게 되면서
 * `QUESTS` 는 더 이상 '진짜 목록' 이 아니라 **기본값**이 되었다
 * (`rpg-content.ts`). 화면은 그 학교 것을 받아 넘겨준다.
 */
export function questsAtPlace(quests: Quest[], placeKind: string, done: Progress, grade?: number): Quest[] {
  return quests
    .filter((q) => q.giver.placeKind === placeKind)
    .filter((q) => !q.minGrade || !grade || grade >= q.minGrade)
    .filter((q) => questState(q, done) !== 'locked')
    .sort((a, b) => a.order - b.order);
}

/** 이 사람이 지금 줄 수 있는 심부름 하나 (없으면 `null`) */
export function questOfPerson(
  quests: Quest[],
  placeKind: string,
  at: number,
  done: Progress,
  grade?: number
): Quest | null {
  const mine = questsAtPlace(quests, placeKind, done, grade).filter((q) => q.giver.at === at);
  // **알릴 것이 먼저다.** 상 받을 게 있는데 새 심부름을 주면 아이가 헷갈린다
  return mine.find((q) => questState(q, done) === 'ready')
    ?? mine.find((q) => questState(q, done) === 'todo')
    ?? mine.find((q) => questState(q, done) === 'done')
    ?? null;
}

/** 지금 해야 할 일들 — 조사 수첩에 뜬다 */
export function openQuests(quests: Quest[], done: Progress, grade?: number): Quest[] {
  return quests
    .filter((q) => !q.minGrade || !grade || grade >= q.minGrade)
    .filter((q) => {
      const s = questState(q, done);
      return s === 'todo' || s === 'ready';
    });
}

export const doneQuests = (quests: Quest[], done: Progress): Quest[] =>
  quests.filter((q) => done.has(questKey(q.id)));

/** 모은 뱃지 */
export const badgesOf = (quests: Quest[], done: Progress) =>
  doneQuests(quests, done).map((q) => q.badge).filter((b): b is NonNullable<typeof b> => !!b);

/** 에피소드가 어디까지 왔나 */
export function chapterProgress(quests: Quest[], chapterId: string, done: Progress) {
  const all = quests.filter((q) => q.chapter === chapterId);
  const fin = all.filter((q) => done.has(questKey(q.id)));
  return { total: all.length, done: fin.length, complete: all.length > 0 && fin.length === all.length };
}

/** 심부름이 아이를 어디로 보내나 — 수첩에서 '가기' 버튼을 만들 때 쓴다 */
export function questTarget(q: Quest, done?: Progress): { kind: 'site'; id: string } | { kind: 'place'; id: string } | null {
  const cond = (done ? q.need.find((c) => !met(c, done)) : null) ?? q.need[0];
  if (!cond) return null;
  if (cond.kind === 'site') return { kind: 'site', id: cond.siteId };
  if (cond.kind === 'guide') return { kind: 'place', id: cond.placeKind };
  return null;
}

export const questById = (id: string) => QUESTS.find((q) => q.id === id);

/**
 * 등급은 **그 학교의 심부름 수**에 맞춘다.
 *
 * 학교가 심부름을 늘리거나 줄이면 스무 개 기준이 안 맞는다.
 * 그래서 비율로 잰다 — 다 하면 어디서나 마을 박사가 된다.
 */
export function rankForSchool(doneCount: number, total: number) {
  if (total <= 0) return RANKS[0];
  const scaled = Math.round((doneCount / total) * RANKS[RANKS.length - 1].need);
  return rankOf(scaled);
}
export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
