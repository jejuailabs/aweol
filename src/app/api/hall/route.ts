import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';
import { HALL_THEMES, LIMITS, MAX_HALLS_PER_USER, type HallTheme } from '@/lib/art-hall';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 개인 전시관 — **만들기·공개·지우기만** 여기서 한다.
 *
 * 제목을 고치고 작품을 거는 것은 규칙(firestore.rules)이 주인만 통과시키므로
 * 화면이 바로 쓴다. 서버를 거칠 이유가 없고, 거치면 요금만 든다.
 *
 * 여기 세 가지는 규칙으로 못 하는 일이다.
 * · **만들기** — 한 사람이 몇 개까지인지 세야 한다. 규칙은 개수를 못 센다.
 * · **공개** — 전시관·전시·작품 세 층을 한꺼번에 뒤집어야 한다.
 * · **지우기** — 하위 문서까지 딸려 지워야 한다. 규칙은 한 문서만 본다.
 */

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** 전시관·전시·작품 세 층의 `isPublic` 을 한꺼번에 맞춘다 */
async function cascadePublic(hallId: string, isPublic: boolean) {
  const db = adminDb();
  const hallRef = db.collection('halls').doc(hallId);
  const shows = await hallRef.collection('shows').get();

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0; }
  };

  batch.set(hallRef, { isPublic, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  ops++;

  for (const s of shows.docs) {
    batch.set(s.ref, { isPublic }, { merge: true });
    if (++ops >= 400) await flush();
    const works = await s.ref.collection('works').get();
    for (const w of works.docs) {
      batch.set(w.ref, { isPublic }, { merge: true });
      if (++ops >= 400) await flush();
    }
  }
  await flush();
}

/** 전시관 하나를 하위 문서까지 지운다 */
async function deleteHall(hallId: string) {
  const db = adminDb();
  const hallRef = db.collection('halls').doc(hallId);
  const shows = await hallRef.collection('shows').get();

  for (const s of shows.docs) {
    // 작품이 많을 수 있으므로 나눠 지운다 (배치 상한 500)
    while (true) {
      const works = await s.ref.collection('works').limit(400).get();
      if (works.empty) break;
      const b = db.batch();
      works.docs.forEach((w) => b.delete(w.ref));
      await b.commit();
      if (works.size < 400) break;
    }
    await s.ref.delete();
  }
  await hallRef.delete();
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  /**
   * **아이는 개인 전시관을 쓰지 않는다.**
   *
   * 화면에서 단추를 감추고 규칙이 읽기를 막지만, 이 경로는 화면 없이도 부를 수 있다.
   * 여기를 안 막으면 아이 계정으로 전시관을 만들어 지도에 세울 수 있다 —
   * 규칙은 만들기를 서버에만 맡겨 두었으므로(`allow create: if false`)
   * **막을 자리가 여기뿐이다.**
   */
  if (user.role === 'student') {
    return NextResponse.json(
      { error: '개인 전시관은 선생님과 어른들이 쓰는 곳이에요' },
      { status: 403 }
    );
  }

  let body: {
    action?: string;
    hallId?: string;
    isPublic?: boolean;
    title?: string;
    tagline?: string;
    placeName?: string;
    theme?: string;
    lat?: number;
    lng?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const db = adminDb();

  // ---------- 만들기 ----------
  if (body.action === 'create') {
    const title = str(body.title, LIMITS.title);
    if (!title) return NextResponse.json({ error: '전시관 이름이 필요해요' }, { status: 400 });

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: '지도에서 자리를 골라주세요' }, { status: 400 });
    }
    /**
     * 지구 밖 좌표를 막는다. 화면에서 고르면 늘 맞지만, 이 경로는
     * 화면 없이도 부를 수 있다 — 엉뚱한 값이 들어오면 지도가 깨진다.
     */
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: '자리가 지도 밖이에요' }, { status: 400 });
    }

    // 한 사람이 지도에 몇 개까지 — 규칙으로는 셀 수 없어서 여기서 센다
    const mine = await db.collection('halls').where('ownerUid', '==', user.uid).count().get();
    if (mine.data().count >= MAX_HALLS_PER_USER) {
      return NextResponse.json(
        { error: `전시관은 ${MAX_HALLS_PER_USER}개까지 열 수 있어요` },
        { status: 409 }
      );
    }

    const theme: HallTheme = (body.theme as HallTheme) in HALL_THEMES
      ? (body.theme as HallTheme)
      : 'white';

    const ref = db.collection('halls').doc();
    await ref.set({
      ownerUid: user.uid,
      ownerName: user.displayName,
      title,
      tagline: str(body.tagline, LIMITS.tagline),
      intro: '',
      lat,
      lng,
      placeName: str(body.placeName, LIMITS.placeName),
      coverUrl: '',
      theme,
      /**
       * **처음에는 감춰 둔다.**
       * 만들자마자 지도에 뜨면, 아직 아무것도 안 건 빈 전시관이 남에게 보인다.
       * 걸 것을 다 걸고 주인이 직접 연다.
       */
      isPublic: false,
      showCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('accessLogs').add({
      uid: user.uid,
      displayName: user.displayName,
      role: user.role,
      action: '전시관 개설',
      classId: null,
      detail: `${title} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      ip: getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || 'unknown',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, hallId: ref.id });
  }

  // ---------- 공개 / 감추기 ----------
  if (body.action === 'publish') {
    const hallId = str(body.hallId, 64);
    if (!hallId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    const snap = await db.collection('halls').doc(hallId).get();
    if (!snap.exists) return NextResponse.json({ error: '전시관을 찾을 수 없어요' }, { status: 404 });
    if (snap.data()?.ownerUid !== user.uid && user.role !== 'super_admin') {
      return NextResponse.json({ error: '내 전시관만 고칠 수 있어요' }, { status: 403 });
    }

    const isPublic = body.isPublic === true;
    await cascadePublic(hallId, isPublic);
    return NextResponse.json({ ok: true, isPublic });
  }

  // ---------- 지우기 ----------
  if (body.action === 'delete') {
    const hallId = str(body.hallId, 64);
    if (!hallId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    const snap = await db.collection('halls').doc(hallId).get();
    if (!snap.exists) return NextResponse.json({ error: '전시관을 찾을 수 없어요' }, { status: 404 });
    if (snap.data()?.ownerUid !== user.uid && user.role !== 'super_admin') {
      return NextResponse.json({ error: '내 전시관만 지울 수 있어요' }, { status: 403 });
    }

    await deleteHall(hallId);

    await db.collection('accessLogs').add({
      uid: user.uid,
      displayName: user.displayName,
      role: user.role,
      action: '전시관 삭제',
      classId: null,
      detail: String(snap.data()?.title ?? hallId),
      ip: getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || 'unknown',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
}
