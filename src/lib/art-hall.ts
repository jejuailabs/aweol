/**
 * 개인 전시관 — **학교가 아닌 사람의 전시.**
 *
 * 학교 전시실(`schools/{id}/classes/...`)과 **일부러 따로 둔다.**
 * 학교 것은 학년·반·담임이 뼈대다. 개인 전시에는 그 뼈대가 하나도 안 맞는다 —
 * 반이 없고, 승인해 줄 담임이 없고, 권한은 '내 것이냐' 하나로 갈린다.
 * 억지로 같은 표에 넣으면 학교 코드가 영영 복잡해진다.
 *
 * ---
 *
 * **세 층이다.**
 *
 *   전시관(hall) — 지도 위의 한 점. 사람 하나가 가진 미술관.
 *     └ 전시(show) — 건물 앞에 걸리는 **세로 배너 하나**. '애월 바다, 사계'
 *         └ 작품(work) — 벽에 걸리는 사진·그림
 *
 * 실제 미술관과 같은 구조다. 예술의전당에 여러 전시가 동시에 열리듯,
 * 한 사람의 전시관에도 사진전과 그림전이 나란히 걸릴 수 있다.
 *
 * ---
 *
 * **공개 여부는 세 층에 다 베껴 둔다.**
 *
 * 규칙(firestore.rules)에서 부모 문서를 `get()` 하면 작품 수만큼 읽기가 든다.
 * 그래서 `isPublic` 과 `ownerUid` 를 작품까지 복사해 두고, 감출 때는
 * 세 층을 한 번에 고친다(`/api/hall` 의 publish). 작품이 열 몇 점이라
 * 한 번에 고치는 값이 싸다.
 */

/**
 * 전시관 분위기 — **색만 바뀌는 것이 아니다.**
 *
 * 처음에는 벽·바닥 색만 갈아 끼웠다. 그래서 셋 다 **같은 건물에 페인트만
 * 다시 칠한 것** 이었다 — 열주도, 마당 타일도, 세워둔 조형물도 똑같았다.
 *
 * 이제 **건축 양식 단위**로 바꾼다. 세계의 미술관들이 저마다 다른 이유가
 * 색이 아니라 **형태**이기 때문이다. 열주가 선 신전과 티타늄이 물결치는
 * 덩어리는 같은 건물에 색만 다른 것이 아니다.
 *
 * 이름(id)은 **예전 것을 그대로 둔다.** 이미 만든 전시관이 이 값을 들고
 * 있어서, 이름을 바꾸면 그 전시관들이 통째로 기본값으로 떨어진다.
 */
export type HallTheme = 'white' | 'dark' | 'wood' | 'silver' | 'glass';

/** 바깥 건물을 무엇으로 지을까 */
export type HallArch =
  /** 열주가 선 고전 신전 — 대영박물관·예술의전당 */
  | 'temple'
  /** 노출 철골과 색색 배관 — 퐁피두 센터 */
  | 'hitech'
  /** 기와 지붕과 처마 — 국립중앙박물관·경복궁 */
  | 'hanok'
  /** 티타늄이 물결치는 덩어리 — 구겐하임 빌바오 */
  | 'titanium'
  /** 유리 피라미드와 낮은 석조 — 루브르 */
  | 'pyramid';

/** 마당을 어떻게 깔까 */
export type HallPaving =
  /** 곧은 격자 — 다듬은 화강암 */
  | 'grid'
  /** 넓은 붉은 벽돌 — 퐁피두 앞 경사 광장 */
  | 'brick'
  /** 박석 — 불규칙한 넓적 돌. 궁궐 마당. */
  | 'stone'
  /** 물결 — 동심원. 물가에 선 건물. */
  | 'wave'
  /** 방사형 — 가운데에서 뻗어 나간다 */
  | 'radial';

export interface HallThemeSpec {
  id: HallTheme;
  label: string;
  /** 무엇을 본떴나 — 고를 때 보여준다 */
  motif: string;
  /** 벽 */
  wall: string;
  /** 바닥 */
  floor: string;
  /** 천장 */
  ceiling: string;
  /** 걸레받이·몰딩 */
  trim: string;
  /** 액자 테두리 */
  frame: string;
  /** 캡션 글씨 */
  caption: string;
  /** 바깥 건물 벽 */
  facade: string;
  /** 전체 밝기 */
  ambient: number;

  // ---- 바깥 ----
  /** 건물 형태 */
  arch: HallArch;
  /** 마당 무늬 */
  paving: HallPaving;
  /** 마당 바탕색 */
  plazaBase: string;
  /** 마당 돌 색 */
  plazaTile: string;
  /** 마당 줄눈 색 */
  plazaLine: string;
  /** 포인트 색 — 배너 띠·조형물에 쓴다 */
  accent: string;
  /** 하늘 (CSS 그라디언트) */
  sky: string;
  /** 나무를 심을까 — 물가나 광장형에는 안 심는다 */
  trees: boolean;
}

/**
 * 다섯 가지. **저마다 다른 건물이다.**
 *
 * 세계의 미술관을 하나씩 본떴다. 색만 다른 다섯이 아니라 **형태가 다른**
 * 다섯이라 — 열주가 선 신전, 배관을 밖으로 낸 공장, 기와를 인 마당집,
 * 티타늄이 물결치는 덩어리, 유리 피라미드.
 *
 * 다섯을 넘기지 않는다. 열 가지를 두면 고르다 지치고 어느 것도 안 다듬어진다.
 */
export const HALL_THEMES: Record<HallTheme, HallThemeSpec> = {
  white: {
    id: 'white',
    label: '고전 신전',
    motif: '대영박물관 · 예술의전당 — 열주가 선 돌 건물',
    wall: '#F4F2EE',
    floor: '#D8D3CA',
    ceiling: '#FBFAF8',
    trim: '#E4E0D8',
    frame: '#2A2724',
    caption: '#3A3630',
    facade: '#E8E4DC',
    ambient: 0.62,
    arch: 'temple',
    paving: 'grid',
    plazaBase: '#B5AFA6',
    plazaTile: '#C9C4BB',
    plazaLine: '#A9A399',
    accent: '#2F5D8A',
    sky: 'linear-gradient(180deg, #A8C4D8 0%, #CFDEE8 55%, #E8EEF2 100%)',
    trees: true,
  },
  dark: {
    id: 'dark',
    label: '색색 파이프',
    motif: '퐁피두 센터 — 배관을 밖으로 낸 건물',
    wall: '#2A2A2E',
    floor: '#1E1E22',
    ceiling: '#232327',
    trim: '#3A3A40',
    frame: '#8A8378',
    caption: '#E8E4DC',
    facade: '#3A3A40',
    ambient: 0.3,
    arch: 'hitech',
    paving: 'brick',
    plazaBase: '#8E5B44',
    plazaTile: '#A96B4E',
    plazaLine: '#7A4B38',
    accent: '#E8604C',
    sky: 'linear-gradient(180deg, #2E3440 0%, #4A5464 60%, #6E7686 100%)',
    trees: false,
  },
  wood: {
    id: 'wood',
    label: '기와 마당',
    motif: '국립중앙박물관 · 경복궁 — 기와를 인 마당집',
    wall: '#F2EADA',
    floor: '#A87F52',
    ceiling: '#FAF5EA',
    trim: '#C9A46B',
    frame: '#5B4227',
    caption: '#4A3B2A',
    facade: '#DCCDB2',
    ambient: 0.58,
    arch: 'hanok',
    paving: 'stone',
    plazaBase: '#A9A093',
    plazaTile: '#C2B9A9',
    plazaLine: '#8E8577',
    accent: '#2E6B4F',
    sky: 'linear-gradient(180deg, #BBD3E0 0%, #DCE7EC 55%, #F0F2EE 100%)',
    trees: true,
  },
  silver: {
    id: 'silver',
    label: '은빛 물결',
    motif: '구겐하임 빌바오 — 티타늄이 물결치는 덩어리',
    wall: '#EDEFF2',
    floor: '#C6CBD2',
    ceiling: '#F7F9FB',
    trim: '#D6DAE0',
    frame: '#3C4149',
    caption: '#333941',
    facade: '#C7CDD4',
    ambient: 0.6,
    arch: 'titanium',
    paving: 'wave',
    plazaBase: '#8FA6B4',
    plazaTile: '#A8BCC7',
    plazaLine: '#7B909D',
    accent: '#4FA3C7',
    sky: 'linear-gradient(180deg, #8FB4CC 0%, #C2D6E2 55%, #E4EDF2 100%)',
    // 물가에 선 건물이라 가로수를 안 심는다 — 물과 금속만 있어야 그 맛이다
    trees: false,
  },
  glass: {
    id: 'glass',
    label: '유리 피라미드',
    motif: '루브르 — 옛 돌 건물 앞에 선 유리 피라미드',
    wall: '#F6F3EC',
    floor: '#CFC6B6',
    ceiling: '#FCFAF5',
    trim: '#DED5C4',
    frame: '#4A4034',
    caption: '#3E362C',
    facade: '#D8CDB8',
    ambient: 0.64,
    arch: 'pyramid',
    paving: 'radial',
    plazaBase: '#B0A794',
    plazaTile: '#C7BEAA',
    plazaLine: '#9A9080',
    accent: '#C79A3C',
    sky: 'linear-gradient(180deg, #9FC0D6 0%, #D2E0E8 55%, #EFF2F0 100%)',
    trees: true,
  },
};

export const themeOf = (t: unknown): HallThemeSpec =>
  HALL_THEMES[(t as HallTheme)] ?? HALL_THEMES.white;

/** 전시관 문서 (`halls/{hallId}`) */
export interface HallDoc {
  ownerUid: string;
  ownerName: string;
  /** 전시관 이름 — '김민준 사진관' */
  title: string;
  /** 한 줄 소개 */
  tagline: string;
  /** 관장의 말 (길게) */
  intro: string;
  /** 지도에 세울 자리 */
  lat: number;
  lng: number;
  /** 그 자리 이름 — '애월 한담해변' */
  placeName: string;
  /** 대표 이미지 (지도 마커와 건물 간판) */
  coverUrl: string;
  theme: HallTheme;
  /** 지도에 올라가나 */
  isPublic: boolean;
  showCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

/** 전시 (`halls/{hallId}/shows/{showId}`) — 건물 앞 세로 배너 하나 */
export interface ShowDoc {
  hallId: string;
  ownerUid: string;
  isPublic: boolean;
  /** 전시 제목 — 배너에 크게 */
  title: string;
  /** 부제 — '2026 봄 사진전' */
  subtitle: string;
  /** 전시 소개글 */
  intro: string;
  /**
   * 배너에 딸리는 **썸네일 한 장.**
   *
   * 이름만 걸면 문을 열기 전까지 무슨 전시인지 알 수 없다.
   * 실제 미술관 배너에도 늘 대표 이미지가 한 장 붙는다.
   */
  posterUrl: string;
  /**
   * 전시 기간 — `YYYY-MM-DD`. 빈 문자열이면 '상시'.
   *
   * **실제 전시에는 늘 기간이 붙는다.** 배너에 이름만 걸면 지금 볼 수 있는
   * 것인지, 다음 달에 여는 것인지 알 수 없다. 기간이 있어야
   * "아직 예정이구나", "이번 주까지구나" 가 배너만 보고 온다.
   *
   * 날짜는 **글자로 둔다**(Timestamp 가 아니라). 시각도 시간대도 필요 없는
   * '며칠' 이라 글자가 다루기 쉽고, 화면·서버가 같은 값을 본다.
   */
  startAt: string;
  endAt: string;
  /** 배너가 걸리는 차례 */
  order: number;
  workCount: number;
  createdAt: unknown;
}

/** 전시가 지금 어느 때인가 */
export type ShowPhase = 'upcoming' | 'open' | 'closed' | 'always';

export interface ShowPeriod {
  phase: ShowPhase;
  /** 배너에 크게 — '전시 예정' · '전시 중' · '전시 끝' */
  badge: string;
  /** 배너에 작게 — '3월 2일 시작' · '3월 20일까지' */
  note: string;
}

/** '2026-03-20' → '3월 20일' */
const dayLabel = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : s;
};

/** 오늘을 `YYYY-MM-DD` 로 (그 자리의 달력 기준) */
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 전시 기간을 사람이 읽는 말로.
 *
 * 날짜가 `YYYY-MM-DD` 라 **글자끼리 비교하면 그대로 날짜 순서**가 된다 —
 * Date 로 바꾸면 시간대 때문에 하루가 밀리는 일이 생긴다(자정 근처에서).
 */
export function showPeriod(
  show: { startAt?: string; endAt?: string },
  today = todayStr()
): ShowPeriod {
  const s = (show.startAt || '').trim();
  const e = (show.endAt || '').trim();
  if (!s && !e) return { phase: 'always', badge: '상시 전시', note: '' };

  if (s && today < s) {
    return { phase: 'upcoming', badge: '전시 예정', note: `${dayLabel(s)} 시작` };
  }
  if (e && today > e) {
    return { phase: 'closed', badge: '전시 끝', note: `${dayLabel(e)} 마감` };
  }
  return {
    phase: 'open',
    badge: '전시 중',
    note: e ? `${dayLabel(e)}까지` : `${dayLabel(s)} 시작`,
  };
}

/** 때마다 다른 색 — 배너 띠와 글자에 쓴다 */
export const PHASE_COLOR: Record<ShowPhase, string> = {
  upcoming: '#C7893F',
  open: '#1E7B45',
  closed: '#8A8378',
  always: '#4E7FA8',
};

/**
 * 작품에 남기는 말 (`halls/{hallId}/shows/{showId}/comments/{commentId}`)
 *
 * **작품 아래가 아니라 전시 아래**에 둔다. 작품마다 하위 컬렉션을 두면
 * 전시실에 들어설 때 말풍선 숫자를 세려고 작품 수만큼 질의해야 한다 —
 * 마흔 점이면 마흔 번이다. 한곳에 모으고 `workId` 를 적어두면 한 번에 받는다.
 */
export interface WorkCommentDoc {
  /** 어느 작품에 남긴 말인가 */
  workId: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt: unknown;
  /**
   * 작가가 단 답 — **댓글 하나에 하나.**
   *
   * 답글을 또 다는 나무 구조로 만들지 않는다. 전시실에서 오가는 말은
   * "잘 봤어요" 와 "고맙습니다" 두 마디로 끝나는 것이 보통이라,
   * 층을 깊게 만들면 화면만 복잡해지고 아이는 못 읽는다.
   */
  reply?: string;
  replyAt?: unknown;
}

/** 작품에 남기는 말 길이 — 화면과 규칙이 같은 값을 봐야 한다 */
export const MAX_COMMENT = 300;

/** 작품 (`halls/{hallId}/shows/{showId}/works/{workId}`) */
export interface WorkDoc {
  hallId: string;
  showId: string;
  ownerUid: string;
  isPublic: boolean;
  imageUrl: string;
  /** 벽에 거는 작은 판. 없으면 원본을 쓴다. */
  thumbnailUrl: string;
  title: string;
  /** 작가의 말 */
  caption: string;
  /** 찍은 곳·때 (사진전이면 이게 크다) */
  takenAt: string;
  order: number;
  createdAt: unknown;
}

/**
 * 한 사람이 열 수 있는 전시관 수.
 *
 * 지도는 모두가 함께 보는 곳이다. 한 사람이 스무 개를 세우면 남의 전시관이
 * 안 보인다. **세 개면 사진전·그림전·아이 작품전까지 넉넉하다.**
 */
export const MAX_HALLS_PER_USER = 3;

/** 전시관 하나에 열 수 있는 전시 수 (배너가 걸릴 자리) */
export const MAX_SHOWS_PER_HALL = 6;

/** 전시 하나에 걸 수 있는 작품 수 */
export const MAX_WORKS_PER_SHOW = 40;

/** 배너에 걸 수 있는 수 — 건물 앞이 좁다. 넘으면 안쪽 벽에 안내로만 뜬다. */
export const BANNER_SLOTS = 4;

/** 글자 길이 상한 — 서버와 화면이 같은 값을 봐야 한다 */
export const LIMITS = {
  title: 40,
  tagline: 60,
  intro: 600,
  placeName: 40,
  showTitle: 40,
  subtitle: 40,
  /** 'YYYY-MM-DD' 열 글자 */
  date: 10,
  showIntro: 600,
  workTitle: 40,
  caption: 300,
  takenAt: 40,
} as const;

/**
 * 전시관 주소 — 한 곳에서만 만든다.
 * 링크가 여러 군데서 조립되면 반드시 한쪽이 낡는다.
 */
export const hallPath = (hallId: string) => `/hall/${hallId}`;
export const showPath = (hallId: string, showId: string) =>
  `/hall/${hallId}/show/${showId}`;

/**
 * 전시관 이름에서 지도 마커에 쓸 짧은 이름을 만든다.
 * 지도 마커는 좁아서 긴 이름이 들어가면 옆 마커를 덮는다.
 */
export const shortTitle = (title: string, max = 10) =>
  title.length > max ? `${title.slice(0, max)}…` : title;
