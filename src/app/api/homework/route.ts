import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser, isStaffOfSchool, isTeacherOfClass } from '@/lib/firebase-admin';
import { getShopItem, STAMP_PER_HOMEWORK } from '@/lib/shop-catalog';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_TEXT = 2000;

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

  let body: { schoolId?: string; classId?: string; homeworkId?: string; text?: string; imageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, homeworkId } = body;
  if (!schoolId || !classId || !homeworkId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  // 교직원이 아니면 자기 반 숙제만 제출 가능
  if (!isStaffOfSchool(user, schoolId) && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 숙제가 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const hwRef = db
    .collection('schools').doc(schoolId)
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

  const subRef = hwRef.collection('submissions').doc(user.uid);
  // 이 doc은 통째로 덮어쓰므로, 재제출해도 남아야 하는 값은 직접 들고 넘어간다.
  // 특히 awarded 를 흘리면 제출→검사→재제출→재검사 로 도장을 무한히 캘 수 있다.
  const prev = (await subRef.get()).data();

  await subRef.set({
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
    // 다시 제출하면 검사는 처음부터 다시 (선생님이 옛 내용을 보고 검사한 셈이 되면 안 된다)
    checked: false,
    checkedAt: null,
    stamp: null,
    awarded: prev?.awarded === true,
    submittedAt: FieldValue.serverTimestamp(),
  });

  // 콕 찔린 뒤 제출했으면 찌르기 표시를 지운다
  await hwRef.collection('nudges').doc(user.uid).delete().catch(() => {});

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

/** 선생님: 코멘트 달기 / 보류 해제 / 비공개 전환 / 검사완료 / 콕 찌르기 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  let body: {
    schoolId?: string; classId?: string; homeworkId?: string; studentUid?: string;
    comment?: string; approve?: boolean; hide?: boolean;
    check?: boolean; nudge?: boolean; studentName?: string; stampId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, homeworkId, studentUid } = body;
  if (!schoolId || !classId || !homeworkId || !studentUid) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  // 담당 반만. 같은 학교라도 남의 반 제출물은 손대지 못한다.
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '담당하는 반이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const hwRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('homeworks').doc(homeworkId);
  const hwSnap = await hwRef.get();
  if (!hwSnap.exists) return NextResponse.json({ error: '숙제를 찾을 수 없습니다' }, { status: 404 });
  const hw = hwSnap.data() as { visibility: string; title?: string };

  // 콕 찌르기는 제출물이 없는 학생에게 보내는 것이라 submissions 를 건드리지 않는다
  if (body.nudge === true) {
    const nudgeRef = hwRef.collection('nudges').doc(studentUid);
    await nudgeRef.set(
      {
        studentUid,
        studentName: (body.studentName || '').slice(0, 50),
        count: FieldValue.increment(1),
        byName: user.displayName,
        lastAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection('accessLogs').add({
      uid: user.uid,
      displayName: user.displayName,
      role: user.role,
      action: '숙제 콕 찌르기',
      classId,
      detail: `${hw.title || homeworkId} → ${body.studentName || studentUid}`,
      ip: getClientIp(req.headers),
      userAgent: req.headers.get('user-agent') || 'unknown',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, nudged: true });
  }

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
  // 도장 도안은 선생님이 실제로 가지고 있는 것만 찍을 수 있다
  let stamp: { itemId: string; emoji: string; label: string } | null = null;
  if (typeof body.stampId === 'string' && body.stampId) {
    const item = getShopItem(body.stampId);
    if (!item || item.category !== 'stamp') {
      return NextResponse.json({ error: '없는 도장이에요' }, { status: 404 });
    }
    const owned = await db
      .collection('users').doc(user.uid)
      .collection('inventory').doc(item.id).get();
    if (!owned.exists) {
      return NextResponse.json({ error: '가지고 있지 않은 도장이에요' }, { status: 403 });
    }
    stamp = { itemId: item.id, emoji: item.emoji, label: item.label };
  }

  if (typeof body.check === 'boolean') {
    patch.checked = body.check;
    patch.checkedAt = body.check ? FieldValue.serverTimestamp() : null;
    // 검사를 취소해도 이미 준 도장은 회수하지 않는다. 받았다 뺏기면 아이가 상처받는다.
    if (body.check && stamp) patch.stamp = stamp;
    if (!body.check) patch.stamp = null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  // 없는 제출물에 set(merge) 하면 유령 문서가 생겨 그리드 집계가 틀어진다
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: '제출물을 찾을 수 없습니다' }, { status: 404 });
  }

  await subRef.set(patch, { merge: true });

  // 검사완료 첫 순간에만 도장을 준다. 재검사·도장 교체로 두 번 주지 않는다.
  let awarded = 0;
  if (body.check === true && subSnap.data()?.awarded !== true) {
    const studentRef = db.collection('users').doc(studentUid);
    try {
      await db.runTransaction(async (tx) => {
        const s = await tx.get(studentRef);
        if (!s.exists) throw new Error('NO_USER');
        const after = ((s.data()?.stamps as number) ?? 0) + STAMP_PER_HOMEWORK;
        tx.set(studentRef, { stamps: after }, { merge: true });
        tx.set(studentRef.collection('stampLedger').doc(), {
          amount: STAMP_PER_HOMEWORK,
          reason: `숙제 검사 — ${hw.title || homeworkId}`,
          refId: homeworkId,
          byName: user.displayName,
          balanceAfter: after,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(subRef, { awarded: true }, { merge: true });
      });
      awarded = STAMP_PER_HOMEWORK;
    } catch {
      // 지급에 실패해도 검사완료 자체는 유지한다 (선생님 손을 다시 빌리지 않는다)
      awarded = 0;
    }
  }

  return NextResponse.json({ ok: true, awarded });
}
