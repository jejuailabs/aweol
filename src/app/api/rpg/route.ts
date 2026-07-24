import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, isStaffOfSchool, verifyRequestUser } from '@/lib/firebase-admin';
import {
  applyOverrides, checkRpg, errorsOf, isUsableId,
  type PlaceDoc, type QuestDoc, type SiteDoc,
} from '@/lib/rpg-content';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 마을 조사대 내용 고치기 — **서버가 막다른 길을 막는다.**
 *
 * 어드민 화면에서도 문제를 보여주지만, **화면만 막으면 막은 게 아니다.**
 * 저장은 여기를 지나야 하고, 여기서 한 번 더 전체를 검사한다.
 *
 * **한 개를 고쳐도 전체를 본다.** 심부름 하나를 고치면 그것만 틀리는 게 아니라
 * 그 뒤에 걸린 것들이 통째로 안 열릴 수 있기 때문이다.
 *
 * 고칠 수 있는 사람: **그 학교 교직원.**
 * 고장 이야기는 그 고장 선생님이 제일 잘 안다 — 학교 상징(교훈·교화)에서
 * 이미 같은 결론을 냈다. 틀려도 다시 고치면 되고, 기본값은 안 지워진다.
 */

type Kind = 'sites' | 'places' | 'quests';
const KINDS: Kind[] = ['sites', 'places', 'quests'];

const col = (schoolId: string, kind: Kind) =>
  adminDb().collection(`schools/${schoolId}/rpg${kind[0].toUpperCase()}${kind.slice(1)}`);

/** 지금 이 학교가 저장해 둔 것 전부 */
async function loadStored(schoolId: string) {
  const out: {
    sites: Record<string, SiteDoc>;
    places: Record<string, PlaceDoc>;
    quests: Record<string, QuestDoc>;
  } = { sites: {}, places: {}, quests: {} };

  await Promise.all(KINDS.map(async (k) => {
    const snap = await col(schoolId, k).get();
    for (const d of snap.docs) {
      (out[k] as Record<string, unknown>)[d.id] = d.data();
    }
  }));
  return out;
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: {
    schoolId?: string;
    kind?: Kind;
    id?: string;
    /** 지우기(=이 학교에서 감추기)면 `null` */
    value?: unknown;
    hidden?: boolean;
    /** 기본값으로 되돌리기 */
    reset?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = String(body.schoolId || '').trim();
  const kind = body.kind;
  const id = String(body.id || '').trim();

  if (!schoolId || !kind || !KINDS.includes(kind) || !id) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  if (!isUsableId(id)) {
    return NextResponse.json(
      { error: 'id 는 영문 소문자·숫자·- 로 2~40자예요 (예: aewol-jinseong)' },
      { status: 400 }
    );
  }
  if (user.role !== 'super_admin' && !isStaffOfSchool(user, schoolId)) {
    return NextResponse.json({ error: '이 학교 선생님만 고칠 수 있습니다' }, { status: 403 });
  }

  const stored = await loadStored(schoolId);

  // 이번에 바꿀 것을 미리 얹어 보고, 그 결과가 성한지 본다
  const next = { ...stored, [kind]: { ...stored[kind] } };
  if (body.reset) {
    delete (next[kind] as Record<string, unknown>)[id];
  } else {
    (next[kind] as Record<string, unknown>)[id] =
      body.hidden ? { hidden: true } : { value: body.value };
  }

  const merged = applyOverrides(schoolId, next);
  const problems = checkRpg(merged);
  const errors = errorsOf(problems);
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: '이대로 저장하면 아이가 막혀요',
        problems: errors.slice(0, 12),
      },
      { status: 400 }
    );
  }

  const ref = col(schoolId, kind).doc(id);
  if (body.reset) {
    await ref.delete().catch(() => {});
  } else {
    await ref.set(
      {
        ...(body.hidden ? { hidden: true, value: FieldValue.delete() } : { hidden: false, value: body.value }),
        updatedBy: user.uid,
        updatedByName: user.displayName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  /**
   * **누가 무엇을 바꿨는지 남긴다.**
   * 애월초가 전시관으로 바뀌었을 때 로그에 '학교 정보 수정' 뿐이라
   * 무엇이 바뀌었는지 알 수 없었다. 같은 일을 되풀이하지 않는다.
   */
  const what = kind === 'sites' ? '유적' : kind === 'places' ? '기관' : '심부름';
  await adminDb().collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '마을 조사대 수정',
    classId: null,
    detail: `${what} · ${id} · ${body.reset ? '기본값으로 되돌림' : body.hidden ? '감춤' : '고침'}`,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, warnings: problems.filter((p) => p.level === 'warn').slice(0, 12) });
}
