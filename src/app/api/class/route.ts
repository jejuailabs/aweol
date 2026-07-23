import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, isSchoolAdminOfSchool, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 반 만들기.
 *
 * **예전에는 화면에서 Firestore 로 곧장 `setDoc` 을 했는데, 두 가지가 잘못돼 있었다.**
 *
 * 1) `setDoc` 은 문서가 있으면 **덮어쓴다.** 이미 있는 3-4 반에 같은 번호를 넣으면
 *    그 반의 담임·급훈·명단이 통째로 날아간다. 실제로 애월초 3-4 에는 담임과 급훈이
 *    들어 있었다 — 덮였으면 되돌릴 방법이 없었다.
 * 2) 있는 문서를 건드리면 규칙이 create 가 아니라 update 로 본다. update 는 담임만
 *    허용이라, 남의 반 번호를 넣은 선생님은 권한 오류를 맞는다. 화면에는 오류를
 *    잡는 코드가 없어서 '만드는 중...' 에서 영영 멈춰 있었다.
 *
 * 그래서 서버로 옮겼다. 여기서 **있는지 먼저 확인하고**, 없을 때만 만든다.
 */

const MAX_GRADE = 6;
const MAX_CLASS_NUM = 12;

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; grade?: unknown; classNumber?: unknown; motto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });
  /**
   * **반 만들기는 학교관리자만.**
   *
   * 예전에는 그 학교 교직원이면 누구나 만들 수 있었다. 그래서 담임 한 명이
   * 임의로 반을 늘릴 수 있었고, 학년·반 구성이 실제 학교와 어긋났다.
   * 반이 필요한 선생님은 학교관리자에게 요청한다 — 그래서 문구도 그렇게 적는다.
   */
  if (!isSchoolAdminOfSchool(user, schoolId)) {
    return NextResponse.json(
      { error: '반 만들기는 학교관리자만 할 수 있어요. 학교관리자 선생님께 요청해 주세요.' },
      { status: 403 }
    );
  }

  // 숫자가 아닌 값·범위 밖 값을 여기서 잡는다. 화면 검사만 믿으면 안 된다.
  const grade = Number(body.grade);
  const classNumber = Number(body.classNumber);
  if (!Number.isInteger(grade) || grade < 1 || grade > MAX_GRADE) {
    return NextResponse.json(
      { error: `학년은 1학년부터 ${MAX_GRADE}학년까지예요` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > MAX_CLASS_NUM) {
    return NextResponse.json(
      { error: `반 번호는 1반부터 ${MAX_CLASS_NUM}반까지예요` },
      { status: 400 }
    );
  }

  const db = adminDb();
  const classId = `${grade}-${classNumber}`;
  const classRef = db.doc(`schools/${schoolId}/classes/${classId}`);
  const existing = await classRef.get();

  if (existing.exists) {
    const cur = existing.data() as { teacherName?: string; teacherUid?: string; isArchived?: boolean };
    /**
     * 있는 반은 절대 덮지 않는다. 남의 반을 '만들기'로 가로챌 수도 없다.
     *
     * **이건 잘못한 게 아니라 이미 있는 것뿐이다.** 그래서 오류 문구가 아니라
     * 사실을 알려주고, 다음에 뭘 하면 되는지까지 적어 보낸다.
     * 특히 담임이 비어 있는 반은 '만들기'가 아니라 담임 배정으로 가야 한다
     * (총관리자 승인 경로에서 빈 반에 담임을 넣어준다).
     */
    const where = `${grade}학년 ${classNumber}반`;
    let message: string;
    let hint = '';

    /**
     * 담임 상태가 세 갈래다. `teacherName` 은 적혀 있는데 `teacherUid` 가 빈 반이
     * 실제로 있다(명부만 옮겨 적고 계정을 연결하지 않은 경우).
     * 이때 '담임이 없어요' 라고만 하면, 화면에는 이름이 보이는데 없다고 하니 헷갈린다.
     */
    if (cur.isArchived) {
      message = `${where}은 이미 있어요. 지금은 기억창고에 보관 중이에요.`;
      hint = '지난 해 반이라면 기억창고에서 볼 수 있어요.';
    } else if (cur.teacherUid) {
      message = `${where}은 이미 있어요. 담임은 ${cur.teacherName || '다른 선생님'}이에요.`;
      hint = '다른 반 번호를 골라주세요.';
    } else if (cur.teacherName) {
      message = `${where}은 이미 있어요. 담임으로 ${cur.teacherName}이 적혀 있는데 계정과 연결되어 있지 않아요.`;
      hint = '이 반을 맡으시려면 학교관리자에게 담임 배정을 요청해 주세요.';
    } else {
      message = `${where}은 이미 있어요. 아직 담임이 없는 반이에요.`;
      hint = '이 반을 맡으시려면 학교관리자에게 담임 배정을 요청해 주세요.';
    }

    return NextResponse.json(
      {
        // 화면이 '오류'가 아니라 '안내'로 보여주도록 코드를 함께 준다
        code: 'ALREADY_EXISTS',
        message,
        hint,
        classId,
        archived: cur.isArchived === true,
        hasTeacher: !!cur.teacherUid,
      },
      { status: 409 }
    );
  }

  /**
   * **만든 사람이 담임이 되지 않는다.**
   *
   * 예전에는 선생님이 자기 반을 직접 만들었으니 만든 사람 = 담임이었다.
   * 이제는 관리자가 학교의 반을 한꺼번에 세우는 자리라, 만든 사람을 담임으로
   * 박아두면 학교관리자가 온 학교의 담임이 되어버린다.
   * 담임은 교사 승인 때 채워진다(`/api/role` PATCH — 빈 반에만 넣는다).
   */
  await classRef.create({
    schoolId,
    grade: String(grade),
    classNumber,
    year: String(new Date().getFullYear()),
    teacherUid: '',
    teacherName: '',
    motto: (body.motto || '').trim().slice(0, 40) || '함께 웃고, 함께 자라자',
    introText: '',
    isArchived: false,
    memberUids: [],
  });

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '반 만들기',
    classId,
    detail: `${schoolId} ${grade}학년 ${classNumber}반`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, classId });
}
