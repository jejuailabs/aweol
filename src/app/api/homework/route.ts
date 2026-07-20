import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SCHOOL_ID = 'aewol-elementary';
const MAX_TEXT = 2000;

function isStaff(role: string | null) {
  return role === 'teacher' || role === 'super_admin';
}

/**
 * 제출물 1차 검수.
 * 걸러지면 '거부'가 아니라 '보류'로 처리해 선생님이 최종 판단한다.
 * (초등학생 그림은 오탐이 잦아 자동 차단하면 아이가 상처받는다)
 */
async function moderate(text: string, imageUrl: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { flagged: false, reason: '' };

  const input: unknown[] = [];
  if (text) input.push({ type: 'text', text });
  if (imageUrl) input.push({ type: 'image_url', image_url: { url: imageUrl } });
  if (input.length === 0) return { flagged: false, reason: '' };

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    });
    if (!res.ok) return { flagged: false, reason: '' };
    const json = await res.json();
    const r = json.results?.[0];
    if (!r) return { flagged: false, reason: '' };
    const hit = Object.entries(r.categories || {})
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    return { flagged: !!r.flagged, reason: hit.join(', ') };
  } catch {
    // 검수 실패로 제출 자체를 막지는 않는다 (선생님이 어차피 보게 된다)
    return { flagged: false, reason: '' };
  }
}

/** 학생 제출 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!user.role) return NextResponse.json({ error: '역할이 지정되지 않았습니다' }, { status: 403 });

  let body: { classId?: string; homeworkId?: string; text?: string; imageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { classId, homeworkId } = body;
  if (!classId || !homeworkId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  // 교직원이 아니면 자기 반 숙제만 제출 가능
  if (!isStaff(user.role) && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 숙제가 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const hwRef = db
    .collection('schools').doc(SCHOOL_ID)
    .collection('classes').doc(classId)
    .collection('homeworks').doc(homeworkId);
  const hwSnap = await hwRef.get();
  if (!hwSnap.exists) return NextResponse.json({ error: '숙제를 찾을 수 없습니다' }, { status: 404 });
  const hw = hwSnap.data() as { submitType: string; visibility: string };

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : '';
  if (!text && !imageUrl) {
    return NextResponse.json({ error: '제출할 내용이 없습니다' }, { status: 400 });
  }

  const mod = await moderate(text, imageUrl);
  const status = mod.flagged ? 'held' : 'approved';

  await hwRef.collection('submissions').doc(user.uid).set({
    studentUid: user.uid,
    studentName: user.displayName,
    type: hw.submitType,
    text,
    imageUrl,
    status,
    moderation: mod,
    // 규칙에서 단일 조건으로 판정하려고 서버가 계산해 둔다
    publicToClass: hw.visibility === 'class' && status === 'approved',
    teacherComment: '',
    submittedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '숙제 제출',
    classId,
    detail: `${homeworkId}${mod.flagged ? ` · AI 보류(${mod.reason})` : ''}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    status,
    held: mod.flagged,
    reason: mod.reason,
  });
}

/** 선생님: 코멘트 달기 / 보류 해제 / 비공개 전환 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isStaff(user.role)) {
    return NextResponse.json({ error: '선생님만 할 수 있습니다' }, { status: 403 });
  }

  let body: {
    classId?: string; homeworkId?: string; studentUid?: string;
    comment?: string; approve?: boolean; hide?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { classId, homeworkId, studentUid } = body;
  if (!classId || !homeworkId || !studentUid) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const db = adminDb();
  const hwRef = db
    .collection('schools').doc(SCHOOL_ID)
    .collection('classes').doc(classId)
    .collection('homeworks').doc(homeworkId);
  const hwSnap = await hwRef.get();
  if (!hwSnap.exists) return NextResponse.json({ error: '숙제를 찾을 수 없습니다' }, { status: 404 });
  const hw = hwSnap.data() as { visibility: string };

  const subRef = hwRef.collection('submissions').doc(studentUid);
  const patch: Record<string, unknown> = {};

  if (typeof body.comment === 'string') {
    patch.teacherComment = body.comment.trim().slice(0, 500);
  }
  if (body.approve === true) {
    patch.status = 'approved';
    patch.publicToClass = hw.visibility === 'class';
  }
  if (body.hide === true) {
    patch.status = 'held';
    patch.publicToClass = false;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  await subRef.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}
