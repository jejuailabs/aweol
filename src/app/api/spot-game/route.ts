import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, getClientIp, verifyRequestUser, isStaffOfSchool } from '@/lib/firebase-admin';
import { storagePathFromUrl } from '@/lib/storage-path';
import { compressImage } from '@/lib/image-compress';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 틀린그림 찾기.
 *
 * 퀴즈와 같은 원칙 — **정답 좌표가 클라이언트로 내려가면 안 된다.**
 * 좌표를 내려주면 개발자도구로 답을 다 보고 1초 만에 끝낼 수 있다.
 * 그래서 좌표는 answerKey 에 따로 두고(교직원만 읽기), 맞았는지 판정도 여기서 한다.
 *
 * 시간도 클라이언트가 보내는 값을 믿지 않는다. 시작·완료 시각을 서버가 찍는다.
 */

const MAX_SPOTS = 10;
const MIN_SPOTS = 1;

type Spot = { x: number; y: number; r: number };

function cleanSpots(raw: unknown): Spot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Spot[] = [];
  for (const s of raw.slice(0, MAX_SPOTS)) {
    const x = Number((s as Spot)?.x);
    const y = Number((s as Spot)?.y);
    const r = Number((s as Spot)?.r);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    out.push({
      x,
      y,
      // 반경은 아이 손가락을 감안해 최소치를 준다. 너무 작으면 맞아도 안 맞는다.
      r: Number.isFinite(r) ? Math.min(0.2, Math.max(0.04, r)) : 0.07,
    });
  }
  return out.length >= MIN_SPOTS ? out : null;
}

async function saveImage(dataUrl: string, path: string): Promise<string> {
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const small = await compressImage(buf, 1024, 85);
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const file = bucket.file(`${path}.${small.ext}`);
  await file.save(small.buffer, { contentType: small.contentType, resumable: false });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${file.name}`;
}

/** 교사: 게임 만들기 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: {
    schoolId?: string; classId?: string; title?: string;
    originalDataUrl?: string; variantDataUrl?: string;
    layout?: string; spots?: unknown; visibility?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId } = body;
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  if (!isStaffOfSchool(user, schoolId)) {
    return NextResponse.json({ error: '이 학교의 선생님이 아닙니다' }, { status: 403 });
  }

  const title = (body.title || '').trim().slice(0, 100);
  if (!title) return NextResponse.json({ error: '제목을 넣어주세요' }, { status: 400 });

  const spots = cleanSpots(body.spots);
  if (!spots) {
    return NextResponse.json({ error: '다른 곳을 하나 이상 찍어주세요' }, { status: 400 });
  }
  if (!body.originalDataUrl?.startsWith('data:image/') || !body.variantDataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: '두 그림이 모두 필요합니다' }, { status: 400 });
  }

  const db = adminDb();
  const gameRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('spotGames').doc();

  let originalUrl = '';
  let variantUrl = '';
  try {
    originalUrl = await saveImage(body.originalDataUrl, `spot/${user.uid}/${gameRef.id}-a`);
    variantUrl = await saveImage(body.variantDataUrl, `spot/${user.uid}/${gameRef.id}-b`);
  } catch (e) {
    return NextResponse.json(
      { error: `그림 저장 실패: ${(e as Error).message.slice(0, 120)}` },
      { status: 500 }
    );
  }

  const batch = db.batch();
  batch.set(gameRef, {
    title,
    originalUrl,
    variantUrl,
    layout: body.layout === 'horizontal' ? 'horizontal' : 'vertical',
    // 개수는 공개해야 아이가 몇 개 남았는지 안다. 좌표만 숨긴다.
    spotCount: spots.length,
    visibility: body.visibility === 'teacher' ? 'teacher' : 'class',
    authorUid: user.uid,
    authorName: user.displayName,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(gameRef.collection('answerKey').doc('spots'), { spots });
  await batch.commit();

  return NextResponse.json({ ok: true, gameId: gameRef.id, spotCount: spots.length });
}

/** 학생: 시작 / 찍기 */
export async function PUT(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!user.role) return NextResponse.json({ error: '역할이 지정되지 않았습니다' }, { status: 403 });

  let body: {
    schoolId?: string; classId?: string; gameId?: string;
    action?: string; x?: number; y?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, gameId } = body;
  if (!schoolId || !classId || !gameId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  if (!isStaffOfSchool(user, schoolId) && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 놀이가 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const gameRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('spotGames').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) return NextResponse.json({ error: '놀이를 찾을 수 없습니다' }, { status: 404 });

  const playRef = gameRef.collection('plays').doc(user.uid);

  // ---------- 시작 ----------
  if (body.action === 'start') {
    const cur = await playRef.get();
    // 이미 끝냈으면 다시 시작해 기록을 갈아치울 수 없다
    if (cur.exists && cur.data()?.completedAt) {
      return NextResponse.json({ error: '이미 다 찾았어요', done: true }, { status: 409 });
    }
    if (!cur.exists) {
      await playRef.set({
        studentUid: user.uid,
        studentName: user.displayName,
        found: [],
        misses: 0,
        seconds: null,
        startedAt: FieldValue.serverTimestamp(),
        completedAt: null,
      });
    }
    const fresh = await playRef.get();
    return NextResponse.json({ ok: true, found: fresh.data()?.found ?? [], misses: fresh.data()?.misses ?? 0 });
  }

  // ---------- 찍기 ----------
  if (body.action === 'tap') {
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const [keySnap, playSnap] = await Promise.all([
      gameRef.collection('answerKey').doc('spots').get(),
      playRef.get(),
    ]);
    if (!playSnap.exists) {
      return NextResponse.json({ error: '먼저 시작해주세요' }, { status: 409 });
    }
    const play = playSnap.data() || {};
    if (play.completedAt) {
      return NextResponse.json({ ok: true, done: true, seconds: play.seconds ?? null });
    }

    const spots = (keySnap.data()?.spots as Spot[]) || [];
    const found: number[] = play.found || [];

    let hitIndex = -1;
    for (let i = 0; i < spots.length; i++) {
      if (found.includes(i)) continue;
      const d = Math.hypot(spots[i].x - x, spots[i].y - y);
      if (d <= spots[i].r) { hitIndex = i; break; }
    }

    if (hitIndex < 0) {
      await playRef.set({ misses: FieldValue.increment(1) }, { merge: true });
      return NextResponse.json({ ok: true, hit: false });
    }

    const nextFound = [...found, hitIndex];
    const done = nextFound.length >= spots.length;

    // 시간은 서버가 잰다. 클라이언트가 보내는 값을 믿으면 순위표가 의미 없어진다.
    let seconds: number | null = null;
    if (done) {
      const started = play.startedAt?.toDate?.() as Date | undefined;
      seconds = started ? Math.max(1, Math.round((Date.now() - started.getTime()) / 1000)) : null;
    }

    await playRef.set(
      done
        ? { found: nextFound, seconds, completedAt: FieldValue.serverTimestamp() }
        : { found: nextFound },
      { merge: true }
    );

    // 정답 좌표는 돌려주지 않는다. 맞은 자리는 아이가 방금 찍은 곳이라 이미 안다.
    return NextResponse.json({
      ok: true,
      hit: true,
      index: hitIndex,
      spot: { x: spots[hitIndex].x, y: spots[hitIndex].y, r: spots[hitIndex].r },
      foundCount: nextFound.length,
      total: spots.length,
      done,
      seconds,
    });
  }

  return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
}

/** 교사: 삭제 */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const schoolId = sp.get('schoolId') || '';
  const classId = sp.get('classId') || '';
  const gameId = sp.get('gameId') || '';
  if (!schoolId || !classId || !gameId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  if (!isStaffOfSchool(user, schoolId)) {
    return NextResponse.json({ error: '이 학교의 선생님이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const gameRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('spotGames').doc(gameId);
  const snap = await gameRef.get();
  if (!snap.exists) return NextResponse.json({ error: '놀이를 찾을 수 없습니다' }, { status: 404 });

  // 그림도 함께 지운다. 문서만 지우면 Storage 에 사진만 남는다.
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  for (const url of [snap.data()?.originalUrl, snap.data()?.variantUrl]) {
    const path = storagePathFromUrl(url || '');
    if (path.startsWith('spot/')) await bucket.file(path).delete().catch(() => {});
  }

  for (const sub of ['answerKey', 'plays']) {
    const s = await gameRef.collection(sub).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  await gameRef.delete();

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '틀린그림 삭제',
    classId,
    detail: (snap.data()?.title as string) || gameId,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
