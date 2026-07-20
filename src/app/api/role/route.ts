import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 역할 신청과 승인.
 *
 * 예전에는 가입 화면이 users 문서에 role 을 직접 써넣었다. 그래서 아무나 '선생님'을 골라
 * 명부(아이들 이름·학생코드)와 전 제출물을 열람하고 도장까지 발행할 수 있었다.
 * 이제 role 은 규칙에서 클라이언트 쓰기를 막아두었고 여기서만 정한다.
 *
 * - 학생·학부모: 바로 부여한다. 어차피 학생코드가 없으면 반에 들어가지 못한다.
 * - 교사: pendingRole 로 접수만 하고, 슈퍼관리자가 승인해야 role 이 된다.
 */

/** 학생·학부모는 즉시 부여, 교사는 승인 대기 */
const SELF_SERVE = new Set(['student', 'parent']);
const NEEDS_APPROVAL = new Set(['teacher']);

/** 본인 역할 신청 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const role = body.role || '';
  if (!SELF_SERVE.has(role) && !NEEDS_APPROVAL.has(role)) {
    // super_admin 은 신청 대상이 아니다. 콘솔에서 직접 지정한다.
    return NextResponse.json({ error: '고를 수 없는 역할입니다' }, { status: 400 });
  }

  // 이미 역할이 있는 계정은 재신청으로 승격할 수 없다
  if (user.role) {
    return NextResponse.json({ error: '이미 역할이 정해져 있습니다' }, { status: 409 });
  }

  const db = adminDb();
  const ref = db.collection('users').doc(user.uid);

  if (SELF_SERVE.has(role)) {
    await ref.set({ role, pendingRole: null, classIds: [] }, { merge: true });
    return NextResponse.json({ ok: true, role, pending: false });
  }

  await ref.set({ role: null, pendingRole: role, classIds: [] }, { merge: true });

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: null,
    action: '교사 신청',
    classId: null,
    detail: user.displayName,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, role: null, pending: true });
}

/** 슈퍼관리자의 승인 / 거절 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: '총관리자만 할 수 있습니다' }, { status: 403 });
  }

  let body: { uid?: string; approve?: boolean; reject?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const uid = body.uid || '';
  if (!uid) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  if (body.approve !== true && body.reject !== true) {
    return NextResponse.json({ error: '승인 또는 거절을 지정해야 합니다' }, { status: 400 });
  }

  const db = adminDb();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  const target = snap.data() || {};
  // 신청하지 않은 계정을 임의로 승격시킬 수 없다
  if (!target.pendingRole) {
    return NextResponse.json({ error: '신청 중인 계정이 아닙니다' }, { status: 409 });
  }

  const granted = body.approve === true ? (target.pendingRole as string) : null;
  await ref.set(
    granted
      ? { role: granted, pendingRole: null }
      : { pendingRole: null },
    { merge: true }
  );

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: granted ? '교사 승인' : '교사 거절',
    classId: null,
    detail: `${target.displayName || uid}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, uid, role: granted });
}
