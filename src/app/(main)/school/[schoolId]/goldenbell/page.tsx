'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';

/**
 * 도전 골든벨.
 *
 * **자리에 앉아 판에 적는다.** 서른 자리까지. 문제는 뒤로 갈수록 어려워지고,
 * 틀리면 자리에서 물러난다. 마지막 문제까지 남은 사람은 **여럿이어도 다 우승**이다.
 *
 * 정답은 서버만 쥔다(`/api/bell`). 이 화면은 정답을 미리 알 방법이 없고,
 * 시간이 지나면 규칙이 답 고치기를 막는다 — 광장 OX 와 같은 얼개다.
 *
 * **손글씨는 안 받는다.** 글자를 알아보는 기능이 없어서, 어설프게 붙이면
 * 맞게 쓴 아이가 틀린 것으로 나온다. 판처럼 보이게만 해뒀다.
 */

interface RoomState {
  status: 'waiting' | 'asking' | 'reveal' | 'done';
  round: number;
  total: number;
  q: string;
  kind: 'choice' | 'short';
  choices: string[] | null;
  endsAt: number;
  revealAt: number;
  nextAt: number;
  answer: string | null;
  why: string | null;
  lastCorrect: string[];
  alive: string[];
  out: string[];
  winners: string[];
  names: Record<string, string>;
  grade: number | null;
  serverNow: number;
}

const ROOM = 'hall';
const GRADES = [null, 1, 2, 3, 4, 5, 6] as const;

export default function GoldenBellPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const { user, userDoc } = useAuth();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [players, setPlayers] = useState<{ uid: string; n: string }[]>([]);
  const [skew, setSkew] = useState(0);
  /**
   * 서버 기준 지금.
   *
   * **그리는 중에 `Date.now()` 를 부르지 않는다.** 그리기는 같은 값을 넣으면
   * 같은 그림이 나와야 하는데 시계는 부를 때마다 다르다 —
   * 이 프로젝트에서 타자 게임이 같은 이유로 걸린 적이 있다.
   * 그래서 시계를 상태에 담아두고, 아래 타이머가 갈아 끼운다.
   */
  const [now, setNow] = useState(0);
  const [grade, setGrade] = useState<number | null>(null);
  /**
   * 내 판.
   *
   * **문제 번호를 같이 들고 있는다.** 문제가 바뀌면 판이 저절로 비도록 —
   * 효과로 지우면 한 박자 늦게 지워져서, 다음 문제에 지난 답이 잠깐 보인다.
   */
  const [pad, setPad] = useState<{ round: number; text: string; picked: number | null }>(
    { round: 0, text: '', picked: null }
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const me = user?.uid ?? '';
  const amAlive = !!room && room.alive.includes(me);
  const amOut = !!room && room.out.includes(me);
  const amWinner = !!room && room.winners.includes(me);

  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(doc(db, 'schools', schoolId, 'bellRooms', ROOM), (s) => {
      const v = s.data() as RoomState | undefined;
      if (!v) { setRoom(null); return; }
      if (typeof v.serverNow === 'number') setSkew(v.serverNow - Date.now());
      setRoom(v);
    }, () => {});
  }, [schoolId]);

  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(collection(db, 'schools', schoolId, 'bellRooms', ROOM, 'players'), (s) => {
      setPlayers(s.docs.map((d) => ({ uid: d.id, n: String(d.data().n || '친구') })));
    }, () => {});
  }, [schoolId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 200);
    return () => clearInterval(t);
  }, [skew]);

  // 들어오면 자리에 이름을 적는다. 앉은 순서로 자리를 준다.
  useEffect(() => {
    if (!db || !user || !schoolId) return;
    setDoc(
      doc(db, 'schools', schoolId, 'bellRooms', ROOM, 'players', user.uid),
      { n: (userDoc?.displayName || '친구').slice(0, 20), at: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  }, [user, userDoc?.displayName, schoolId]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/bell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId, roomKey: ROOM, action, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || '안 됐어요');
    return json;
  }, [schoolId]);

  // 때가 되면 판을 넘긴다. 아무나 부른다(서버가 시간을 다시 본다).
  useEffect(() => {
    if (!room || !user) return;
    if (room.status !== 'asking' && room.status !== 'reveal') return;
    const due = room.status === 'asking' ? room.revealAt : room.nextAt;
    const wait = Math.max(0, due - (Date.now() + skew)) + 250;
    const t = setTimeout(() => { call('advance').catch(() => {}); }, wait);
    return () => clearTimeout(t);
  }, [room, user, call, skew]);

  const lastRevealed = useRef(0);
  useEffect(() => {
    if (!room || room.status !== 'reveal' || lastRevealed.current === room.round) return;
    lastRevealed.current = room.round;
    playSound(room.lastCorrect.includes(me) ? 'success' : 'error');
  }, [room, me]);

  /**
   * 판에 적은 것을 낸다. 시간이 지나면 규칙이 막으므로 실패는 조용히 둔다.
   *
   * 시계를 보므로 `useCallback` 으로 감싼다 — 그리는 중에 만들어지는
   * 함수 안에서 시계를 부르면 그리기가 순수하지 않은 것으로 잡힌다.
   */
  const submit = useCallback((v: number | string) => {
    if (!db || !user || !room || room.status !== 'asking' || !room.alive.includes(user.uid)) return;
    if (Date.now() + skew >= room.endsAt) return;
    setDoc(
      doc(db, 'schools', schoolId, 'bellRooms', ROOM, 'answers', user.uid),
      { v, round: room.round }
    ).catch(() => {});
  }, [user, room, skew, schoolId]);

  const start = async () => {
    setBusy(true); setErr('');
    try { await call('start', { grade: grade ?? undefined }); playSound('success'); }
    catch (e) { setErr((e as Error).message); playSound('error'); }
    setBusy(false);
  };

  const asking = room?.status === 'asking';
  const revealing = room?.status === 'reveal';
  const left = room && now ? Math.max(0, Math.ceil((room.endsAt - now) / 1000)) : 0;
  // 시계를 아직 못 받았으면(now === 0) 잠긴 것으로 보지 않는다
  const locked = !!room && asking && now > 0 && now >= room.endsAt;

  const round = room?.round ?? 0;
  const text = pad.round === round ? pad.text : '';
  const picked = pad.round === round ? pad.picked : null;

  /** 자리 — 판이 열리기 전엔 들어온 사람, 열린 뒤엔 판에 적힌 사람 */
  const seats = room && room.status !== 'waiting'
    ? [...room.alive, ...room.out].map((uid) => ({ uid, n: room.names[uid] ?? '친구' }))
    : players;

  return (
    <div className="px-4 pt-4 pb-28 mx-auto max-w-[720px]">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => router.push(`/school/${schoolId}/playground`)} className="ac-btn px-3.5 py-2 text-sm">
          ← 나가기
        </button>
        <h1 className="text-lg font-black" style={{ color: 'var(--color-text-main)' }}>🔔 도전 골든벨</h1>
        {room?.grade && (
          <span className="ml-auto text-[12px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
            {room.grade}학년 문제
          </span>
        )}
      </div>

      {/* 문제판 */}
      {room && room.status !== 'waiting' ? (
        <div
          className="rounded-3xl p-5 mb-4"
          style={{ background: '#1F3B33', border: '6px solid #7A5B3A', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
        >
          <div className="flex items-center gap-2 text-[12px] font-bold" style={{ color: '#9FD4C4' }}>
            <span>{room.round} / {room.total}번</span>
            <span>·</span>
            <span>{room.kind === 'choice' ? '객관식' : '주관식'}</span>
            <span className="ml-auto">{room.alive.length}명 남음</span>
          </div>

          <div className="text-[18px] font-black mt-2 leading-snug" style={{ color: '#F4FBF8' }}>
            {room.q}
          </div>

          {asking && !locked && (
            <div className="text-[30px] font-black mt-1" style={{ color: left <= 5 ? '#FF9A8B' : '#8FE3C8' }}>
              {left}
            </div>
          )}
          {locked && (
            <div className="text-[14px] font-bold mt-1" style={{ color: '#C9E5DA' }}>
              ✋ 판을 드세요! 곧 정답이 열려요
            </div>
          )}
          {revealing && room.answer && (
            <div className="mt-2">
              <div className="text-[22px] font-black" style={{ color: '#FFD98A' }}>
                정답은 {room.answer}
              </div>
              {room.why && (
                <div className="text-[13px] leading-relaxed mt-1" style={{ color: '#C9E5DA' }}>
                  {room.why}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl p-5 mb-4 text-center" style={{ background: '#1F3B33', border: '6px solid #7A5B3A' }}>
          <div className="text-[34px] mb-1">🔔</div>
          <div className="text-[17px] font-black" style={{ color: '#F4FBF8' }}>도전 골든벨</div>
          <p className="text-[13px] leading-relaxed mt-1" style={{ color: '#C9E5DA' }}>
            자리에 앉아 문제를 풀어요. <b>서른 자리</b>까지 앉을 수 있고,<br />
            틀리면 자리에서 물러나요. <b>끝까지 남으면 여럿이어도 다 우승</b>이에요.
          </p>
        </div>
      )}

      {/* 내 판 */}
      {asking && amAlive && !locked && (
        <div className="mb-4">
          {room.kind === 'choice' && room.choices ? (
            <div className="grid grid-cols-2 gap-2">
              {room.choices.map((c, i) => (
                <button
                  key={c}
                  onClick={() => { setPad({ round, text: '', picked: i }); submit(i); playSound('tap'); }}
                  className="rounded-2xl py-3.5 px-3 text-[15px] font-bold text-left"
                  style={
                    picked === i
                      ? { background: 'var(--color-primary)', color: 'white' }
                      : { background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }
                  }
                >
                  <span className="opacity-70 mr-1.5">{i + 1}.</span>{c}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setPad({ round, text: e.target.value.slice(0, 60), picked: null })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && text.trim()) submit(text.trim());
                }}
                placeholder="답을 적어요"
                className="min-w-0 flex-1 rounded-2xl px-4 py-3.5 text-[16px] outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
              <button
                onClick={() => { if (text.trim()) { submit(text.trim()); playSound('tap'); } }}
                disabled={!text.trim()}
                className="shrink-0 rounded-2xl px-5 text-[15px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                내기
              </button>
            </div>
          )}
          <p className="text-[12px] mt-1.5" style={{ color: 'var(--color-text-sub)' }}>
            시간 안에는 몇 번이든 고쳐 낼 수 있어요. 마지막에 낸 것이 답이에요.
          </p>
        </div>
      )}

      {amOut && room?.status !== 'done' && (
        <div className="rounded-2xl p-3 mb-4 text-center text-[13px] font-bold"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
          😢 자리에서 물러났어요 — 끝까지 같이 봐요
        </div>
      )}

      {/* 자리 — 서른 개 */}
      <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
        자리 ({seats.length}/30)
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 mb-4">
        {seats.slice(0, 30).map((p) => {
          const out = !!room && room.out.includes(p.uid);
          const win = !!room && room.winners.includes(p.uid);
          const justRight = !!room && revealing && room.lastCorrect.includes(p.uid);
          return (
            <div
              key={p.uid}
              className="rounded-xl py-2 px-1 text-center text-[11px] font-bold truncate"
              style={{
                background: win ? '#FFD98A' : justRight ? '#BFE8D8' : out ? 'var(--color-surface-soft)' : 'white',
                color: out ? 'var(--color-text-sub)' : '#3A3226',
                opacity: out ? 0.5 : 1,
                border: p.uid === me ? '2px solid var(--color-primary)' : '2px solid transparent',
                textDecoration: out ? 'line-through' : 'none',
              }}
            >
              {win ? '🔔 ' : ''}{p.n}
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 30 - seats.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="rounded-xl py-2 text-center text-[11px]"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)', opacity: 0.35 }}
          >
            빈자리
          </div>
        ))}
      </div>

      {/* 시작 · 결과 */}
      {(!room || room.status === 'waiting' || room.status === 'done') && (
        <div className="rounded-3xl p-4" style={{ background: 'var(--color-surface)' }}>
          {room?.status === 'done' && (
            <div className="text-center mb-3">
              <div className="text-[34px] mb-1">{amWinner ? '🔔' : '👏'}</div>
              <div className="text-[17px] font-black" style={{ color: 'var(--color-text-main)' }}>
                {room.winners.length === 0
                  ? '이번엔 아무도 못 남았어요'
                  : room.winners.length === 1
                    ? `${room.names[room.winners[0]] ?? '친구'} 골든벨!`
                    : `${room.winners.length}명이 함께 골든벨!`}
              </div>
              <div className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                {room.winners.map((u) => room.names[u] ?? '친구').join(' · ')}
              </div>
            </div>
          )}

          <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
            어떤 문제로 할까요?
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {GRADES.map((g) => (
              <button
                key={String(g)}
                onClick={() => setGrade(g)}
                className="rounded-full px-3.5 py-2 text-[13px] font-bold"
                style={
                  grade === g
                    ? { background: 'var(--color-primary)', color: 'white' }
                    : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
                }
              >
                {g === null ? '종합' : `${g}학년`}
              </button>
            ))}
          </div>

          {err && <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{err}</div>}
          <button
            onClick={start}
            disabled={busy || !user}
            className="w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy ? '여는 중...' : room?.status === 'done' ? '한 판 더 🔔' : '시작하기 🔔'}
          </button>
          {!user && (
            <div className="text-[12px] text-center mt-2" style={{ color: 'var(--color-text-sub)' }}>
              로그인하면 함께할 수 있어요
            </div>
          )}
        </div>
      )}
    </div>
  );
}
