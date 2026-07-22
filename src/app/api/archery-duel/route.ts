import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';
import { landing, ringScore, shotSetup } from '@/lib/archery';
import {
  DUEL_SHOTS, SHOT_LIMIT_MS, shotIndexOf, whoseTurn,
  type DuelState,
} from '@/lib/archery-duel';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 양궁 대결 — 턴제 1:1.
 *
 * 둘이 각자 기계로 들어와 번갈아 쏜다. **점수와 차례는 서버가 정한다** —
 * 클라이언트가 점수나 '내 차례' 를 우기면 대결이 의미를 잃는다.
 *
 * 방 문서에 씨앗을 하나 둔다. 둘 다 같은 씨앗을 쓰므로 같은 화살 번호에서는
 * 같은 바람·흔들림이다(공평하다). 각자 자기가 쏜 발 수가 화살 번호가 된다.
 */

function roomsCol(db: Firestore, schoolId: string) {
  return db.collection('schools').doc(schoolId).collection('archeryDuels');
}

/** 참가 코드 — 서버가 정한다. 4자리 숫자, 읽기 쉬운 것. */
function makeCode(): string {
  // 0/1/O/I 없이. 여기선 숫자만 쓴다(아이가 부르기 쉽다).
  return String(1000 + Math.floor(Math.random() * 9000));
}

type Body = {
  action?: string;
  schoolId?: string;
  roomId?: string;
  code?: string;
  aimMs?: number;
};

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const schoolId = String(body.schoolId ?? '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const db = adminDb();

  // ---- 방 만들기 ----
  if (body.action === 'create') {
    const seed = (Math.floor(Math.random() * 0xffffffff) | 0) || 1;
    const code = makeCode();
    const ref = await roomsCol(db, schoolId).add({
      code,
      seed,
      size: 2,
      status: 'waiting',
      players: [{ uid: user.uid, name: user.displayName, shots: [], marks: [] }],
      turnStartedMs: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ roomId: ref.id, code });
  }

  // ---- 참가 ----
  if (body.action === 'join') {
    const code = String(body.code ?? '').trim();
    if (!/^\d{4}$/.test(code)) {
      return NextResponse.json({ error: '4자리 번호를 넣어주세요' }, { status: 400 });
    }
    const snap = await roomsCol(db, schoolId)
      .where('code', '==', code).where('status', '==', 'waiting').limit(1).get();
    if (snap.empty) return NextResponse.json({ error: '그런 방이 없어요' }, { status: 404 });

    const ref = snap.docs[0].ref;
    const out = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const d = cur.data() as { players: { uid: string }[]; size: number };
      if (d.players.some((p) => p.uid === user.uid)) return { roomId: ref.id }; // 이미 들어옴
      if (d.players.length >= d.size) return { error: '방이 꽉 찼어요', status: 409 };
      const players = [...d.players, { uid: user.uid, name: user.displayName, shots: [], marks: [] }];
      const full = players.length >= d.size;
      tx.update(ref, {
        players,
        status: full ? 'playing' : 'waiting',
        // 시작하는 순간 첫 사람의 격발 시계가 돈다
        turnStartedMs: full ? Date.now() : 0,
      });
      return { roomId: ref.id };
    });
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(out);
  }

  // ---- 격발 ----
  if (body.action === 'shot') {
    const roomId = String(body.roomId ?? '').trim();
    if (!roomId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    const ref = roomsCol(db, schoolId).doc(roomId);

    const out = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists) return { error: '없는 방이에요', status: 404 };
      const d = cur.data() as {
        seed: number; status: string; turnStartedMs: number;
        players: { uid: string; name: string; shots: number[]; marks: { x: number; y: number }[] }[];
        size: number;
      };
      if (d.status !== 'playing') return { error: '아직 시작하지 않았어요', status: 409 };

      const state: DuelState = { players: d.players.map((p) => ({ ...p })), size: d.size };
      const turn = whoseTurn(state);
      if (turn !== user.uid) return { error: '내 차례가 아니에요', status: 409 };

      /**
       * 격발 시각(ms). 클라이언트가 보내지만 **서버가 다시 잰다** —
       * `turnStartedMs` 부터 지금까지가 진짜 흐른 시간이다.
       * 15초를 넘겼으면 0점(시간 초과). 안에서 쐈으면 보낸 값을 믿되 상한을 건다.
       */
      const serverElapsed = Date.now() - (d.turnStartedMs || Date.now());
      let aimMs = typeof body.aimMs === 'number' && Number.isFinite(body.aimMs) && body.aimMs >= 0
        ? body.aimMs : SHOT_LIMIT_MS;
      // 서버가 잰 시간보다 더 빠르다고 우길 수 없다(여유 1초)
      if (aimMs > serverElapsed + 1000) aimMs = serverElapsed;

      const idx = shotIndexOf(state, user.uid);
      let score = 0;
      let mark = { x: 999, y: 999 }; // 과녁 밖 = 안 꽂힘
      if (serverElapsed <= SHOT_LIMIT_MS && aimMs <= SHOT_LIMIT_MS) {
        const p = landing(shotSetup(d.seed, idx), aimMs);
        score = ringScore(p.x, p.y);
        mark = { x: p.x, y: p.y };
      }

      const players = d.players.map((p) =>
        p.uid === user.uid
          ? { ...p, shots: [...p.shots, score], marks: [...(p.marks ?? []), mark] }
          : p
      );
      const nextState: DuelState = { players, size: d.size };
      const done = players.every((p) => p.shots.length >= DUEL_SHOTS);

      tx.update(ref, {
        players,
        status: done ? 'done' : 'playing',
        // 다음 사람의 격발 시계를 새로 시작한다
        turnStartedMs: done ? 0 : Date.now(),
      });
      return { score, done, nextTurn: done ? null : whoseTurn(nextState) };
    });

    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(out);
  }

  return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
}
