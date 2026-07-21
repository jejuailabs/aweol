import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser, isStaffRole } from '@/lib/firebase-admin';
import { getShopItem, isEquipSlot } from '@/lib/shop-catalog';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 상점.
 *
 * 잔액과 인벤토리는 규칙에서 클라이언트 쓰기를 막아두었고, 여기서만 움직인다.
 * 가격도 요청 본문이 아니라 서버 카탈로그에서 읽는다 — 아니면 0원에 사갈 수 있다.
 */

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { action?: string; itemId?: string | null; slot?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const db = adminDb();
  const userRef = db.collection('users').doc(user.uid);

  // ---------- 구매 ----------
  if (body.action === 'buy') {
    const item = body.itemId ? getShopItem(body.itemId) : null;
    if (!item) return NextResponse.json({ error: '없는 물건이에요' }, { status: 404 });
    if (item.staffOnly && !isStaffRole(user.role)) {
      return NextResponse.json({ error: '선생님만 가질 수 있어요' }, { status: 403 });
    }

    const invRef = userRef.collection('inventory').doc(item.id);

    try {
      const balance = await db.runTransaction(async (tx) => {
        const [userSnap, invSnap] = await Promise.all([tx.get(userRef), tx.get(invRef)]);
        /**
         * 꾸미기 아이템은 하나만 가지면 되지만, 놀이 아이템은 쓰면 없어지므로
         * 여러 개 살 수 있어야 한다. 그래서 있으면 개수를 올린다.
         */
        if (invSnap.exists && !item.consumable) throw new Error('ALREADY_OWNED');

        const stamps = (userSnap.data()?.stamps as number) ?? 0;
        if (stamps < item.price) throw new Error('NOT_ENOUGH');
        const after = stamps - item.price;

        const prevCount = (invSnap.data()?.count as number) ?? 0;
        // 한 사람이 쟁여둘 수 있는 양을 묶어둔다. 없으면 도장을 몰아 사서
        // 한 판 내내 방패만 쓰는 아이가 나온다.
        if (item.consumable && prevCount >= 20) throw new Error('TOO_MANY');

        tx.set(invRef, {
          itemId: item.id,
          category: item.category,
          paid: item.price,
          ...(item.consumable ? { count: prevCount + 1 } : {}),
          acquiredAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        // 무료 품목이면 잔액을 건드리지 않는다 (내역에 0원 줄이 쌓이면 읽기 어렵다)
        if (item.price > 0) {
          tx.set(userRef, { stamps: after }, { merge: true });
          tx.set(userRef.collection('stampLedger').doc(), {
            amount: -item.price,
            reason: `${item.label} 구입`,
            refId: item.id,
            byName: user.displayName,
            balanceAfter: after,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return after;
      });

      return NextResponse.json({ ok: true, itemId: item.id, stamps: balance });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'ALREADY_OWNED') {
        return NextResponse.json({ error: '이미 가지고 있어요' }, { status: 409 });
      }
      if (msg === 'TOO_MANY') {
        return NextResponse.json({ error: '한 번에 20개까지만 가질 수 있어요' }, { status: 409 });
      }
      if (msg === 'NOT_ENOUGH') {
        return NextResponse.json({ error: '도장이 모자라요' }, { status: 400 });
      }
      return NextResponse.json({ error: '구입하지 못했어요' }, { status: 500 });
    }
  }

  /**
   * ---------- 놀이 아이템 쓰기 ----------
   *
   * **반드시 서버에서 깎는다.** 화면에서만 세면 개수를 안 가진 아이도
   * 계속 쓸 수 있고, 그러면 아이템을 산 아이만 손해다.
   */
  if (body.action === 'use') {
    const item = body.itemId ? getShopItem(body.itemId) : null;
    if (!item || !item.consumable) {
      return NextResponse.json({ error: '쓸 수 있는 물건이 아니에요' }, { status: 400 });
    }
    const invRef = userRef.collection('inventory').doc(item.id);

    try {
      const left = await db.runTransaction(async (tx) => {
        const snap = await tx.get(invRef);
        const count = (snap.data()?.count as number) ?? 0;
        if (count <= 0) throw new Error('NONE_LEFT');
        const after = count - 1;
        // 0개가 되면 줄을 지운다. 0 짜리가 남아 있으면 상점에 '가진 것' 으로 보인다.
        if (after === 0) tx.delete(invRef);
        else tx.set(invRef, { count: after }, { merge: true });
        return after;
      });
      return NextResponse.json({ ok: true, itemId: item.id, left });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'NONE_LEFT') {
        return NextResponse.json({ error: '남은 게 없어요' }, { status: 409 });
      }
      return NextResponse.json({ error: '쓰지 못했어요' }, { status: 500 });
    }
  }

  // ---------- 착용 / 해제 ----------
  if (body.action === 'equip') {
    if (!isEquipSlot(body.slot)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    // itemId 가 null 이면 해제
    if (body.itemId === null || body.itemId === '') {
      await userRef.set({ avatarCustom: { [body.slot]: null } }, { merge: true });
      return NextResponse.json({ ok: true, slot: body.slot, itemId: null });
    }

    const item = body.itemId ? getShopItem(body.itemId) : null;
    if (!item) return NextResponse.json({ error: '없는 물건이에요' }, { status: 404 });
    if (item.category !== body.slot) {
      return NextResponse.json({ error: '거기에 낄 수 없는 물건이에요' }, { status: 400 });
    }

    const invSnap = await userRef.collection('inventory').doc(item.id).get();
    if (!invSnap.exists) {
      return NextResponse.json({ error: '아직 가지고 있지 않아요' }, { status: 403 });
    }

    await userRef.set({ avatarCustom: { [body.slot]: item.id } }, { merge: true });
    return NextResponse.json({ ok: true, slot: body.slot, itemId: item.id });
  }

  return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
}
