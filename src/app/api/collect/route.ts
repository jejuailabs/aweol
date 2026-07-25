import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { PER_SPOT, STAMPS_PER_SPOT } from '@/lib/village-collect';
import { spotById } from '@/lib/village-spots';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 한 자리를 다 모았을 때 주는 상.
 *
 * **도장은 서버만 준다.** 규칙에서 `stamps` 를 막아둔 것과 같은 이유다 —
 * 화면이 잔액을 쓸 수 있으면 9999 를 써넣고 상점을 턴다.
 *
 * ---
 *
 * **얼마나 믿는가.**
 *
 * 주운 목록(`picked`)은 아이가 직접 적는다(규칙이 그렇게 열려 있다).
 * 그래서 "다 주웠다" 는 말 자체는 서버가 확인할 수 없다 —
 * 조사 기록에서 "다녀왔다" 를 믿는 것과 같은 선이다.
 *
 * 대신 **얻을 수 있는 것을 아주 작게** 만들어 둔다:
 * 한 자리에 도장 하나, 자리마다 딱 한 번. 자리가 셋이면 평생 세 개다.
 * 숙제 세 번이면 받는 양이라, 이걸 노리고 거짓말할 값어치가 없다.
 * **막을 수 없으면 값어치를 없앤다.**
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { spotId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const spotId = (body.spotId || '').trim();
  const spot = spotById(spotId);
  if (!spot) return NextResponse.json({ error: '모르는 자리예요' }, { status: 400 });

  const db = adminDb();
  const userRef = db.collection('users').doc(user.uid);
  const colRef = userRef.collection('collect').doc('village');

  try {
    const result = await db.runTransaction(async (tx) => {
      const [colSnap, userSnap] = await Promise.all([tx.get(colRef), tx.get(userRef)]);
      const data = colSnap.data() ?? {};
      const picked: string[] = data.picked ?? [];
      const rewarded: string[] = data.rewarded ?? [];

      if (rewarded.includes(spotId)) throw new Error('ALREADY');

      const mine = picked.filter((p) => p.startsWith(`${spotId}-`)).length;
      if (mine < PER_SPOT) throw new Error('NOT_YET');

      const stamps = (userSnap.data()?.stamps as number) ?? 0;
      const after = stamps + STAMPS_PER_SPOT;

      tx.set(colRef, { rewarded: FieldValue.arrayUnion(spotId) }, { merge: true });
      tx.set(userRef, { stamps: after }, { merge: true });
      tx.set(userRef.collection('stampLedger').doc(), {
        amount: STAMPS_PER_SPOT,
        reason: `${spot.name} 다 모으기`,
        refId: `collect-${spotId}`,
        byName: '마을 조사대',
        balanceAfter: after,
        createdAt: FieldValue.serverTimestamp(),
      });
      return after;
    });

    return NextResponse.json({ ok: true, stamps: result, got: STAMPS_PER_SPOT });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'ALREADY') {
      return NextResponse.json({ error: '이미 받았어요' }, { status: 409 });
    }
    if (msg === 'NOT_YET') {
      return NextResponse.json({ error: '아직 다 못 모았어요' }, { status: 400 });
    }
    return NextResponse.json({ error: '상을 주지 못했어요' }, { status: 500 });
  }
}
