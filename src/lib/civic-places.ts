/**
 * 우리 동네 기관 — **들어가서 하는 일을 배우는 곳.**
 *
 * 마을에 서 있는 건물 중 우체국·경찰서·읍사무소 같은 곳을 알아보고,
 * 그 안에서 무엇을 하는지 알려준다.
 *
 * **AI 를 안 부른다.** '우체국이 하는 일' 은 바뀌지 않는 지식이라 표로 두면 된다.
 * 아이가 들어갈 때마다 모델을 부르면 그게 다 요금이고, 무엇보다 **답이 매번 달라지면
 * 배우는 내용이 흔들린다.** 교과서가 매번 다른 말을 하면 안 되는 것과 같다.
 */

export interface CivicPlace {
  /** 주소에 쓰는 값이자 표의 열쇠 */
  kind: string;
  label: string;
  emoji: string;
  /** 건물 색 — 안에 들어가기 전에 밖에서도 구별된다 */
  color: string;
  /** 한 줄로: 여기가 무엇을 하는 곳인가 */
  oneLine: string;
  /** 안에서 만나는 사람들과 그 일 */
  people: { name: string; emoji: string; job: string }[];
  /** 아이가 실제로 할 수 있는 일 (여기 와야 되는 것) */
  todo: string[];
}

/**
 * 아는 기관들.
 *
 * **다 만들지 않았다.** 하나를 제대로 만들어 보고 늘리는 편이 낫다 —
 * 열 곳을 얕게 만들면 어느 곳도 배울 것이 없다.
 */
export const CIVIC_PLACES: CivicPlace[] = [
  {
    kind: 'townhall',
    label: '읍사무소·주민센터',
    emoji: '🏛️',
    color: '#8FA9C9',
    oneLine: '우리 동네 살림을 맡아보는 곳이에요. 서류를 떼고, 도움을 청하고, 마을 일을 의논해요.',
    people: [
      { name: '민원 담당', emoji: '🧑‍💼', job: '주민등록등본 같은 서류를 떼어 줘요. 이사하면 여기에 알려요.' },
      { name: '복지 담당', emoji: '🧑‍🦳', job: '어려운 이웃을 도와요. 어르신 돌봄, 아이 돌봄을 이어줘요.' },
      { name: '마을 담당', emoji: '🧑‍🌾', job: '마을 행사와 쓰레기·도로 같은 동네 일을 챙겨요.' },
    ],
    todo: [
      '이사하면 14일 안에 전입신고를 해요',
      '가족관계증명서·주민등록등본을 뗄 수 있어요',
      '동네에 고장 난 곳이 있으면 여기에 알려요',
    ],
  },
  {
    kind: 'post_office',
    label: '우체국',
    emoji: '📮',
    color: '#E8604C',
    oneLine: '편지와 물건을 먼 곳까지 보내주는 곳이에요. 돈을 맡길 수도 있어요.',
    people: [
      { name: '창구 직원', emoji: '🧑‍💼', job: '편지 무게를 재고 우표 값을 알려줘요. 소포도 여기서 부쳐요.' },
      { name: '집배원', emoji: '🛵', job: '편지와 택배를 집집마다 가져다줘요. 비가 와도 다녀요.' },
      { name: '분류 담당', emoji: '📦', job: '전국에서 온 우편물을 동네별로 나눠요.' },
    ],
    todo: [
      '편지에는 **받는 사람 주소와 우편번호**를 꼭 써요',
      '무거울수록, 멀수록 요금이 올라가요',
      '우체국에서는 돈을 맡기고 찾을 수도 있어요(우체국예금)',
    ],
  },
  {
    kind: 'police',
    label: '경찰서·지구대',
    emoji: '🚓',
    color: '#4A6FA5',
    oneLine: '우리를 지켜주는 곳이에요. 위험할 때, 길을 잃었을 때 찾아가요.',
    people: [
      { name: '지구대 경찰관', emoji: '👮', job: '신고를 받고 제일 먼저 달려와요. 동네를 순찰해요.' },
      { name: '교통 경찰관', emoji: '🦺', job: '차와 사람이 안전하게 다니도록 살펴요.' },
      { name: '수사관', emoji: '🕵️', job: '무슨 일이 있었는지 알아내요.' },
    ],
    todo: [
      '위험하면 **112**, 불이 나면 119 예요',
      '길을 잃으면 경찰관에게 도움을 청해요',
      '잃어버린 물건은 경찰서에 맡겨져 있을 수 있어요',
    ],
  },
  {
    kind: 'library',
    label: '도서관',
    emoji: '📚',
    color: '#7BA05B',
    oneLine: '책을 함께 나눠 읽는 곳이에요. 빌려서 집에 가져갈 수 있어요.',
    people: [
      { name: '사서 선생님', emoji: '🧑‍🏫', job: '책을 찾아주고, 어떤 책이 좋을지 알려줘요.' },
      { name: '대출 담당', emoji: '🧑‍💼', job: '책을 빌려주고 돌려받아요.' },
    ],
    todo: [
      '회원증을 만들면 책을 빌릴 수 있어요',
      '빌린 책은 **정해진 날까지** 돌려줘요',
      '도서관 안에서는 조용히 해요 — 다 같이 쓰는 곳이니까요',
    ],
  },
];

export const civicByKind = (kind: string): CivicPlace | undefined =>
  CIVIC_PLACES.find((p) => p.kind === kind);

/**
 * 이름으로도 알아본다.
 *
 * **한국 OSM 은 태그가 성기다.** 실제로 '애월읍사무소' 는 건물로만 잡혀 있고
 * `amenity=townhall` 이 안 붙어 있는 경우가 흔하다. 태그만 믿으면 눈앞에 있는
 * 읍사무소를 못 알아본다.
 *
 * 그래서 태그를 먼저 보고, 없으면 이름을 본다. 이름 규칙은 한국 기관 이름이
 * 대부분 뒤에 종류를 달고 있다는 점을 쓴다(…읍사무소, …우체국, …파출소).
 */
const NAME_HINTS: { kind: string; words: string[] }[] = [
  { kind: 'townhall', words: ['읍사무소', '면사무소', '동주민센터', '주민센터', '행정복지센터', '시청', '군청', '구청'] },
  { kind: 'post_office', words: ['우체국'] },
  { kind: 'police', words: ['경찰서', '파출소', '지구대', '치안센터'] },
  { kind: 'library', words: ['도서관'] },
];

/**
 * 이 건물이 어떤 기관인가. 아니면 `null`.
 *
 * **아무거나 갖다 붙이지 않는다.** 모르는 건물은 그냥 배경이다 —
 * 은행을 우체국이라고 알려주면 안 배우느니만 못하다.
 */
export function civicKindOf(b: { n?: string; k?: string }): string | null {
  if (b.k && civicByKind(b.k)) return b.k;
  const name = (b.n ?? '').replace(/\s+/g, '');
  if (!name) return null;
  for (const h of NAME_HINTS) {
    if (h.words.some((w) => name.includes(w))) return h.kind;
  }
  return null;
}
