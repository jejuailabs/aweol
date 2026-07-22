/**
 * 상점 카탈로그.
 *
 * 서버(가격·보유 검증)와 클라이언트(진열)가 **같은 목록**을 봐야 하므로 여기 한 곳에만 둔다.
 * 가격을 클라이언트에서 받으면 0원에 사갈 수 있으니, /api/shop 은 항상 이 파일의 값을 쓴다.
 *
 * 아바타 아이템은 3D(`components/gallery3d/walker.tsx`)가 실제로 그릴 수 있는 것만 넣는다.
 * 살 수는 있는데 껴도 안 보이면 아이 입장에서는 도장을 버린 셈이 된다.
 */

export type ShopCategory = 'hat' | 'accessory' | 'stamp' | 'play' | 'vehicle';

export interface ShopItem {
  id: string;
  emoji: string;
  label: string;
  /** 도장 개수. 0이면 무료 */
  price: number;
  category: ShopCategory;
  /** 교사 전용 품목(도장 도안)은 학생 상점에 보이지 않는다 */
  staffOnly?: boolean;
  /**
   * 쓰면 없어지는 물건인가.
   *
   * 꾸미기 아이템은 한 번 사면 계속 가진다. 놀이 아이템은 쓰면 없어져서
   * **도장을 계속 쓸 데가 생긴다** — 지금까지는 꾸미기 몇 개 사고 나면
   * 도장이 쌓이기만 하고 쓸 곳이 없었다.
   */
  consumable?: boolean;
  /** 아이 화면에 붙는 설명 */
  desc?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  /**
   * ---------- 놀이 아이템 (쓰면 없어짐) ----------
   *
   * 숙제를 내고 검사를 받으면 도장이 쌓이고, 그 도장으로 이걸 산다.
   * **숙제를 안 했다고 못 노는 게 아니다** — 놀이는 누구나 그냥 할 수 있고,
   * 이건 얹어지는 재미다. 집 사정으로 숙제를 못 하는 아이가 놀이에서까지
   * 밀리면 안 된다. 그래서 값도 싸게 잡았다(숙제 두세 번이면 산다).
   */
  {
    id: 'play-shoes', emoji: '🥾', label: '바람의 신발', price: 2, category: 'play',
    consumable: true, desc: '술래잡기 한 판 동안 더 빨리 달려요',
  },
  {
    id: 'play-shield', emoji: '🛡️', label: '튼튼 방패', price: 3, category: 'play',
    consumable: true, desc: '잡혀도 한 번은 술래를 되돌려줘요',
  },
  /**
   * 달리기에는 **빨라지는 아이템을 넣지 않았다.**
   * 순위표가 걸린 놀이라 아이템을 산 아이가 빨라지면 기록이 의미를 잃는다.
   * 대신 실수를 한 번 봐주는 것으로 뒀다 — 시간에는 손대지 않는다.
   */
  {
    id: 'play-cloud', emoji: '🩹', label: '구름 신발', price: 2, category: 'play',
    consumable: true, desc: '달리기에서 선을 한 번 밟아도 봐줘요 (기록은 그대로)',
  },
  {
    id: 'play-lens', emoji: '🔍', label: '돋보기', price: 2, category: 'play',
    consumable: true, desc: '틀린그림에서 한 곳을 알려줘요 (쓴 표시가 남아요)',
  },

  /**
   * 탈것 — 마을에서 학교 밖으로 나갔을 때 탄다.
   *
   * 소모품이 아니다. **한 번 사면 계속 탄다.** 속도만 다르다(빠를수록 비싸다).
   * 순위표가 걸린 놀이가 아니라 탐험이라, 빨라져도 아무한테도 손해가 없다.
   * 속도 값은 여기 안 둔다 — `village-travel.ts` 의 VEHICLES 한 곳에서만 정한다.
   */
  { id: 'vehicle-scooter', emoji: '🛴', label: '킥보드', price: 6, category: 'vehicle',
    desc: '자동차보다 빨라요' },
  { id: 'vehicle-rocket', emoji: '🚀', label: '로켓카', price: 15, category: 'vehicle',
    desc: '아주 빨라요! 마을 끝까지 금방' },

  // ---------- 모자 ----------
  { id: 'hat-cap', emoji: '🧢', label: '야구모자', price: 2, category: 'hat' },
  { id: 'hat-ribbon', emoji: '🎀', label: '리본', price: 2, category: 'hat' },
  { id: 'hat-beret', emoji: '🎩', label: '베레모', price: 3, category: 'hat' },
  { id: 'hat-crown', emoji: '👑', label: '왕관', price: 10, category: 'hat' },

  // ---------- 액세서리 ----------
  { id: 'acc-balloon', emoji: '🎈', label: '풍선', price: 2, category: 'accessory' },
  { id: 'acc-glasses', emoji: '👓', label: '안경', price: 3, category: 'accessory' },
  { id: 'acc-brush', emoji: '🖌️', label: '요술 붓', price: 5, category: 'accessory' },
  { id: 'acc-star', emoji: '🌟', label: '반짝별', price: 8, category: 'accessory' },

  // ---------- 선생님 도장 도안 (지금은 전부 무료 샘플) ----------
  { id: 'stamp-great', emoji: '💮', label: '참 잘했어요', price: 0, category: 'stamp', staffOnly: true },
  { id: 'stamp-thanks', emoji: '💛', label: '고마워요', price: 0, category: 'stamp', staffOnly: true },
  { id: 'stamp-grateful', emoji: '🙏', label: '감사해요', price: 0, category: 'stamp', staffOnly: true },
  { id: 'stamp-best', emoji: '🌟', label: '최고예요', price: 0, category: 'stamp', staffOnly: true },
];

export const SHOP_ITEM_BY_ID: Record<string, ShopItem> = Object.fromEntries(
  SHOP_ITEMS.map((i) => [i.id, i])
);

export const getShopItem = (id: string): ShopItem | null => SHOP_ITEM_BY_ID[id] ?? null;

/** 아바타에 착용하는 두 칸. 도장 도안은 착용 대상이 아니다. */
/**
 * 몸에 지니는 칸.
 *
 * `vehicle` 도 넣는다 — 탈것도 '가진 것만 고를 수 있어야' 하므로 착용과
 * 똑같이 다룬다(서버가 인벤토리를 확인한다). 다만 화면에 그리는 건 아바타가
 * 아니라 마을의 자동차다.
 */
export type EquipSlot = 'hat' | 'accessory' | 'vehicle';

export const isEquipSlot = (v: unknown): v is EquipSlot =>
  v === 'hat' || v === 'accessory' || v === 'vehicle';

/** 숙제 검사완료 한 번에 아이가 받는 도장 수 */
export const STAMP_PER_HOMEWORK = 1;
