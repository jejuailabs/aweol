import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

const MAX_POINTS = 400;
const MAX_TEXT = 60;
const MAX_ITEMS = 400; // 칠판이 무한정 커지지 않도록

function isStaff(role: string | null) {
  return role === 'teacher' || role === 'super_admin';
}

/**
 * 칠판 낙서 쓰기.
 * 클라이언트가 직접 Firestore에 쓰지 않고 이 경로를 거치게 해서
 * (1) 작성자를 위조할 수 없게 하고 (2) 서버에서 IP를 남긴다.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }
  if (!user.role) {
    return NextResponse.json({ error: '역할이 지정되지 않았습니다' }, { status: 403 });
  }

  let body: {
    schoolId?: string;
    classId?: string;
    kind?: 'stroke' | 'text';
    points?: number[][];
    color?: string;
    width?: number;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, kind } = body;
  if (!schoolId || !classId || (kind !== 'stroke' && kind !== 'text')) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  // 학생은 자기 반 칠판에만 쓸 수 있다 (교직원은 모든 반)
  if (!isStaff(user.role) && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 칠판에 쓸 수 없습니다' }, { status: 403 });
  }

  const points = Array.isArray(body.points) ? body.points.slice(0, MAX_POINTS) : [];
  const validPoints = points.filter(
    (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1)
  );
  if (validPoints.length === 0) {
    return NextResponse.json({ error: '좌표가 없습니다' }, { status: 400 });
  }
  // Firestore는 중첩 배열을 저장할 수 없으므로 [x,y,x,y,...] 형태로 펴서 넣는다
  const flatPoints = validPoints.flat();

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  if (kind === 'text' && !text) {
    return NextResponse.json({ error: '내용이 비어 있습니다' }, { status: 400 });
  }

  const db = adminDb();
  const boardRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('blackboard');

  // 오래된 낙서부터 정리해서 상한 유지
  const countSnap = await boardRef.count().get();
  if (countSnap.data().count >= MAX_ITEMS) {
    const oldest = await boardRef.orderBy('createdAt', 'asc').limit(40).get();
    const batch = db.batch();
    oldest.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'unknown';

  const item = {
    kind,
    points: flatPoints,
    color: typeof body.color === 'string' ? body.color.slice(0, 16) : '#FFFFFF',
    width: typeof body.width === 'number' ? Math.max(1, Math.min(40, body.width)) : 4,
    ...(kind === 'text' ? { text } : {}),
    authorUid: user.uid,
    authorName: user.displayName,
    authorRole: user.role,
    createdAt: FieldValue.serverTimestamp(),
  };

  const created = await boardRef.add(item);

  // 계정 도용 추적용 로그 (슈퍼 관리자만 조회)
  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: kind === 'text' ? '칠판 글쓰기' : '칠판 낙서',
    classId,
    detail: kind === 'text' ? text : `${validPoints.length}점`,
    ip,
    userAgent,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, id: created.id });
}

/** 전체 지우기 — 교직원만 */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isStaff(user.role)) {
    return NextResponse.json({ error: '선생님만 전체 지우기를 할 수 있습니다' }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const schoolId = sp.get('schoolId');
  const classId = sp.get('classId');
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const db = adminDb();
  const boardRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('blackboard');

  let deleted = 0;
  // 배치 상한(500)을 넘길 수 있으므로 나눠서 지운다
  while (true) {
    const snap = await boardRef.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '칠판 전체 지우기',
    classId,
    detail: `${deleted}개 삭제`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, deleted });
}
