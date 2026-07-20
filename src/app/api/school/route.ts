import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, getClientIp, verifyRequestUser, isStaffOfSchool } from '@/lib/firebase-admin';
import { compressImage } from '@/lib/image-compress';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 학교 문서 ID 로 쓸 슬러그 (한글 이름은 타임스탬프로 대체) */
function slugify(name: string) {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return ascii.length >= 3 ? ascii.slice(0, 40) : `school-${Date.now()}`;
}

/** 새 학교 생성 — 슈퍼 관리자만 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: '총관리자만 학교를 만들 수 있습니다' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const name = String(form.get('name') || '').trim();
  const lat = parseFloat(String(form.get('lat')));
  const lng = parseFloat(String(form.get('lng')));
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: '이름과 위치가 필요합니다' }, { status: 400 });
  }

  const tagline = String(form.get('tagline') || '').trim().slice(0, 60);
  const gradeCount = Math.max(1, Math.min(6, parseInt(String(form.get('gradeCount')), 10) || 6));
  const classPerGrade = Math.max(1, Math.min(12, parseInt(String(form.get('classPerGrade')), 10) || 4));
  let assets: string[] = [];
  try {
    const raw = JSON.parse(String(form.get('assets') || '[]'));
    if (Array.isArray(raw)) assets = raw.filter((a) => typeof a === 'string').slice(0, 8);
  } catch {}

  const db = adminDb();
  const schoolId = slugify(name);
  const schoolRef = db.collection('schools').doc(schoolId);
  if ((await schoolRef.get()).exists) {
    return NextResponse.json({ error: '같은 이름의 학교가 이미 있습니다' }, { status: 409 });
  }

  // 대표 이미지: 업로드 파일 또는 AI가 만든 dataURL
  let imageUrl = '';
  const file = form.get('image');
  const dataUrl = String(form.get('imageDataUrl') || '');
  // 형식·크기는 compressImage 가 정한다 (원본 contentType 은 쓰지 않는다)
  let buffer: Buffer | null = null;

  if (file && file instanceof Blob && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '이미지는 10MB 이하로 올려주세요' }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (dataUrl.startsWith('data:image/')) {
    buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  }

  if (buffer) {
    try {
      const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      // 3D 학교 화면을 열 때마다 내려받는 이미지라 반드시 줄여서 올린다
      const small = await compressImage(buffer);
      const path = `app-assets/schools/${schoolId}.${small.ext}`;
      const gcsFile = bucket.file(path);
      await gcsFile.save(small.buffer, { contentType: small.contentType, resumable: false });
      await gcsFile.makePublic();
      imageUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
    } catch (e) {
      return NextResponse.json(
        { error: `이미지 저장 실패: ${(e as Error).message.slice(0, 120)}` },
        { status: 500 }
      );
    }
  }

  await schoolRef.set({
    name,
    lat,
    lng,
    tagline,
    imageUrl,
    gradeCount,
    classPerGrade,
    assets,
    createdBy: user.uid,
    isArchived: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 빈 반을 미리 만들어 두면 교사가 바로 들어가 수업을 등록할 수 있다
  const year = String(new Date().getFullYear());
  let batch = db.batch();
  let ops = 0;
  for (let g = 1; g <= gradeCount; g++) {
    for (let c = 1; c <= classPerGrade; c++) {
      const classId = `${g}-${c}`;
      batch.set(schoolRef.collection('classes').doc(classId), {
        schoolId,
        grade: String(g),
        classNumber: c,
        year,
        teacherUid: '',
        teacherName: '미정',
        motto: '',
        introText: '',
        isArchived: false,
        memberUids: [],
      });
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }
  if (ops > 0) await batch.commit();

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '학교 생성',
    classId: null,
    detail: `${name} (${gradeCount}학년 × ${classPerGrade}반)`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, schoolId, classCount: gradeCount * classPerGrade });
}

/**
 * 학교 정보 수정 — 이 학교 교직원(과 총관리자).
 *
 * 이름·소개·대표 이미지는 언제든 고칠 수 있다.
 * 학년/반 수는 **늘리기만** 한다. 줄이면 그 반의 작품·숙제·낙서가 통째로 사라지는데,
 * 학기 중에 실수 한 번으로 아이들 작품이 날아가면 되돌릴 방법이 없다.
 * 반을 없애야 하면 개별 반을 보관 처리(isArchived)한다.
 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = String(form.get('schoolId') || '').trim();
  if (!schoolId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  if (!isStaffOfSchool(user, schoolId)) {
    return NextResponse.json({ error: '이 학교의 선생님이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const schoolRef = db.collection('schools').doc(schoolId);
  const snap = await schoolRef.get();
  if (!snap.exists) return NextResponse.json({ error: '학교를 찾을 수 없습니다' }, { status: 404 });
  const cur = snap.data() as {
    gradeCount?: number; classPerGrade?: number; name?: string; imageUrl?: string;
  };

  const patch: Record<string, unknown> = {};

  const name = String(form.get('name') || '').trim();
  if (name) patch.name = name.slice(0, 60);
  if (form.has('tagline')) patch.tagline = String(form.get('tagline') || '').trim().slice(0, 60);

  const lat = parseFloat(String(form.get('lat')));
  const lng = parseFloat(String(form.get('lng')));
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    patch.lat = lat;
    patch.lng = lng;
  }

  if (form.has('assets')) {
    try {
      const raw = JSON.parse(String(form.get('assets') || '[]'));
      if (Array.isArray(raw)) patch.assets = raw.filter((a) => typeof a === 'string').slice(0, 8);
    } catch {}
  }

  // ---- 대표 이미지 ----
  const file = form.get('image');
  const dataUrl = String(form.get('imageDataUrl') || '');
  // 형식·크기는 compressImage 가 정한다 (원본 contentType 은 쓰지 않는다)
  let buffer: Buffer | null = null;

  if (file && file instanceof Blob && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '이미지는 10MB 이하로 올려주세요' }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } else if (dataUrl.startsWith('data:image/')) {
    buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  }

  if (buffer) {
    try {
      const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const small = await compressImage(buffer);
      // 파일명에 시각을 붙인다. 같은 경로로 덮으면 CDN 캐시 때문에 옛 그림이 계속 보인다.
      const path = `app-assets/schools/${schoolId}-${Date.now()}.${small.ext}`;
      const gcsFile = bucket.file(path);
      await gcsFile.save(small.buffer, { contentType: small.contentType, resumable: false });
      await gcsFile.makePublic();
      patch.imageUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;

      // 옛 그림은 지운다. 안 지우면 이미지를 바꿀 때마다 1MB 남짓이 계속 쌓인다.
      // (파일명에 시각을 붙이는 이상 덮어쓰기로는 정리되지 않는다)
      const prev = cur.imageUrl || '';
      const m = prev.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(\?|$)/);
      const prevPath = m ? decodeURIComponent(m[1]) : '';
      // 학교가 직접 올린 것만 지운다 — 코드가 주소를 박아 쓰는 공용 이미지는 건드리지 않는다
      if (prevPath && prevPath.startsWith('app-assets/schools/') && prevPath !== path) {
        await bucket.file(prevPath).delete().catch(() => {});
      }
    } catch (e) {
      return NextResponse.json(
        { error: `이미지 저장 실패: ${(e as Error).message.slice(0, 120)}` },
        { status: 500 }
      );
    }
  }

  // ---- 학년·반 늘리기 ----
  const curGrades = cur.gradeCount ?? 6;
  const curPer = cur.classPerGrade ?? 4;
  let addedClasses = 0;

  const wantGrades = parseInt(String(form.get('gradeCount')), 10);
  const wantPer = parseInt(String(form.get('classPerGrade')), 10);
  const nextGrades = Number.isNaN(wantGrades) ? curGrades : Math.max(1, Math.min(6, wantGrades));
  const nextPer = Number.isNaN(wantPer) ? curPer : Math.max(1, Math.min(12, wantPer));

  if (nextGrades < curGrades || nextPer < curPer) {
    return NextResponse.json(
      {
        error: '학년·반은 줄일 수 없어요. 안 쓰는 반은 반별로 보관 처리해 주세요.',
        current: { gradeCount: curGrades, classPerGrade: curPer },
      },
      { status: 400 }
    );
  }

  if (nextGrades > curGrades || nextPer > curPer) {
    const year = String(new Date().getFullYear());
    let batch = db.batch();
    let ops = 0;
    for (let g = 1; g <= nextGrades; g++) {
      for (let c = 1; c <= nextPer; c++) {
        // 이미 있던 반은 건드리지 않는다 (작품·숙제가 들어 있다)
        if (g <= curGrades && c <= curPer) continue;
        batch.set(schoolRef.collection('classes').doc(`${g}-${c}`), {
          schoolId,
          grade: String(g),
          classNumber: c,
          year,
          teacherUid: '',
          teacherName: '미정',
          motto: '',
          introText: '',
          isArchived: false,
          memberUids: [],
        });
        addedClasses += 1;
        ops += 1;
        if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
      }
    }
    if (ops > 0) await batch.commit();
    patch.gradeCount = nextGrades;
    patch.classPerGrade = nextPer;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  await schoolRef.set(patch, { merge: true });

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '학교 정보 수정',
    classId: null,
    detail: `${cur.name || schoolId}${addedClasses ? ` · 반 ${addedClasses}개 추가` : ''}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, addedClasses, imageUrl: patch.imageUrl ?? null });
}
