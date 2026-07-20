import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, isTeacherOfClass, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 기억창고로 옮기기.
 *
 * 한 해가 끝나면 반 하나를 통째로 갈무리한다.
 *
 * **왜 Firestore 에 그대로 두지 않나:** 한 반에 작품·숙제·제출물·퀴즈·낙서가
 * 수백 건이다. 졸업한 반이 쌓일수록 목록 한 번 여는 데 드는 읽기가 계속 는다.
 * 그래서 전체는 Storage 에 JSON 한 덩어리로 넣고 Firestore 에는 요약 한 줄만 남긴다.
 * 기억창고를 열면 문서 1건 + 파일 1개다.
 *
 * **원본은 지우지 않는다.** 아이들이 만든 걸 앱이 알아서 없애면 안 된다.
 * 반에 `isArchived` 만 세워 활성 목록에서 빠지게 하고, 진짜 삭제는
 * 사람이 따로 결정할 일로 남겨둔다.
 */

/** 한 번에 너무 많이 읽지 않도록 컬렉션마다 상한을 둔다 */
const MAX_PER_COLLECTION = 500;

type Row = Record<string, unknown> & { id: string };

async function readAll(
  db: FirebaseFirestore.Firestore,
  path: string
): Promise<Row[]> {
  const snap = await db.collection(path).limit(MAX_PER_COLLECTION).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Timestamp 는 JSON 으로 그냥 못 넣는다. 문자열로 눕힌다. */
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const t = v as { toDate?: () => Date };
    if (typeof t.toDate === 'function') return t.toDate().toISOString();
    if (Array.isArray(v)) return v.map(plain);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = plain(val);
    return out;
  }
  return v;
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; classId?: string; year?: string };
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
  // 담임(과 총관리자)만. 남의 반을 갈무리해 활성 목록에서 치울 수 없다.
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '이 반의 담임만 할 수 있습니다' }, { status: 403 });
  }

  const db = adminDb();
  const classRef = db.doc(`schools/${schoolId}/classes/${classId}`);
  const classSnap = await classRef.get();
  if (!classSnap.exists) {
    return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  }
  const cls = classSnap.data() as {
    grade?: string; classNumber?: number; year?: string; teacherName?: string;
  };
  const year = (body.year || cls.year || String(new Date().getFullYear())).trim();

  const base = `schools/${schoolId}/classes/${classId}`;

  // 반 아래 것들을 모은다
  const [students, notices, homeworks, quizzes, activities, artworks, blackboard] = await Promise.all([
    readAll(db, `${base}/students`),
    readAll(db, `${base}/notices`),
    readAll(db, `${base}/homeworks`),
    readAll(db, `${base}/quizzes`),
    readAll(db, `${base}/activities`),
    readAll(db, `${base}/artworks`),
    readAll(db, `${base}/blackboard`),
  ]);

  /**
   * 숙제 제출물 중 **이미 공개된 것만** 담는다.
   *
   * 갈무리 파일은 주소만 알면 누구나 받을 수 있다. 그래서 지금 규칙으로 가려져 있는 것을
   * 넣으면 그 순간 가림막이 사라진다. '선생님만 보기'로 낸 숙제가 대표적이다.
   * `publicToClass` 인 제출물은 지금도 규칙상 공개라, 이것만 넘긴다.
   */
  const submissions: Record<string, Row[]> = {};
  for (const hw of homeworks) {
    const all = await readAll(db, `${base}/homeworks/${hw.id}/submissions`);
    const open = all.filter((s) => s.publicToClass === true);
    if (open.length > 0) submissions[hw.id] = open;
  }

  /**
   * 갈무리에 담지 않는 것 — 넣으면 공개되기 때문이다.
   * - **명부(students)**: 아이 이름이 줄줄이 든 목록이다. 지금은 담임만 본다.
   *   기억창고에는 몇 명이었는지(숫자)만 남긴다.
   * - **퀴즈 문항·정답**: 파일 주소만 알면 답을 다 보게 된다. 지나간 해라도 문제는 돌려 쓴다.
   * - **가려진 제출물**: 위 참조.
   */
  const detail = plain({
    school: schoolId,
    classId,
    year,
    grade: cls.grade ?? '',
    classNumber: cls.classNumber ?? 0,
    teacherName: cls.teacherName ?? '',
    studentCount: students.length,
    notices,
    homeworks,
    submissions,
    quizzes: quizzes.map((q) => ({ id: q.id, title: q.title, createdAt: q.createdAt })),
    activities,
    artworks,
    blackboard,
    archivedAt: new Date().toISOString(),
  });

  let detailUrl = '';
  try {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const path = `archives/${schoolId}/${year}-${classId}.json`;
    const file = bucket.file(path);
    await file.save(JSON.stringify(detail), {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    });
    await file.makePublic();
    detailUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
  } catch (e) {
    return NextResponse.json(
      { error: `갈무리 파일을 저장하지 못했습니다: ${(e as Error).message.slice(0, 120)}` },
      { status: 500 }
    );
  }

  const cover = artworks.find((a) => a.thumbnailUrl || a.imageUrl);

  await db.doc(`schools/${schoolId}/archives/${year}-${classId}`).set({
    year,
    classId,
    grade: cls.grade ?? '',
    classNumber: cls.classNumber ?? 0,
    teacherName: cls.teacherName ?? '',
    coverUrl: (cover?.thumbnailUrl as string) || (cover?.imageUrl as string) || '',
    counts: {
      students: students.length,
      artworks: artworks.length,
      homeworks: homeworks.length,
      quizzes: quizzes.length,
      activities: activities.length,
    },
    detailUrl,
    archivedBy: user.uid,
    archivedAt: FieldValue.serverTimestamp(),
  });

  // 활성 목록에서만 빼둔다. 원본은 그대로 있다.
  await classRef.set({ isArchived: true }, { merge: true });

  return NextResponse.json({
    ok: true,
    archiveId: `${year}-${classId}`,
    counts: {
      students: students.length,
      artworks: artworks.length,
      homeworks: homeworks.length,
      quizzes: quizzes.length,
      activities: activities.length,
    },
  });
}
