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

/** 전시관 분위기 — 벽·바닥·조명이 통째로 바뀐다 */
export type HallTheme = 'white' | 'dark' | 'wood';

export interface HallThemeSpec {
  id: HallTheme;
  label: string;
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
}

/**
 * 세 가지만 둔다. 열 가지를 두면 고르다 지치고, 어느 것도 다듬어지지 않는다.
 * 실제 미술관에서 쓰는 세 가지다 — 화이트큐브 / 블랙박스 / 목재 전시장.
 */
export const HALL_THEMES: Record<HallTheme, HallThemeSpec> = {
  white: {
    id: 'white',
    label: '화이트 큐브',
    wall: '#F4F2EE',
    floor: '#D8D3CA',
    ceiling: '#FBFAF8',
    trim: '#E4E0D8',
    frame: '#2A2724',
    caption: '#3A3630',
    facade: '#E8E4DC',
    ambient: 0.62,
  },
  dark: {
    id: 'dark',
    label: '블랙 박스',
    wall: '#2A2A2E',
    floor: '#1E1E22',
    ceiling: '#232327',
    trim: '#3A3A40',
    frame: '#8A8378',
    caption: '#E8E4DC',
    facade: '#3A3A40',
    ambient: 0.3,
  },
  wood: {
    id: 'wood',
    label: '목재 전시장',
    wall: '#F2EADA',
    floor: '#A87F52',
    ceiling: '#FAF5EA',
    trim: '#C9A46B',
    frame: '#5B4227',
    caption: '#4A3B2A',
    facade: '#DCCDB2',
    ambient: 0.58,
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
  /** 배너가 걸리는 차례 */
  order: number;
  workCount: number;
  createdAt: unknown;
}

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
