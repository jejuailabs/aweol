/**
 * 상점 카탈로그.
 *
 * 서버(가격·보유 검증)와 클라이언트(진열)가 **같은 목록**을 봐야 하므로 여기 한 곳에만 둔다.
 * 가격을 클라이언트에서 받으면 0원에 사갈 수 있으니, /api/shop 은 항상 이 파일의 값을 쓴다.
 *
 * 아바타 아이템은 3D(`components/gallery3d/walker.tsx`)가 실제로 그릴 수 있는 것만 넣는다.
 * 살 수는 있는데 껴도 안 보이면 아이 입장에서는 도장을 버린 셈이 된다.
 */

export type ShopCategory = 'hat' | 'accessory' | 'stamp';

export interface ShopItem {
  id: string;
  emoji: string;
  label: string;
  /** 도장 개수. 0이면 무료 */
  price: number;
  category: ShopCategory;
  /** 교사 전용 품목(도장 도안)은 학생 상점에 보이지 않는다 */
  staffOnly?: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
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
export type EquipSlot = 'hat' | 'accessory';

export const isEquipSlot = (v: unknown): v is EquipSlot => v === 'hat' || v === 'accessory';

/** 숙제 검사완료 한 번에 아이가 받는 도장 수 */
export const STAMP_PER_HOMEWORK = 1;
