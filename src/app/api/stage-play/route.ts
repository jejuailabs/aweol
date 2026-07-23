import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, isStaffOfSchool, verifyRequestUser } from '@/lib/firebase-admin';
import { scoreMatchRun, type WordPair } from '@/lib/wordset';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 짝맞추기 한 판 — **점수는 서버가 낸다.**
 *
 * 달리기·양궁과 같은 원칙이다. 랭킹에 올릴 값을 클라이언트가 보내면
 * 아무 숫자나 적어 보낼 수 있다.
 *
 * 짝맞추기는 '언제' 만으로는 되짚을 수 없어서, **무엇을 어떤 순서로
 * 뒤집었는지**를 받는다. 서버가 낱말 묶음과 씨앗으로 판을 다시 만들어
 * 그 순서를 그대로 따라가 본다 — 거짓 순서는 도중에 막힌다.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; classId?: string; stageId?: string; order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = String(body.schoolId ?? '').trim();
  const classId = String(body.classId ?? '').trim();
  const stageId = String(body.stageId ?? '').trim();
  if (!schoolId || !classId || !stageId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  // 이 반 사람만 논다. 총관리자·교직원은 통과(둘러보기).
  const isStaff = isStaffOfSchool(user, schoolId);
  if (!isStaff && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 게임이 아니에요' }, { status: 403 });
  }

  const db = adminDb();
  const stageRef = db.doc(`schools/${schoolId}/classes/${classId}/stages/${stageId}`);
  const stage = await stageRef.get();
  if (!stage.exists) return NextResponse.json({ error: '없는 스테이지예요' }, { status: 404 });

  const v = stage.data() as { pairs?: WordPair[]; order?: number; approved?: boolean };
  if (!v.approved) {
    return NextResponse.json({ error: '아직 열리지 않은 게임이에요' }, { status: 403 });
  }

  /**
   * 씨앗은 화면과 **똑같은 식**으로 만든다.
   * 어긋나면 서버가 다른 판을 되짚게 되어, 제대로 한 아이도 거부당한다.
   */
  const pairs = Array.isArray(v.pairs) ? v.pairs : [];
  const seed = (v.order ?? 1) * 7919 + pairs.length;

  const run = scoreMatchRun(pairs, seed, body.order);
  if (!run.ok) {
    return NextResponse.json({ error: run.reason || '기록을 남기지 못했어요' }, { status: 400 });
  }

  // 판마다 기록 (선생님이 누가 했는지 본다)
  await db
    .collection(`schools/${schoolId}/classes/${classId}/stages/${stageId}/plays`)
    .add({
      studentUid: user.uid,
      studentName: user.displayName,
      game: 'match',
      flips: run.flips,
      score: run.score,
      playedAt: FieldValue.serverTimestamp(),
    });

  /**
   * 학교 랭킹은 **최고 점수만** 남긴다.
   * 이번이 더 낮으면 그대로 둔다 — 잘한 날을 못한 날이 덮으면 억울하다.
   */
  const bestRef = db.doc(`schools/${schoolId}/matchRecords/${user.uid}`);
  const best = await bestRef.get();
  const prev = best.exists ? ((best.data()?.score as number) ?? -1) : -1;
  if (run.score > prev) {
    await bestRef.set({
      uid: user.uid,
      name: user.displayName,
      score: run.score,
      flips: run.flips,
      at: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({ flips: run.flips, score: run.score, best: Math.max(prev, run.score) });
}
