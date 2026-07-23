import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import {
  REVEAL_MS, NEXT_MS, TOTAL_ROUNDS, MAX_SEATS,
  pickBellQuestions, isCorrect, answerText, bellOutcome, timeFor,
  type BellQuestion, type BellKind,
} from '@/lib/goldenbell';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 도전 골든벨 — **정답은 서버만 쥔다.**
 *
 * 얼개는 광장 OX 퀴즈(`/api/ox`)와 같다. 문제·정답은 규칙이 아무에게도
 * 안 보여주는 `bellGames/{roomKey}` 에 있고, 자리에 보이는 판에는
 * **문제와 보기만** 올라간다. 정답은 시간이 다 지난 뒤에 서버가 올린다.
 *
 * 다른 점은 시간이다 — **주관식은 글로 적어야 하니 더 준다.**
 * 그래서 시간이 문제마다 다르고, 그 시간을 서버가 정해 판에 적는다.
 */

interface RoomState {
  status: 'waiting' | 'asking' | 'reveal' | 'done';
  round: number;
  total: number;
  q: string;
  kind: BellKind;
  choices: string[] | null;
  endsAt: number;
  revealAt: number;
  nextAt: number;
  /** 열린 정답 (사람이 읽는 말로) */
  answer: string | null;
  why: string | null;
  /** 이번 문제를 맞힌 사람 — 자리 그림을 그릴 때 쓴다 */
  lastCorrect: string[];
  alive: string[];
  out: string[];
  winners: string[];
  names: Record<string, string>;
  grade: number | null;
  startedBy: string;
  serverNow: number;
}

const roomRef = (schoolId: string, roomKey: string) =>
  adminDb().doc(`schools/${schoolId}/bellRooms/${roomKey}`);
const gameRef = (schoolId: string, roomKey: string) =>
  adminDb().doc(`schools/${schoolId}/bellGames/${roomKey}`);

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; roomKey?: string; action?: string; grade?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = String(body.schoolId || '').trim();
  const roomKey = String(body.roomKey || 'hall').trim().slice(0, 40);
  if (!schoolId || !body.action) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const now = Date.now();
  if (body.action === 'start') {
    const grade = Number(body.grade);
    return start(schoolId, roomKey, user.uid, now, grade >= 1 && grade <= 6 ? grade : undefined);
  }
  if (body.action === 'advance') return advance(schoolId, roomKey, now);
  return NextResponse.json({ error: '알 수 없는 요청' }, { status: 400 });
}

async function start(schoolId: string, roomKey: string, uid: string, now: number, grade?: number) {
  const players = await adminDb()
    .collection(`schools/${schoolId}/bellRooms/${roomKey}/players`)
    .get();

  const names: Record<string, string> = {};
  for (const d of players.docs) {
    names[d.id] = String((d.data() as { n?: string }).n || '친구').slice(0, 20);
  }
  if (!names[uid]) names[uid] = '친구';

  /**
   * **자리는 서른까지.**
   *
   * 서른한 번째 아이는 앉을 자리가 없다 — 화면에도 안 들어가고,
   * 무엇보다 **자리에 앉는 것이 이 놀이의 절반**이다.
   * 먼저 들어온 순서로 앉힌다(문서 이름 순이 아니라 들어온 시각 순).
   */
  const ordered = players.docs
    .slice()
    .sort((a, b) => {
      const ta = (a.data() as { at?: { toMillis?: () => number } }).at?.toMillis?.() ?? 0;
      const tb = (b.data() as { at?: { toMillis?: () => number } }).at?.toMillis?.() ?? 0;
      return ta - tb;
    })
    .map((d) => d.id);
  const seatList = ordered.length ? ordered : Object.keys(names);
  const alive = seatList.slice(0, MAX_SEATS);
  if (!alive.includes(uid) && alive.length < MAX_SEATS) alive.push(uid);

  if (alive.length === 0) return NextResponse.json({ error: '앉은 사람이 없어요' }, { status: 400 });

  const seed = (now ^ (alive.length * 40503)) >>> 0;
  const questions = pickBellQuestions(seed, TOTAL_ROUNDS, grade);
  if (questions.length === 0) return NextResponse.json({ error: '낼 문제가 없어요' }, { status: 500 });

  await gameRef(schoolId, roomKey).set({ questions, createdAt: now });

  const q0 = questions[0];
  const span = timeFor(q0.kind);
  const state: RoomState = {
    status: 'asking',
    round: 1,
    total: questions.length,
    q: q0.q,
    kind: q0.kind,
    choices: q0.choices ?? null,
    endsAt: now + span,
    revealAt: now + span + REVEAL_MS,
    nextAt: 0,
    answer: null,
    why: null,
    lastCorrect: [],
    alive,
    out: [],
    winners: [],
    names,
    grade: grade ?? null,
    startedBy: uid,
    serverNow: now,
  };
  await roomRef(schoolId, roomKey).set(state);
  await clearAnswers(schoolId, roomKey);

  return NextResponse.json({ ok: true, serverNow: now, seats: alive.length });
}

async function advance(schoolId: string, roomKey: string, now: number) {
  const db = adminDb();
  const rRef = roomRef(schoolId, roomKey);

  const gameSnap = await gameRef(schoolId, roomKey).get();
  const questions = (gameSnap.data()?.questions ?? []) as BellQuestion[];
  if (questions.length === 0) {
    return NextResponse.json({ error: '진행 중인 판이 없어요' }, { status: 400 });
  }

  const ansSnap = await db.collection(`schools/${schoolId}/bellRooms/${roomKey}/answers`).get();
  const given: Record<string, { v?: unknown; round?: number }> = {};
  for (const d of ansSnap.docs) given[d.id] = d.data() as { v?: unknown; round?: number };

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(rRef);
    const st = snap.data() as RoomState | undefined;
    if (!st || st.status === 'done' || st.status === 'waiting') return { moved: false };

    if (st.status === 'asking') {
      if (now < st.revealAt) return { moved: false };
      const cur = questions[st.round - 1];
      if (!cur) return { moved: false };

      const survivors: string[] = [];
      const eliminated: string[] = [];
      for (const uid of st.alive) {
        const a = given[uid];
        // 이번 문제에 낸 답만 센다 — 지난 답이 남아 있으면 가만히 있어도 산다
        const v = a?.round === st.round ? a.v : undefined;
        if (isCorrect(cur, v)) survivors.push(uid);
        else eliminated.push(uid);
      }

      const outcome = bellOutcome(st.alive, survivors, st.round, st.total);
      tx.update(rRef, {
        status: 'reveal',
        answer: answerText(cur),
        why: cur.why,
        lastCorrect: survivors,
        out: [...st.out, ...eliminated],
        alive: outcome.keep,
        winners: outcome.winners,
        nextAt: now + NEXT_MS,
        serverNow: now,
        ...(outcome.done ? { endsAt: now, revealAt: now } : {}),
      });
      return { moved: true, revealed: true, done: outcome.done };
    }

    if (st.status === 'reveal') {
      if (now < st.nextAt) return { moved: false };
      if (st.winners.length > 0 || st.round >= st.total) {
        tx.update(rRef, { status: 'done', serverNow: now });
        return { moved: true, done: true };
      }
      const next = questions[st.round];
      if (!next) {
        tx.update(rRef, { status: 'done', winners: st.alive, serverNow: now });
        return { moved: true, done: true };
      }
      const span = timeFor(next.kind);
      tx.update(rRef, {
        status: 'asking',
        round: st.round + 1,
        q: next.q,
        kind: next.kind,
        choices: next.choices ?? null,
        answer: null,
        why: null,
        lastCorrect: [],
        endsAt: now + span,
        revealAt: now + span + REVEAL_MS,
        nextAt: 0,
        serverNow: now,
      });
      return { moved: true, asked: true };
    }

    return { moved: false };
  });

  return NextResponse.json({ ok: true, serverNow: now, ...result });
}

async function clearAnswers(schoolId: string, roomKey: string) {
  const db = adminDb();
  const snap = await db.collection(`schools/${schoolId}/bellRooms/${roomKey}/answers`).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}
