import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { PERFECT, SHOTS, scoreRound } from '@/lib/archery';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 양궁 — 점수는 **서버가 낸다.**
 *
 * 달리기와 같은 원칙이다. 순위표가 걸리는데 점수를 클라이언트가 보내면
 * 아무 숫자나 적어 보낼 수 있다.
 *
 * 그래서 두 단계다.
 * 1) 시작할 때 서버가 **씨앗**을 정해 준다 — 흔들림·바람이 여기서 나온다.
 * 2) 낼 때 아이는 '각 화살을 언제 쏘았는지'(ms)만 보내고,
 *    서버가 그 씨앗으로 조준점을 다시 계산해 점수를 낸다.
 *
 * 씨앗을 서버가 쥐고 있으니 같은 판을 여러 번 시도해 좋은 점수만 낼 수도 없다 —
 * 낸 순간 그 판은 닫힌다.
 */

/** 판 하나를 붙잡아 두는 시간. 이보다 오래되면 낼 수 없다(켜두고 딴짓한 것). */
const ROUND_TTL_MS = 10 * 60 * 1000;

/** 한 발을 쏘기까지 이보다 빠를 수 없다. 자동으로 쏘는 것을 거른다. */
const MIN_SHOT_GAP_MS = 120;

/** 시작 — 서버가 씨앗을 정한다 */
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

  // 32비트 안에서 고른다 — 계산이 정수 범위를 넘지 않아야 서버와 화면이 같은 값을 본다
  const seed = (Math.floor(Math.random() * 0xffffffff) | 0) || 1;

  await adminDb().doc(`schools/${schoolId}/archeryRounds/${user.uid}`).set({
    seed,
    startedAt: FieldValue.serverTimestamp(),
    startedAtMs: Date.now(),
    done: false,
  });

  return NextResponse.json({ seed, shots: SHOTS, perfect: PERFECT });
}

/** 제출 — 서버가 다시 계산해 점수를 낸다 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; times?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const db = adminDb();
  const roundRef = db.doc(`schools/${schoolId}/archeryRounds/${user.uid}`);
  const round = await roundRef.get();
  if (!round.exists) {
    return NextResponse.json({ error: '시작한 판이 없어요' }, { status: 409 });
  }
  const r = round.data() as { seed: number; startedAtMs: number; done: boolean };
  if (r.done) {
    return NextResponse.json({ error: '이미 낸 판이에요' }, { status: 409 });
  }
  if (Date.now() - (r.startedAtMs ?? 0) > ROUND_TTL_MS) {
    return NextResponse.json({ error: '너무 오래된 판이에요. 다시 시작해주세요.' }, { status: 410 });
  }

  /**
   * 쏜 시각이 말이 되는지 본다.
   * 사람이 손으로 쏘는 이상 화살 사이에 최소한의 틈이 있다.
   */
  const times = Array.isArray(body.times) ? body.times.slice(0, SHOTS) : [];
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1];
    const b = times[i];
    if (typeof a === 'number' && typeof b === 'number' && b - a < MIN_SHOT_GAP_MS) {
      return NextResponse.json({ error: '기록을 남기지 못했어요' }, { status: 400 });
    }
  }

  // 여기서만 점수가 정해진다. 클라이언트가 보낸 점수는 아예 읽지 않는다.
  const { shots, total } = scoreRound(r.seed, times);

  // 판을 닫는다 — 같은 판을 다시 내서 점수를 고를 수 없다
  await roundRef.update({ done: true });

  /**
   * 최고 기록만 남긴다. 이번이 더 낮으면 그대로 둔다 —
   * 잘 쏜 날을 나중에 못 쏜 날이 덮으면 아이가 억울하다.
   */
  const bestRef = db.doc(`schools/${schoolId}/archeryRecords/${user.uid}`);
  const best = await bestRef.get();
  const prev = best.exists ? ((best.data()?.total as number) ?? -1) : -1;
  if (total > prev) {
    await bestRef.set({
      uid: user.uid,
      name: user.displayName,
      total,
      shots,
      at: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({ shots, total, perfect: PERFECT, best: Math.max(prev, total) });
}
