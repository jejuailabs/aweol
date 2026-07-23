'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';

const PlazaScene = dynamic(() => import('@/components/gallery3d/PlazaScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

/**
 * 광장 OX 퀴즈.
 *
 * **문제만 내려오고 정답은 안 내려온다.** 정답은 시간이 다 지난 뒤에
 * 서버가 판에 올린다(`/api/ox`). 이 화면은 정답을 미리 알 방법이 없다 —
 * 알면 놀이가 끝나니까.
 *
 * **시계는 서버 것을 쓴다.** 판에 적힌 `serverNow` 로 내 기기 시계와의
 * 차이를 재서 남은 시간을 센다. 이 프로젝트에서 실제로 **PC 시계가 8초 빨라서**
 * 시간 검증이 틀린 적이 있다 — 아이 기기라고 정확할 이유가 없다.
 */

interface RoomState {
  status: 'waiting' | 'asking' | 'reveal' | 'done';
  round: number;
  total: number;
  q: string;
  endsAt: number;
  revealAt: number;
  nextAt: number;
  answer: 'O' | 'X' | null;
  why: string | null;
  alive: string[];
  out: string[];
  winners: string[];
  names: Record<string, string>;
  serverNow: number;
}

const ROOM = 'plaza';

export default function PlazaPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const { user, userDoc } = useAuth();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [side, setSide] = useState<'O' | 'X' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /**
   * 서버 시계 − 내 시계.
   *
   * **상태로 둔다.** 남은 시간을 그릴 때 읽는 값이라 ref 로 두면
   * 그리는 중에 ref 를 읽게 된다 — 그러면 값이 바뀌어도 화면이 안 따라온다.
   */
  const [skew, setSkew] = useState(0);
  /**
   * 서버 기준 지금.
   *
   * **그리는 중에 `Date.now()` 를 부르지 않는다** — 그리기는 같은 값에 같은
   * 그림이 나와야 하는데 시계는 부를 때마다 다르다. 상태에 담아두고
   * 아래 타이머가 갈아 끼운다.
   */
  const [now, setNow] = useState(0);

  const me = user?.uid ?? '';
  const amOut = !!room && room.out.includes(me);
  const amAlive = !!room && room.alive.includes(me);
  const amWinner = !!room && room.winners.includes(me);

  // 판을 지켜본다
  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(doc(db, 'schools', schoolId, 'oxRooms', ROOM), (s) => {
      const v = s.data() as RoomState | undefined;
      if (!v) { setRoom(null); return; }
      if (typeof v.serverNow === 'number') setSkew(v.serverNow - Date.now());
      setRoom(v);
    }, () => {});
  }, [schoolId]);

  // 남은 시간을 보여주려면 계속 다시 그려야 한다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 200);
    return () => clearInterval(t);
  }, [skew]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/ox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId, roomKey: ROOM, action, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || '안 됐어요');
    return json;
  }, [schoolId]);

  // 광장에 들어오면 이름을 적어둔다 — 시작할 때 이 목록을 붙잡는다
  useEffect(() => {
    if (!db || !user || !schoolId) return;
    setDoc(
      doc(db, 'schools', schoolId, 'oxRooms', ROOM, 'players', user.uid),
      { n: (userDoc?.displayName || '친구').slice(0, 20), at: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  }, [user, userDoc?.displayName, schoolId]);

  /**
   * 내가 선 쪽을 적는다.
   *
   * **금을 넘을 때만 적는다.** 걸을 때마다 적으면 한 문제에 수십 번 쓴다.
   * 시간이 지난 뒤 쓰기는 규칙이 막으므로, 여기서 실패해도 그냥 둔다.
   */
  useEffect(() => {
    if (!db || !user || !room || room.status !== 'asking' || !amAlive || !side) return;
    if (Date.now() + skew >= room.endsAt) return;
    setDoc(
      doc(db, 'schools', schoolId, 'oxRooms', ROOM, 'picks', user.uid),
      { v: side, round: room.round },
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, room?.round, room?.status, amAlive]);

  /**
   * 때가 되면 판을 넘긴다.
   *
   * **아무나 부른다.** 서버가 시간을 다시 보고 아직이면 아무것도 안 한다.
   * 시작한 아이가 나가버려도 놀이가 안 멈춘다 — 이게 교실에서 제일 흔한 일이다.
   */
  useEffect(() => {
    if (!room || !user) return;
    if (room.status !== 'asking' && room.status !== 'reveal') return;
    const due = room.status === 'asking' ? room.revealAt : room.nextAt;
    const wait = Math.max(0, due - (Date.now() + skew)) + 250;
    const t = setTimeout(() => { call('advance').catch(() => {}); }, wait);
    return () => clearTimeout(t);
  }, [room, user, call, skew]);

  // 정답이 열릴 때 소리
  const lastRevealed = useRef(0);
  useEffect(() => {
    if (!room || room.status !== 'reveal' || lastRevealed.current === room.round) return;
    lastRevealed.current = room.round;
    playSound(room.alive.includes(me) ? 'success' : 'error');
  }, [room?.status, room?.round, me, room]);

  const start = async () => {
    setBusy(true); setErr('');
    try { await call('start'); playSound('success'); }
    catch (e) { setErr((e as Error).message); playSound('error'); }
    setBusy(false);
  };

  // ── 화면 위에 얹는 것 ──────────────────────────────────
  const asking = room?.status === 'asking';
  const revealing = room?.status === 'reveal';
  const left = room && now ? Math.max(0, Math.ceil((room.endsAt - now) / 1000)) : 0;
  // 시계를 아직 못 받았으면(now === 0) 잠긴 것으로 보지 않는다
  const locked = !!room && asking && now > 0 && now >= room.endsAt;

  const hud = (
    <>
      <button
        onClick={() => router.push(`/school/${schoolId}/playground`)}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 나가기
      </button>

      {/* 문제 판 */}
      {room && room.status !== 'waiting' && (
        <div className="pos-top-safe fixed left-1/2 -translate-x-1/2 z-30 w-[min(92vw,520px)]">
          <div
            className="rounded-2xl px-4 py-3 text-center"
            style={{ background: 'rgba(255,250,240,0.96)', border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}
          >
            <div className="flex items-center justify-center gap-2 text-[12px] font-bold" style={{ color: '#A6762A' }}>
              <span>{room.round} / {room.total}번</span>
              <span>·</span>
              <span>{room.alive.length}명 남음</span>
            </div>
            <div className="text-[16px] font-black mt-1 leading-snug" style={{ color: '#3A3226' }}>
              {room.q}
            </div>

            {asking && !locked && (
              <div className="text-[26px] font-black mt-1" style={{ color: left <= 3 ? '#C0392B' : '#3BAF9F' }}>
                {left}
              </div>
            )}
            {locked && (
              <div className="text-[14px] font-bold mt-1" style={{ color: '#8A7A5F' }}>
                ✋ 그만! 곧 정답이 열려요
              </div>
            )}
            {revealing && room.answer && (
              <div className="mt-1">
                <div className="text-[28px] font-black" style={{ color: room.answer === 'O' ? '#3BAF9F' : '#E8604C' }}>
                  정답은 {room.answer}
                </div>
                {room.why && (
                  <div className="text-[13px] leading-relaxed mt-0.5" style={{ color: '#5B4A3B' }}>
                    {room.why}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 내 상태 */}
      {room && room.status !== 'waiting' && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[112px] z-30">
          <div
            className="rounded-full px-4 py-2 text-[13px] font-bold"
            style={{
              background: amOut ? 'rgba(90,80,70,0.85)' : 'rgba(255,250,240,0.95)',
              color: amOut ? 'white' : '#5B4A3B',
            }}
          >
            {amOut
              ? '😢 탈락했어요 — 끝까지 같이 봐요'
              : side
                ? `${side} 쪽에 서 있어요`
                : '아직 금 위예요 — 한쪽으로 가세요'}
          </div>
        </div>
      )}

      {/* 시작 / 결과 */}
      {(!room || room.status === 'waiting' || room.status === 'done') && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[92px]">
          <div
            className="mx-auto w-[min(92vw,460px)] rounded-3xl p-5 text-center"
            style={{ background: 'rgba(255,250,240,0.97)', border: '3px solid rgba(255,255,255,0.8)' }}
          >
            {room?.status === 'done' ? (
              <>
                <div className="text-[34px] mb-1">{amWinner ? '🏆' : '🎉'}</div>
                <div className="text-[17px] font-black mb-1" style={{ color: '#3A3226' }}>
                  {room.winners.length === 0
                    ? '이번엔 아무도 못 남았어요'
                    : room.winners.length === 1
                      ? `${room.names[room.winners[0]] ?? '친구'} 우승!`
                      : `${room.winners.length}명이 함께 우승!`}
                </div>
                <div className="text-[13px] mb-3" style={{ color: '#8A7A5F' }}>
                  {room.winners.map((u) => room.names[u] ?? '친구').join(' · ')}
                </div>
              </>
            ) : (
              <>
                <div className="text-[34px] mb-1">🙋</div>
                <div className="text-[17px] font-black mb-1" style={{ color: '#3A3226' }}>OX 퀴즈</div>
                <p className="text-[13px] leading-relaxed mb-3" style={{ color: '#8A7A5F' }}>
                  왼쪽이 <b>O</b>, 오른쪽이 <b>X</b> 예요. 문제가 나오면 <b>10초 안에</b> 한쪽으로 가세요.<br />
                  가운데 금 위에 있으면 답을 안 낸 거예요.
                </p>
              </>
            )}
            {err && <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{err}</div>}
            <button
              onClick={start}
              disabled={busy || !user}
              className="w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy ? '여는 중...' : room?.status === 'done' ? '한 판 더 🙋' : '시작하기 🙋'}
            </button>
            {!user && (
              <div className="text-[12px] mt-2" style={{ color: '#A89880' }}>로그인하면 함께할 수 있어요</div>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="scene-page">
      <PlazaScene
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onSide={setSide}
        out={amOut}
      >
        {hud}
      </PlazaScene>
      <MobileJoystick />
    </div>
  );
}
