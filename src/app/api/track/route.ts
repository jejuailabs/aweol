import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 운동장 달리기 기록.
 *
 * 틀린그림 찾기와 같은 원칙 — **시간은 서버가 잰다.**
 * 클라이언트가 "3초 걸렸어요"를 보내면 순위표가 의미 없어진다.
 * 출발할 때 서버가 시각을 찍고, 들어올 때 서버가 뺀다.
 *
 * 다만 이건 아이들 놀이지 공식 기록이 아니다. 달리는 것 자체가 클라이언트에서
 * 일어나는 이상 완벽히 막을 수는 없다. 그래서 '말이 안 되는 기록'만 걸러낸다.
 */

/**
 * 트랙 한 바퀴 72m. 초등학생 전력질주가 대략 6m/s 이고 화면 속 최고 속도는 5 이므로,
 * 아무리 잘 달려도 12초 아래는 나올 수 없다. 그보다 빠르면 뭔가 잘못된 것이다.
 */
const MIN_PLAUSIBLE_MS = 12_000;
/** 10분 넘게 걸렸으면 켜두고 딴짓한 것이다. 기록으로 남기지 않는다. */
const MAX_PLAUSIBLE_MS = 600_000;

/** 출발 — 서버가 시작 시각을 찍는다 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const db = adminDb();
  // 달리는 중인 판은 사람당 하나. 여러 판을 동시에 열어두고 제일 좋은 걸 고를 수 없게.
  const runRef = db.doc(`schools/${schoolId}/trackRuns/${user.uid}`);
  await runRef.set({
    uid: user.uid,
    startedAt: FieldValue.serverTimestamp(),
    finished: false,
  });

  return NextResponse.json({ ok: true });
}

/** 도착 — 서버가 시간을 재고, 자기 최고 기록이면 갱신한다 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; laps?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const db = adminDb();
  const runRef = db.doc(`schools/${schoolId}/trackRuns/${user.uid}`);
  const run = await runRef.get();
  if (!run.exists) {
    return NextResponse.json({ error: '출발 기록이 없어요' }, { status: 400 });
  }
  const data = run.data() as { startedAt?: FirebaseFirestore.Timestamp; finished?: boolean };
  if (data.finished) {
    // 같은 판으로 두 번 들어오는 것 차단 (기록 갈아치우기)
    return NextResponse.json({ error: '이미 끝난 경기예요' }, { status: 409 });
  }
  const startedAt = data.startedAt?.toDate?.();
  if (!startedAt) {
    return NextResponse.json({ error: '출발 시각을 알 수 없어요' }, { status: 400 });
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  await runRef.set({ finished: true }, { merge: true });

  if (elapsedMs < MIN_PLAUSIBLE_MS) {
    return NextResponse.json({
      elapsedMs, recorded: false,
      reason: '기록이 너무 빨라요. 다시 한 바퀴 달려볼까요?',
    });
  }
  if (elapsedMs > MAX_PLAUSIBLE_MS) {
    return NextResponse.json({
      elapsedMs, recorded: false,
      reason: '너무 오래 걸려서 기록으로 남기지 않았어요.',
    });
  }

  // 자기 최고 기록만 남긴다. 사람당 한 줄이라 순위표를 읽어도 학생 수만큼만 읽는다.
  const bestRef = db.doc(`schools/${schoolId}/trackRecords/${user.uid}`);
  const prev = await bestRef.get();
  const prevMs = prev.exists ? (prev.data()?.bestMs as number) : Infinity;
  const isBest = elapsedMs < prevMs;

  if (isBest) {
    await bestRef.set({
      uid: user.uid,
      name: user.displayName || '이름 없음',
      bestMs: elapsedMs,
      laps: Math.max(1, Math.min(10, Number(body.laps) || 1)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({
    elapsedMs,
    recorded: true,
    isBest,
    prevBestMs: Number.isFinite(prevMs) ? prevMs : null,
  });
}
