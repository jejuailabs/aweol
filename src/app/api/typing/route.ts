import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { countStrokes, rainLevel, strokesPerMinute } from '@/lib/typing';
import { weekKeyKST } from '@/lib/week';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 타자 기록.
 *
 * **점수를 그대로 믿지 않는다.** 순위표가 걸린 것은 전부 서버가 다시 본다
 * (달리기·양궁과 같은 원칙). 다만 타자는 양궁처럼 씨앗으로 되짚을 수가 없다 —
 * 아이가 무엇을 쳤는지는 아이 손에만 있다.
 *
 * 그래서 **친 낱말들을 그대로 받아 서버가 타수를 다시 센다.**
 * 화면이 '나 500타 쳤어' 라고 우겨도 안 통하고, 낱말 목록과 걸린 시간이
 * 서로 말이 되는지도 본다. 완벽한 방벽은 아니지만 — 여기 있는 것은 아이들
 * 타자 연습이지 상금이 걸린 대회가 아니다. **작정하고 파고들면 뚫리되,
 * 화면을 조금 만져서는 안 되는 정도**면 된다.
 */

/** 사람이 낼 수 있는 최대치. 이보다 빠르면 사람이 친 것이 아니다. */
const MAX_CPM = 1200;
/** 너무 짧은 판은 기록으로 안 친다 (한 낱말 치고 끝내기) */
const MIN_MS = 5000;

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; mode?: string; level?: unknown; words?: unknown; ms?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const mode = body.mode === 'practice' ? 'practice' : 'rain';
  const level = rainLevel(body.level).level;
  const ms = Number(body.ms);
  const words = Array.isArray(body.words)
    ? body.words.filter((w): w is string => typeof w === 'string').slice(0, 500)
    : [];

  if (!Number.isFinite(ms) || ms < MIN_MS) {
    return NextResponse.json({ error: '기록으로 남기기엔 너무 짧아요' }, { status: 400 });
  }
  if (words.length === 0) {
    return NextResponse.json({ error: '친 낱말이 없어요' }, { status: 400 });
  }

  // 여기서만 타수가 정해진다. 화면이 보낸 숫자는 아예 읽지 않는다.
  const strokes = words.reduce((n, w) => n + countStrokes(w), 0);
  const cpm = strokesPerMinute(strokes, ms);

  if (cpm > MAX_CPM) {
    return NextResponse.json({ error: '기록을 남기지 못했어요' }, { status: 400 });
  }

  /**
   * 양궁과 **같은 얼개**다: `{uid}_{모드}` 한 줄에 주(week)를 적어둔다.
   * 주가 바뀌면 견주지 않으므로 월요일마다 새로 시작한다.
   * 산성비는 난이도까지 갈라야 한다 — 1단계 500타와 5단계 500타는 다른 일이다.
   */
  const week = weekKeyKST();
  const key = mode === 'rain' ? `${user.uid}_rain${level}` : `${user.uid}_practice`;
  const ref = adminDb().doc(`schools/${schoolId}/typingRecords/${key}`);
  const snap = await ref.get();
  const cur = snap.data();
  const prev = snap.exists && cur?.week === week ? ((cur?.cpm as number) ?? -1) : -1;

  if (cpm > prev) {
    await ref.set({
      uid: user.uid,
      name: user.displayName,
      mode,
      // 단문 연습에는 난이도가 없다. 0 으로 두면 순위표 질의가 한결같다.
      level: mode === 'rain' ? level : 0,
      week,
      cpm,
      strokes,
      ms: Math.round(ms),
      at: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({
    ok: true, strokes, cpm, week, level, mode,
    best: Math.max(prev, cpm),
  });
}
