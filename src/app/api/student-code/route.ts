import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser, isTeacherOfClass } from '@/lib/firebase-admin';

export const runtime = 'nodejs';


// 0/O, 1/I/L 처럼 헷갈리는 글자는 뺀다 (초등학생이 손으로 받아 적는다)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function makeCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/**
 * 학생·학부모가 코드를 입력해 계정을 명부와 연결한다.
 * 코드 역인덱스는 클라이언트가 읽을 수 없으므로 반드시 이 경로를 거친다.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = body.schoolId || '';
  if (!schoolId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  const code = (body.code || '').trim().toUpperCase();
  if (code.length !== CODE_LEN) {
    return NextResponse.json({ error: '코드는 6자리예요' }, { status: 400 });
  }

  const db = adminDb();
  const codeRef = db.collection('schools').doc(schoolId).collection('studentCodes').doc(code);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) {
    return NextResponse.json({ error: '없는 코드예요. 선생님께 다시 확인해 주세요' }, { status: 404 });
  }
  const info = codeSnap.data() as { classId: string; studentDocId: string; number: number; name: string };

  const rosterRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(info.classId)
    .collection('students').doc(info.studentDocId);
  const rosterSnap = await rosterRef.get();
  if (!rosterSnap.exists) {
    return NextResponse.json({ error: '명부에서 학생을 찾을 수 없어요' }, { status: 404 });
  }
  const roster = rosterSnap.data() as { linkedUid?: string | null; name: string };

  const userRef = db.collection('users').doc(user.uid);

  // 학부모는 자녀로 연결 (여러 명 가능), 학생은 본인 계정으로 연결 (한 명당 하나)
  if (user.role === 'parent') {
    await userRef.set(
      {
        children: FieldValue.arrayUnion({
          studentUid: roster.linkedUid || '',
          classId: info.classId,
          name: info.name,
        }),
      },
      { merge: true }
    );
  } else {
    if (roster.linkedUid && roster.linkedUid !== user.uid) {
      return NextResponse.json(
        { error: '이미 다른 친구가 사용한 코드예요. 선생님께 알려주세요' },
        { status: 409 }
      );
    }
    await rosterRef.set(
      { linkedUid: user.uid, linkedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await userRef.set(
      {
        role: user.role || 'student',
        classIds: FieldValue.arrayUnion(info.classId),
        // 명부 이름을 정식 이름으로 삼아 익명 활동을 막는다
        displayName: info.name,
      },
      { merge: true }
    );
  }

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: info.name,
    role: user.role,
    action: user.role === 'parent' ? '학생코드로 자녀 연결' : '학생코드로 계정 연결',
    classId: info.classId,
    detail: `${info.number}번 ${info.name}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    ok: true,
    classId: info.classId,
    number: info.number,
    name: info.name,
    as: user.role === 'parent' ? 'parent' : 'student',
  });
}

/** 교사: 코드가 없는 학생에게 코드를 발급한다 (재발급은 regenerate=true) */
export async function PUT(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  let body: { schoolId?: string; classId?: string; studentDocId?: string; regenerate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const { schoolId, classId } = body;
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '담당하는 반이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const studentsRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('students');
  const codesRef = db.collection('schools').doc(schoolId).collection('studentCodes');

  const snap = body.studentDocId
    ? await studentsRef.where('__name__', '==', body.studentDocId).get()
    : await studentsRef.get();

  let issued = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.code && !body.regenerate) continue;

    // 충돌 시 다시 뽑는다
    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = makeCode();
      const exists = await codesRef.doc(candidate).get();
      if (!exists.exists) { code = candidate; break; }
    }
    if (!code) continue;

    // 재발급이면 예전 코드는 무효화한다
    if (data.code) {
      await codesRef.doc(data.code).delete().catch(() => {});
    }

    await codesRef.doc(code).set({
      classId,
      studentDocId: d.id,
      number: data.number || 0,
      name: data.name || '',
      createdAt: FieldValue.serverTimestamp(),
    });
    await d.ref.set({ code }, { merge: true });
    issued += 1;
  }

  return NextResponse.json({ ok: true, issued });
}
