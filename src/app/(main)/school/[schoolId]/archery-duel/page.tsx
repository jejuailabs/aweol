'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { aimAt, shotSetup, type ShotSetup } from '@/lib/archery';
import {
  DUEL_SHOTS, SHOT_LIMIT_MS, duelResult, shotIndexOf, whoseTurn,
  type DuelState,
} from '@/lib/archery-duel';

const ArcheryScene = dynamic(() => import('@/components/gallery3d/ArcheryScene'), { ssr: false });

/** 화살 날아가는 시간(ms) — 혼자 하는 양궁과 같게 */
const FLIGHT_MS = 620;

interface RoomDoc {
  seed: number;
  status: 'waiting' | 'playing' | 'done';
  code: string;
  size: number;
  players: { uid: string; name: string; shots: number[]; marks?: { x: number; y: number }[] }[];
  turnStartedMs: number;
}

/**
 * 양궁 대결 — 턴제 1:1.
 *
 * 방을 만들면 번호가 나오고 상대가 그 번호로 들어온다. 번갈아 쏜다.
 * **점수·차례는 서버가 정한다.** 화면은 방 문서를 실시간으로 읽어 따라간다.
 */
export default function ArcheryDuelPage() {
  const router = useRouter();
  const schoolId = String(useParams().schoolId ?? '');
  const { user } = useAuth();

  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  /** 내 차례가 시작된 시각(로컬). 조준 흔들림·남은 시간을 여기서 잰다. */
  const [myTurnStart, setMyTurnStart] = useState(0);
  const [flight, setFlight] = useState<{ x: number; y: number } | null>(null);
  const [leftSec, setLeftSec] = useState(15);
  const firedThisTurn = useRef(false);

  // 방 실시간 구독
  useEffect(() => {
    if (!db || !roomId) return;
    return onSnapshot(doc(db, `schools/${schoolId}/archeryDuels/${roomId}`), (snap) => {
      setRoom(snap.exists() ? (snap.data() as RoomDoc) : null);
    });
  }, [schoolId, roomId]);

  const state: DuelState | null = room
    ? { players: room.players.map((p) => ({ uid: p.uid, name: p.name, shots: p.shots })), size: room.size }
    : null;
  const turn = state ? whoseTurn(state) : null;
  const myTurn = !!user && turn === user.uid;
  const me = room?.players.find((p) => p.uid === user?.uid) ?? null;
  const foe = room?.players.find((p) => p.uid !== user?.uid) ?? null;

  // 내 차례가 되면 흔들림 시계를 시작한다
  useEffect(() => {
    if (myTurn && room?.status === 'playing') {
      firedThisTurn.current = false;
      setFlight(null);
      setMyTurnStart(performance.now());
    }
  }, [myTurn, room?.status, me?.shots.length]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/archery-duel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ schoolId, ...body }),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }, [schoolId]);

  const create = async () => {
    if (!user) { setErr('로그인하면 대결할 수 있어요'); return; }
    setBusy(true); setErr('');
    const { ok, data } = await post({ action: 'create' });
    if (ok) setRoomId(data.roomId); else setErr(data.error || '방을 못 만들었어요');
    setBusy(false);
  };

  const join = async () => {
    if (!user) { setErr('로그인하면 대결할 수 있어요'); return; }
    if (!/^\d{4}$/.test(joinCode)) { setErr('4자리 번호를 넣어주세요'); return; }
    setBusy(true); setErr('');
    const { ok, data } = await post({ action: 'join', code: joinCode });
    if (ok) setRoomId(data.roomId); else setErr(data.error || '못 들어갔어요');
    setBusy(false);
  };

  /** 격발 — 서버가 점수·차례를 정한다 */
  const shoot = useCallback(async (aimMs: number) => {
    if (firedThisTurn.current) return;
    firedThisTurn.current = true;
    // 화면에서 화살을 날린다(자리는 서버가 확정하지만 연출은 지금 위치로)
    if (room) {
      const p = aimAt(shotSetup(room.seed, shotIndexOf(
        { players: room.players, size: room.size }, user!.uid
      )), aimMs);
      setFlight({ x: p.x + 0, y: p.y }); // 연출용, 바람은 서버가 더한다
    }
    playSound('tap');
    setTimeout(async () => {
      setFlight(null);
      const { ok, data } = await post({ action: 'shot', roomId, aimMs });
      if (ok) playSound(data.score >= 9 ? 'success' : 'like');
    }, FLIGHT_MS);
  }, [post, roomId, room, user]);

  // 격발 버튼 + 15초 카운트다운(넘으면 자동 0점)
  useEffect(() => {
    if (!myTurn || room?.status !== 'playing' || !myTurnStart) return;
    const tick = setInterval(() => {
      const elapsed = performance.now() - myTurnStart;
      const left = Math.max(0, Math.ceil((SHOT_LIMIT_MS - elapsed) / 1000));
      setLeftSec(left);
      if (elapsed >= SHOT_LIMIT_MS && !firedThisTurn.current) {
        shoot(SHOT_LIMIT_MS); // 시간 초과 — 0점 처리는 서버가
      }
    }, 200);
    return () => clearInterval(tick);
  }, [myTurn, room?.status, myTurnStart, shoot]);

  const setup: ShotSetup | null = room && myTurn && !flight
    ? shotSetup(room.seed, shotIndexOf({ players: room.players, size: room.size }, user!.uid))
    : null;

  /** 지금 보여줄 과녁 자국 — 내 차례면 내 것, 상대 차례면 상대 것 */
  const showHits = (myTurn ? me : (turn ? foe : me))?.marks?.filter((m) => Math.hypot(m.x, m.y) < 120) ?? [];

  const result = state ? duelResult(state) : null;

  // ---- 방에 들어가기 전 ----
  if (!room) {
    return (
      <div className="px-4 pt-6 pb-28 mx-auto max-w-[420px]">
        <button onClick={() => router.push(`/school/${schoolId}/playground`)} className="ac-btn px-3.5 py-2 text-sm mb-4">
          ← 운동장으로
        </button>
        <h1 className="text-xl font-black mb-1" style={{ color: 'var(--color-text-main)' }}>🏹 양궁 대결</h1>
        <p className="text-[14px] mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          둘이 번갈아 쏴서 점수 높은 사람이 이겨요. 방을 만들거나, 친구가 준 번호로 들어가요.
        </p>

        <button onClick={create} disabled={busy}
          className="w-full rounded-2xl py-4 mb-4 text-[16px] font-black text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}>
          방 만들기
        </button>

        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface)' }}>
          <div className="text-[14px] font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>번호로 들어가기</div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="4자리 번호"
              className="flex-1 min-w-0 rounded-xl px-3 py-3 text-[18px] font-black text-center tracking-widest outline-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
            <button onClick={join} disabled={busy}
              className="shrink-0 rounded-xl px-5 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}>
              들어가기
            </button>
          </div>
        </div>

        {err && <div className="rounded-xl px-3 py-2.5 mt-3 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>⚠️ {err}</div>}
      </div>
    );
  }

  // ---- 상대를 기다리는 중 ----
  if (room.status === 'waiting') {
    return (
      <div className="px-4 pt-10 pb-28 mx-auto max-w-[420px] text-center">
        <div className="text-4xl mb-3">🏹</div>
        <div className="text-[15px] font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>친구를 기다리는 중...</div>
        <div className="text-[13px] mb-4" style={{ color: 'var(--color-text-sub)' }}>이 번호를 친구에게 알려주세요</div>
        <div className="text-[56px] font-black tracking-widest" style={{ color: 'var(--color-primary)' }}>{room.code}</div>
        <button onClick={() => { setRoomId(''); setRoom(null); }} className="ac-btn px-4 py-2 text-sm mt-6">
          그만두기
        </button>
      </div>
    );
  }

  // ---- 대결 중 / 끝 ----
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* 지금 쏘는 사람의 자국을 보여준다. 내 차례일 때만 활·조준선이 뜬다. */}
      <ArcheryScene
        setup={setup}
        startedAt={myTurnStart}
        shooting={!!flight}
        flight={flight}
        hits={showHits}
      />

      <button onClick={() => { setRoomId(''); setRoom(null); }} className="ac-btn pos-top-safe absolute left-4 z-30 px-3.5 py-2 text-sm">
        ← 나가기
      </button>

      {/* 점수판 — 나 vs 상대, 위쪽 가운데 */}
      <div className="pos-top-safe absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl px-4 py-2"
        style={{ background: 'rgba(255,248,231,0.96)', border: '3px solid #EFE3CB' }}>
        <div className="text-center">
          <div className="text-[12px] font-bold truncate max-w-[90px]" style={{ color: turn === me?.uid ? 'var(--color-primary)' : '#8A7A5F' }}>
            {me?.name}{turn === me?.uid ? ' ●' : ''}
          </div>
          <div className="text-[22px] font-black tabular-nums" style={{ color: '#2E8B57' }}>
            {me?.shots.reduce((a, b) => a + b, 0) ?? 0}
          </div>
        </div>
        <div className="text-[13px] font-black" style={{ color: '#C4B79E' }}>vs</div>
        <div className="text-center">
          <div className="text-[12px] font-bold truncate max-w-[90px]" style={{ color: turn === foe?.uid ? 'var(--color-primary)' : '#8A7A5F' }}>
            {foe?.name ?? '상대'}{turn === foe?.uid ? ' ●' : ''}
          </div>
          <div className="text-[22px] font-black tabular-nums" style={{ color: '#2E8B57' }}>
            {foe?.shots.reduce((a, b) => a + b, 0) ?? 0}
          </div>
        </div>
      </div>

      {/* 아래 — 내 차례면 쏘기, 아니면 기다림, 끝나면 결과 */}
      <div className="pos-above-nav absolute left-4 right-4 z-30 mx-auto max-w-[420px]">
        {room.status === 'done' && result ? (
          <div className="rounded-3xl p-5 text-center" style={{ background: 'rgba(255,250,240,0.97)', border: '3px solid rgba(255,255,255,0.7)' }}>
            <div className="text-[22px] font-black mb-1" style={{ color: '#2E8B57' }}>
              {result.draw ? '🤝 비겼어요!' : result.winnerUid === user?.uid ? '🎉 이겼어요!' : '아쉬워요 😢'}
            </div>
            <div className="text-[14px] mb-3" style={{ color: '#8A7A5F' }}>
              {me?.name} {result.totals[me?.uid ?? ''] ?? 0} · {foe?.name} {result.totals[foe?.uid ?? ''] ?? 0}
            </div>
            <button onClick={() => { setRoomId(''); setRoom(null); }}
              className="w-full rounded-2xl py-3.5 text-[15px] font-black text-white" style={{ background: 'var(--color-primary)' }}>
              다시 하기
            </button>
          </div>
        ) : myTurn ? (
          <>
            <div className="text-center text-[14px] font-black mb-2" style={{ color: leftSec <= 5 ? '#B02A37' : '#6B5B43' }}>
              내 차례! {leftSec}초 안에 쏘세요
            </div>
            <button onClick={() => shoot(performance.now() - myTurnStart)} disabled={!!flight}
              className="w-full rounded-2xl py-5 text-[18px] font-black text-white active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'var(--color-primary)', boxShadow: '0 6px 0 rgba(0,0,0,0.18)' }}>
              {flight ? '화살이 날아가는 중...' : '🏹 쏘기'}
            </button>
          </>
        ) : (
          <div className="rounded-2xl py-4 text-center text-[15px] font-bold" style={{ background: 'rgba(255,248,231,0.95)', color: '#6B5B43' }}>
            {foe?.name ?? '상대'}가 쏘는 중이에요...
          </div>
        )}
        {err && <div className="rounded-xl px-3 py-2 mt-2 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>⚠️ {err}</div>}
      </div>
    </div>
  );
}
