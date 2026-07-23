import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, isTeacherOfClass, verifyRequestUser } from '@/lib/firebase-admin';
import { isUsablePassword, makeClassPassword } from '@/lib/student-login';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 반 비밀번호 — 아이들이 들어올 때 쓰는 **반에 하나뿐인** 비밀번호.
 *
 * **왜 아이마다 따로 안 주나.** 아이마다 다르면 잊어버리고, 잊어버리면 수업 시간에
 * 선생님이 스무 번 다시 알려주게 된다. 반 하나에 하나면 칠판에 적어두면 끝이다.
 * 누가 누구인지는 **이름**이 가른다.
 *
 * **쓰기는 서버만 한다.** 규칙에서 이 문서의 클라이언트 쓰기를 막아뒀다 —
 * 열려 있으면 아이가 자기 반 비밀번호를 바꿔놓을 수 있다.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; classId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = (body.schoolId || '').trim();
  const classId = (body.classId || '').trim();
  if (!schoolId || !classId) {
    return NextResponse.json({ error: '학교와 반이 필요합니다' }, { status: 400 });
  }
  // 화면에서도 담임에게만 열지만, 화면만 막으면 막은 게 아니다
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '이 반 담임 선생님만 정할 수 있어요' }, { status: 403 });
  }

  /**
   * 안 적어 보내면 우리가 만든다. 아이가 칠판을 보고 **옮겨 칠 수 있는** 값이라
   * 기호도 대문자도 안 쓴다.
   */
  const given = (body.password || '').trim();
  if (given && !isUsablePassword(given)) {
    return NextResponse.json(
      { error: '비밀번호는 4자에서 32자 사이로 해주세요' },
      { status: 400 }
    );
  }
  const password = given || makeClassPassword();

  await adminDb().doc(`schools/${schoolId}/classes/${classId}/settings/studentLogin`).set(
    {
      password,
      updatedBy: user.uid,
      updatedByName: user.displayName,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await adminDb().collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '반 비밀번호 정하기',
    classId,
    // **비밀번호 자체는 기록에 남기지 않는다.** 기록은 총관리자가 본다.
    detail: `${schoolId} ${classId}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, password });
}

/**
 * 반 비밀번호 지우기 — 학생 로그인을 닫는다.
 * (기록을 지우는 게 아니다. 이미 들어온 아이의 계정은 그대로 남는다)
 */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const url = new URL(req.url);
  const schoolId = (url.searchParams.get('schoolId') || '').trim();
  const classId = (url.searchParams.get('classId') || '').trim();
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '이 반 담임 선생님만 할 수 있어요' }, { status: 403 });
  }

  await adminDb().doc(`schools/${schoolId}/classes/${classId}/settings/studentLogin`).delete();
  return NextResponse.json({ ok: true });
}
