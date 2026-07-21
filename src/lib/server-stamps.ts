import type { Firestore } from 'firebase-admin/firestore';
import { getShopItem } from '@/lib/shop-catalog';

export interface StampMark {
  itemId: string;
  emoji: string;
  label: string;
  imageUrl?: string;
}

/** 도장을 못 찍는 이유. 부르는 쪽이 그대로 응답으로 바꾼다. */
export type StampError = { error: string; status: 403 | 404 };

/**
 * 찍으려는 도장이 **정말 이 선생님 것인지** 확인하고 찍을 값을 만든다.
 *
 * 숙제와 퀴즈 두 곳에서 도장을 찍는데, 각자 판단하면 한쪽만 고쳐져
 * '숙제에는 내 도장이 찍히는데 퀴즈에는 안 되는' 상태가 된다. 그래서 여기 하나만 둔다.
 *
 * 두 갈래다 —
 * - 상점 도안: 카탈로그에 있고 **인벤토리에 실제로 있어야** 한다.
 * - 직접 만든 도장(`custom-`): 자기 하위 컬렉션에서만 찾는다.
 *   남의 도장 id 를 보내도 자기 것만 뒤지므로 못 찾는다.
 *
 * 찍는 순간 값을 **복사**해 돌려준다. 나중에 선생님이 도장을 지워도
 * 아이가 받은 도장은 남아야 하기 때문이다.
 */
export async function resolveStamp(
  db: Firestore,
  uid: string,
  stampId: string
): Promise<StampMark | StampError> {
  if (stampId.startsWith('custom-')) {
    const mine = await db.collection('users').doc(uid).collection('stamps').doc(stampId).get();
    if (!mine.exists) return { error: '가지고 있지 않은 도장이에요', status: 403 };
    const v = mine.data() as { label?: string; imageUrl?: string };
    if (!v.imageUrl) return { error: '도장 그림이 없어요', status: 404 };
    return {
      itemId: stampId,
      emoji: '',
      label: (v.label || '내 도장').slice(0, 10),
      imageUrl: v.imageUrl,
    };
  }

  const item = getShopItem(stampId);
  if (!item || item.category !== 'stamp') return { error: '없는 도장이에요', status: 404 };
  const owned = await db.collection('users').doc(uid).collection('inventory').doc(item.id).get();
  if (!owned.exists) return { error: '가지고 있지 않은 도장이에요', status: 403 };
  return { itemId: item.id, emoji: item.emoji, label: item.label };
}

export function isStampError(v: StampMark | StampError): v is StampError {
  return 'error' in v;
}
