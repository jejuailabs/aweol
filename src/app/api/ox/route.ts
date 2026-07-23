import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import {
  ANSWER_MS, REVEAL_MS, NEXT_MS, MAX_ROUNDS,
  pickQuestions, judgeRound, roundOutcome, type OX, type OXQuestion,
} from '@/lib/ox-quiz';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 광장 OX 퀴즈 — **정답은 서버만 쥔다.**
 *
 * 문제와 정답은 `oxGames/{roomKey}` 에 들어 있고 규칙이 아무에게도 안 보여준다.
 * 광장에 보이는 판(`oxRooms/{roomKey}`)에는 **문제 글만** 올라간다.
 * 정답은 시간이 다 지난 뒤에 서버가 거기에 올린다.
 *
 * ---
 *
 * **실시간 판(RTDB)이 아니라 Firestore 를 쓴다.**
 *
 * 술래잡기는 위치를 초당 5번 나르느라 RTDB 를 쓰지만, 여기서 오가는 것은
 * '문제가 바뀌었다' 뿐이라 한 판에 스무 번쯤이다. 그 정도면 Firestore 구독으로 충분하다.
 * 무엇보다 **서버가 RTDB 에 쓰려면 `firebase-admin/database` 를 들여와야 하는데,
 * 이 프로젝트는 `firebase-admin/auth` 를 들였다가 배포본이 통째로 500 이 난 적이 있다**
 * (ESM/CJS 문제, STATE.md 규칙 1). 되는 길이 있는데 그 길을 또 밟을 이유가 없다.
 *
 * ---
 *
 * **시계는 서버 것을 쓴다.** 응답과 판에 `serverNow` 를 같이 적는다.
 * 이 프로젝트에서 실제로 **PC 시계가 8초 빨라서** 시간 검증이 틀린 적이 있다.
 * 아이 기기 시계가 몇 초 어긋나 있으면 남은 시간이 엉뚱하게 보인다.
 */

/** 판을 넘기는 것은 아무나 부를 수 있다 — 다만 **시간이 됐을 때만** 넘어간다 */
type Action = 'start' | 'advance' | 'reset';

interface RoomState {
  status: 'waiting' | 'asking' | 'reveal' | 'done';
  round: number;
  total: number;
  q: string;
  /** 답을 고를 수 있는 끝 시각 (ms) */
  endsAt: number;
  /** 정답이 열리는 시각 — 끝나고 3초 뒤. 이 사이가 제일 조마조마하다. */
  revealAt: number;
  /** 다음 문제로 넘어가는 시각 */
  nextAt: number;
  answer: OX | null;
  why: string | null;
  alive: string[];
  out: string[];
  winners: string[];
  names: Record<string, string>;
  startedBy: string;
  serverNow: number;
}

const roomRef = (schoolId: string, roomKey: string) =>
  adminDb().doc(`schools/${schoolId}/oxRooms/${roomKey}`);
const gameRef = (schoolId: string, roomKey: string) =>
  adminDb().doc(`schools/${schoolId}/oxGames/${roomKey}`);

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; roomKey?: string; action?: Action; grade?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = String(body.schoolId || '').trim();
  const roomKey = String(body.roomKey || 'plaza').trim().slice(0, 40);
  const action = body.action;
  if (!schoolId || !action) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const now = Date.now();

  if (action === 'start' || action === 'reset') {
    return start(schoolId, roomKey, user.uid, now, body.grade);
  }
  if (action === 'advance') return advance(schoolId, roomKey, now);
  return NextResponse.json({ error: '알 수 없는 요청' }, { status: 400 });
}

/**
 * 판을 연다.
 *
 * **들어와 있는 아이들을 그때 한 번 붙잡는다.** 시작한 뒤에 들어온 아이는
 * 구경만 한다 — 두 문제 지나고 들어와서 우승하면 아무도 납득 못 한다.
 */
async function start(schoolId: string, roomKey: string, uid: string, now: number, grade?: number) {
  const players = await adminDb()
    .collection(`schools/${schoolId}/oxRooms/${roomKey}/players`)
    .get();

  const names: Record<string, string> = {};
  for (const d of players.docs) {
    const n = String((d.data() as { n?: string }).n || '친구').slice(0, 20);
    names[d.id] = n;
  }
  // 시작하는 본인은 목록에 없더라도 넣는다 (혼자 눌러보는 경우)
  if (!names[uid]) names[uid] = '친구';

  const alive = Object.keys(names);
  if (alive.length === 0) {
    return NextResponse.json({ error: '아무도 없어요' }, { status: 400 });
  }

  /**
   * 씨앗은 **판에 안 적는다.** 이 프로젝트는 소스가 열려 있어서, 씨앗만 알면
   * 누구나 같은 계산을 돌려 문제 차례와 정답을 전부 뽑아낼 수 있다.
   * 그래서 뽑아낸 문제 목록만 서버 전용 문서에 넣어둔다.
   */
  const seed = (now ^ (alive.length * 2654435761)) >>> 0;
  const questions = pickQuestions(seed, MAX_ROUNDS, grade);
  if (questions.length === 0) {
    return NextResponse.json({ error: '낼 문제가 없어요' }, { status: 500 });
  }

  await gameRef(schoolId, roomKey).set({ questions, createdAt: now });

  const state: RoomState = {
    status: 'asking',
    round: 1,
    total: questions.length,
    q: questions[0].q,
    endsAt: now + ANSWER_MS,
    revealAt: now + ANSWER_MS + REVEAL_MS,
    nextAt: 0,
    answer: null,
    why: null,
    alive,
    out: [],
    winners: [],
    names,
    startedBy: uid,
    serverNow: now,
  };
  await roomRef(schoolId, roomKey).set(state);

  // 지난 판의 답이 남아 있으면 첫 문제가 자동으로 채점된다
  await clearPicks(schoolId, roomKey);

  return NextResponse.json({ ok: true, serverNow: now, round: 1 });
}

/**
 * 판을 한 칸 넘긴다.
 *
 * **아무나 불러도 된다.** 서른 명이 동시에 불러도 결과가 같아야 하므로
 * 트랜잭션 안에서 '지금 무슨 때인가'를 다시 보고, 아직 때가 아니면 아무것도 안 한다.
 * 판을 시작한 아이가 나가버려도 놀이가 멈추지 않는다 — 남은 아이 누구든 넘긴다.
 */
async function advance(schoolId: string, roomKey: string, now: number) {
  const db = adminDb();
  const rRef = roomRef(schoolId, roomKey);

  const gameSnap = await gameRef(schoolId, roomKey).get();
  const questions = (gameSnap.data()?.questions ?? []) as OXQuestion[];
  if (questions.length === 0) {
    return NextResponse.json({ error: '진행 중인 판이 없어요' }, { status: 400 });
  }

  // 답은 트랜잭션 밖에서 읽는다 — 시간이 지나 더는 안 바뀌기 때문이다
  const picksSnap = await db.collection(`schools/${schoolId}/oxRooms/${roomKey}/picks`).get();
  const picks: Record<string, { v?: OX; round?: number }> = {};
  for (const d of picksSnap.docs) picks[d.id] = d.data() as { v?: OX; round?: number };

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(rRef);
    const st = snap.data() as RoomState | undefined;
    if (!st || st.status === 'done' || st.status === 'waiting') return { moved: false };

    // ── 정답 열기 ──
    if (st.status === 'asking') {
      if (now < st.revealAt) return { moved: false };

      const cur = questions[st.round - 1];
      if (!cur) return { moved: false };

      const chosen: Record<string, OX | undefined> = {};
      for (const uid of st.alive) {
        const p = picks[uid];
        // **이번 문제에 낸 답만 센다.** 지난 문제 답이 그대로 남아 있으면
        // 가만히 있어도 계속 살아남는다.
        chosen[uid] = p?.round === st.round ? p.v : undefined;
      }

      const { survivors, eliminated } = judgeRound(st.alive, chosen, cur.a);
      const outcome = roundOutcome(st.alive, survivors, st.round, st.total);

      tx.update(rRef, {
        status: 'reveal',
        answer: cur.a,
        why: cur.why,
        out: [...st.out, ...eliminated],
        alive: outcome.keep,
        winners: outcome.winners,
        nextAt: now + NEXT_MS,
        serverNow: now,
        // 끝나는 판이면 다음 문제를 기다릴 필요가 없다
        ...(outcome.done ? { endsAt: now, revealAt: now } : {}),
      });
      return { moved: true, revealed: true, done: outcome.done };
    }

    // ── 다음 문제 ──
    if (st.status === 'reveal') {
      if (now < st.nextAt) return { moved: false };
      if (st.winners.length > 0 || st.round >= st.total || st.alive.length <= 1) {
        tx.update(rRef, { status: 'done', serverNow: now });
        return { moved: true, done: true };
      }
      const next = questions[st.round];
      if (!next) {
        tx.update(rRef, { status: 'done', winners: st.alive, serverNow: now });
        return { moved: true, done: true };
      }
      tx.update(rRef, {
        status: 'asking',
        round: st.round + 1,
        q: next.q,
        answer: null,
        why: null,
        endsAt: now + ANSWER_MS,
        revealAt: now + ANSWER_MS + REVEAL_MS,
        nextAt: 0,
        serverNow: now,
      });
      return { moved: true, asked: true };
    }

    return { moved: false };
  });

  return NextResponse.json({ ok: true, serverNow: now, ...result });
}

/** 지난 판의 답을 치운다 */
async function clearPicks(schoolId: string, roomKey: string) {
  const db = adminDb();
  const snap = await db.collection(`schools/${schoolId}/oxRooms/${roomKey}/picks`).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}
