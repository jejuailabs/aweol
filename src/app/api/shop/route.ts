import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { getShopItem, isEquipSlot } from '@/lib/shop-catalog';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 상점.
 *
 * 잔액과 인벤토리는 규칙에서 클라이언트 쓰기를 막아두었고, 여기서만 움직인다.
 * 가격도 요청 본문이 아니라 서버 카탈로그에서 읽는다 — 아니면 0원에 사갈 수 있다.
 */

function isStaff(role: string | null) {
  return role === 'teacher' || role === 'super_admin';
}

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
    if (item.staffOnly && !isStaff(user.role)) {
      return NextResponse.json({ error: '선생님만 가질 수 있어요' }, { status: 403 });
    }

    const invRef = userRef.collection('inventory').doc(item.id);

    try {
      const balance = await db.runTransaction(async (tx) => {
        const [userSnap, invSnap] = await Promise.all([tx.get(userRef), tx.get(invRef)]);
        if (invSnap.exists) throw new Error('ALREADY_OWNED');

        const stamps = (userSnap.data()?.stamps as number) ?? 0;
        if (stamps < item.price) throw new Error('NOT_ENOUGH');
        const after = stamps - item.price;

        tx.set(invRef, {
          itemId: item.id,
          category: item.category,
          paid: item.price,
          acquiredAt: FieldValue.serverTimestamp(),
        });
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
      if (msg === 'NOT_ENOUGH') {
        return NextResponse.json({ error: '도장이 모자라요' }, { status: 400 });
      }
      return NextResponse.json({ error: '구입하지 못했어요' }, { status: 500 });
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
