import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, createStudentToken, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';
import { assignLoginNames, isUsablePassword, normalizeName, rosterUid } from '@/lib/student-login';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 아이 로그인 — **이름 + 반 비밀번호**.
 *
 * 아이에게 이메일을 만들어 주지 않는다. 선생님이 반 비밀번호 하나를 정해 칠판에
 * 적어두고, 아이는 자기 이름과 그 비밀번호로 들어온다.
 *
 * **검증은 전부 여기서 한다.** 명부는 클라이언트가 못 읽는다(미성년자 이름 목록이라
 * 그래야 한다). 그래서 화면은 "이름을 고르는" 것이 아니라 **치는** 것이고,
 * 맞는지는 서버만 안다.
 *
 * 로그인에 성공하면 `accessLogs` 에 **누가 언제 어디서** 들어왔는지 남는다.
 * 이 앱에서 아이가 남기는 것(작품·낙서·숙제)에 이름이 붙는 근거가 이 계정이다.
 */

/** 명부 이름 목록이 새어 나가지 않게, 실패는 전부 같은 말로 답한다. */
const WRONG = '이름이나 비밀번호가 달라요. 선생님께 물어보세요.';

export async function POST(req: NextRequest) {
  let body: { schoolId?: string; classId?: string; name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = (body.schoolId || '').trim();
  const classId = (body.classId || '').trim();
  const name = normalizeName(body.name || '');
  const password = (body.password || '').trim();

  if (!schoolId || !classId || !name || !password) {
    return NextResponse.json({ error: '학교·반·이름·비밀번호를 모두 넣어주세요' }, { status: 400 });
  }
  if (!isUsablePassword(password)) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const db = adminDb();

  /**
   * 반 비밀번호는 **공개 읽기인 반 문서에 두면 안 된다**(`classes/{id}` 는
   * `allow read: if true` 다). 담임만 읽는 딸린 문서에 따로 둔다.
   */
  const secretRef = db.doc(`schools/${schoolId}/classes/${classId}/settings/studentLogin`);
  const secretSnap = await secretRef.get();
  if (!secretSnap.exists) {
    return NextResponse.json(
      { error: '이 반은 아직 학생 로그인을 열지 않았어요. 선생님께 말씀해 주세요.' },
      { status: 404 }
    );
  }
  const expected = String(secretSnap.data()?.password ?? '');
  if (!expected || expected !== password) {
    /**
     * 찍어서 맞히는 것을 조금이라도 성가시게 만든다.
     * 제대로 된 시도 제한은 저장소가 필요한데, 여기 있는 것은 아이들 그림이라
     * 거기까지 가지 않는다 — **지나가던 사람이 그냥은 못 들어오는 정도**면 된다.
     */
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  // ---- 명부에서 이름 찾기 ----
  const rosterSnap = await db.collection(`schools/${schoolId}/classes/${classId}/students`).get();
  const roster = rosterSnap.docs.map((d) => ({
    id: d.id,
    number: Number(d.data().number ?? 0),
    name: String(d.data().name ?? ''),
    linkedUid: (d.data().linkedUid as string) || '',
  }));

  /**
   * 동명이인은 **A·B** 로 가른다. 김민준이 둘이면 'A' 를 붙여 부르기로 선생님과
   * 약속하는 것이고, 한 명뿐인 이름에는 아무것도 안 붙는다(대부분 여기 해당).
   * 그래서 아이는 대개 자기 이름만 치면 된다.
   */
  const loginNames = assignLoginNames(roster);
  const found = roster.filter((s) => loginNames[s.id] === name);

  if (found.length !== 1) {
    await new Promise((r) => setTimeout(r, 400));
    /**
     * **못 찾았을 때 '이름이 겹쳐서' 인지를 따로 봐야 한다.**
     *
     * 동명이인의 로그인 이름은 '김민준A'·'김민준B' 라서, 아이가 그냥 '김민준' 이라고
     * 치면 일치하는 것이 **0개**다. 이걸 '없는 이름' 으로 뭉뚱그리면 아이는 자기
     * 이름을 정확히 치고도 "이름이나 비밀번호가 달라요" 만 보게 된다.
     * (여기까지 왔다는 건 반 비밀번호는 이미 맞혔다는 뜻이라, 알려줘도 새는 것이 없다)
     */
    const sameName = roster.filter((s) => normalizeName(s.name) === name);
    if (sameName.length > 1) {
      return NextResponse.json(
        { error: `이름이 같은 친구가 ${sameName.length}명 있어요. ${name}A 처럼 뒤에 글자를 붙여주세요.` },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const student = found[0];
  /**
   * **명부 한 줄 = 계정 하나.** 이미 학생코드로 구글 계정을 연결한 아이는
   * 그 uid 를 그대로 쓴다 — 새로 만들면 그동안 받은 도장과 올린 작품이 갈라진다.
   */
  const uid = student.linkedUid || rosterUid(schoolId, classId, student.id);

  await db.collection('users').doc(uid).set(
    {
      role: 'student',
      // 명부 이름을 정식 이름으로 삼는다. 익명으로 활동하지 않게.
      displayName: student.name,
      schoolIds: FieldValue.arrayUnion(schoolId),
      classIds: FieldValue.arrayUnion(classId),
      pendingRole: null,
      pendingSchoolId: null,
      pendingClassId: null,
    },
    { merge: true }
  );

  if (!student.linkedUid) {
    await db.doc(`schools/${schoolId}/classes/${classId}/students/${student.id}`).set(
      { linkedUid: uid, linkedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  await db.collection('accessLogs').add({
    uid,
    displayName: student.name,
    role: 'student',
    action: '학생 로그인',
    classId,
    detail: `${schoolId} ${classId} ${name}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  const token = await createStudentToken(uid);
  return NextResponse.json({ ok: true, token, displayName: student.name });
}

/**
 * 이 반이 학생 로그인을 쓰는지 — **비밀번호는 절대 안 돌려준다.**
 * 로그인 화면이 "선생님께 비밀번호를 받으세요" 를 미리 말해주기 위한 것뿐이다.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const schoolId = (url.searchParams.get('schoolId') || '').trim();
  const classId = (url.searchParams.get('classId') || '').trim();
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  // 교직원이 아니어도 '열려 있는지' 는 알아야 로그인 화면을 안내할 수 있다
  await verifyRequestUser(req).catch(() => null);
  const snap = await adminDb().doc(`schools/${schoolId}/classes/${classId}/settings/studentLogin`).get();
  return NextResponse.json({ enabled: snap.exists && !!snap.data()?.password });
}
