import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';

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
  let buffer: Buffer | null = null;
  let contentType = 'image/png';

  if (file && file instanceof Blob && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '이미지는 10MB 이하로 올려주세요' }, { status: 413 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    contentType = file.type || 'image/png';
  } else if (dataUrl.startsWith('data:image/')) {
    const [meta, b64] = dataUrl.split(',');
    contentType = meta.slice(5, meta.indexOf(';')) || 'image/png';
    buffer = Buffer.from(b64, 'base64');
  }

  if (buffer) {
    try {
      const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
      const path = `app-assets/schools/${schoolId}.${ext}`;
      const gcsFile = bucket.file(path);
      await gcsFile.save(buffer, { contentType, resumable: false });
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
