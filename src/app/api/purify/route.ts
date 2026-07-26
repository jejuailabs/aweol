import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { MOBS_PER_SPOT, STAMPS_PER_SPOT } from '@/lib/village-mobs';
import { spotById } from '@/lib/village-spots';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 한 자리를 다 치웠을 때 주는 상.
 *
 * **줍기(`/api/collect`)와 같은 선을 지킨다.** 도장은 서버만 준다.
 *
 * ---
 *
 * **얼마나 믿는가.**
 *
 * 정화 기록(`cleared`)은 아이가 직접 적는다(규칙이 그렇게 열려 있다).
 * 전투는 화면에서 일어나므로 서버가 "정말 열두 마리를 베었나" 를
 * 확인할 방법이 없다 — 조사 기록에서 "다녀왔다" 를 믿는 것과 같은 선이다.
 *
 * 대신 **얻을 수 있는 것을 아주 작게** 만들어 둔다:
 * 한 자리에 도장 하나, 자리마다 딱 한 번. 자리가 셋이면 평생 세 개다.
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
  const purRef = userRef.collection('purify').doc('village');

  try {
    const result = await db.runTransaction(async (tx) => {
      const [purSnap, userSnap] = await Promise.all([tx.get(purRef), tx.get(userRef)]);
      const data = purSnap.data() ?? {};
      const cleared: string[] = data.cleared ?? [];
      const rewarded: string[] = data.rewarded ?? [];

      if (rewarded.includes(spotId)) throw new Error('ALREADY');

      const mine = cleared.filter((c) => c.startsWith(`${spotId}-`)).length;
      if (mine < MOBS_PER_SPOT) throw new Error('NOT_YET');

      const stamps = (userSnap.data()?.stamps as number) ?? 0;
      const after = stamps + STAMPS_PER_SPOT;

      tx.set(purRef, { rewarded: FieldValue.arrayUnion(spotId) }, { merge: true });
      tx.set(userRef, { stamps: after }, { merge: true });
      tx.set(userRef.collection('stampLedger').doc(), {
        amount: STAMPS_PER_SPOT,
        reason: `${spot.name} 깨끗하게 만들기`,
        refId: `purify-${spotId}`,
        byName: '마을 정화대',
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
      return NextResponse.json({ error: '아직 다 못 치웠어요' }, { status: 400 });
    }
    return NextResponse.json({ error: '상을 주지 못했어요' }, { status: 500 });
  }
}
