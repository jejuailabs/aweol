'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { inventoryPath, spotPlaysPath } from '@/lib/paths';

/**
 * 틀린그림 찾기 — 아이 화면.
 *
 * 정답 좌표는 받아오지 않는다. 찍을 때마다 서버가 맞았는지 알려주고,
 * 맞은 자리만 돌려받아 표시한다. 시간도 서버가 잰다.
 */

interface Found { x: number; y: number; r: number }

interface Rank {
  studentUid: string;
  studentName: string;
  seconds: number | null;
  misses: number;
}

export default function SpotPlay({
  schoolId, classId, gameId, title, originalUrl, variantUrl, layout, spotCount,
}: {
  schoolId: string;
  classId: string;
  gameId: string;
  title: string;
  originalUrl: string;
  variantUrl: string;
  layout: 'vertical' | 'horizontal';
  spotCount: number;
}) {
  const { user } = useAuth();
  const [started, setStarted] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  /** 가진 돋보기 개수 */
  const [lens, setLens] = useState(0);
  const [misses, setMisses] = useState(0);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ranks, setRanks] = useState<Rank[]>([]);

  // 순위표는 누구나 본다 (이름·시간만 들어 있다)
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, spotPlaysPath(schoolId, classId, gameId)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Rank)
          .filter((r) => r.seconds != null)
          .sort((a, b) => (a.seconds! - b.seconds!) || (a.misses - b.misses));
        setRanks(list);
      },
      () => setRanks([])
    );
  }, [schoolId, classId, gameId]);

  // 화면에 흐르는 시간 (기록은 서버가 잰다 — 이건 보여주기용)
  useEffect(() => {
    if (!started || done) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [started, done]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/spot-game', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId, classId, gameId, ...body }),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  }, [schoolId, classId, gameId]);

  const start = useCallback(async () => {
    setBusy(true);
    const { ok, json } = await call({ action: 'start' });
    setBusy(false);
    if (!ok) {
      if (json.done) { setDone(true); setMsg('이미 다 찾았어요!'); }
      else setMsg(json.error || '시작하지 못했어요');
      return;
    }
    setStarted(true);
    setElapsed(0);
    setMisses(json.misses ?? 0);
  }, [call]);

  const tap = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!started || done || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;

    setBusy(true);
    const { ok, json } = await call({ action: 'tap', x, y });
    setBusy(false);
    if (!ok) { setMsg(json.error || '앗, 다시 눌러볼래요?'); return; }

    if (!json.hit) {
      setMisses((n) => n + 1);
      setMsg('여긴 아니에요!');
      setTimeout(() => setMsg(''), 900);
      return;
    }
    setFound((prev) => [...prev, json.spot]);
    setMsg('찾았다! 🎉');
    setTimeout(() => setMsg(''), 900);
    if (json.done) {
      setDone(true);
      setSeconds(json.seconds ?? null);
    }
  }, [started, done, busy, call]);

  /**
   * 돋보기 — 못 찾은 곳 하나를 서버가 알려준다.
   * 정답 좌표는 애초에 화면으로 안 내려오므로 서버만 고를 수 있다.
   */
  const useLens = useCallback(async () => {
    if (!started || done || busy) return;
    setBusy(true);
    const token = await auth?.currentUser?.getIdToken();
    const spent = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'use', itemId: 'play-lens' }),
    });
    if (!spent.ok) {
      setBusy(false);
      setMsg('돋보기가 없어요');
      setTimeout(() => setMsg(''), 1200);
      return;
    }
    const { ok, json } = await call({ action: 'hint' });
    setBusy(false);
    if (!ok) { setMsg(json.error || '알려주지 못했어요'); return; }
    setFound((prev) => [...prev, json.spot]);
    setMsg('🔍 여기예요!');
    setTimeout(() => setMsg(''), 1200);
    if (json.done) { setDone(true); setSeconds(json.seconds ?? null); }
  }, [started, done, busy, call]);

  // 가진 돋보기 개수
  useEffect(() => {
    if (!db || !user) { setLens(0); return; }
    return onSnapshot(
      doc(db, inventoryPath(user.uid), 'play-lens'),
      (d) => setLens(d.exists() ? ((d.data().count as number) ?? 0) : 0),
      () => setLens(0)
    );
  }, [user]);

  const remaining = spotCount - found.length;


  return (
    <div>
      <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
        <div className="text-base font-black" style={{ color: '#3A3226' }}>{title}</div>
        <div className="text-[14px] mt-1" style={{ color: '#8A7A5F' }}>
          다른 곳 <b>{spotCount}군데</b>를 찾아보세요
        </div>
      </div>

      {!started && !done ? (
        <button
          onClick={start}
          disabled={busy}
          className="w-full rounded-xl py-3 mb-3 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#E8A33C' }}
        >
          {busy ? '준비 중...' : '🔍 시작하기'}
        </button>
      ) : (
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-xl px-3 py-2 text-[14px] font-bold" style={{ background: '#FFF1D6', color: '#A6762A' }}>
            남은 곳 {Math.max(0, remaining)}
          </div>
          <div className="rounded-xl px-3 py-2 text-[14px] font-bold" style={{ background: 'white', color: '#8A7A5F' }}>
            ⏱ {done && seconds != null ? `${seconds}초` : `${elapsed}초`}
          </div>
          {lens > 0 && !done && (
            <button
              onClick={useLens}
              disabled={busy}
              className="rounded-xl px-3 py-2 text-[14px] font-bold disabled:opacity-40"
              style={{ background: '#EAF2FB', color: '#2F6DB5' }}
            >
              🔍 돋보기 {lens}
            </button>
          )}
          {misses > 0 && (
            <div className="rounded-xl px-3 py-2 text-[14px]" style={{ background: 'white', color: '#C0392B' }}>
              헛짚음 {misses}
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="rounded-2xl p-4 mb-3 text-center" style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}>
          <div className="text-3xl mb-1">🎉</div>
          <div className="text-sm font-black" style={{ color: '#2E8B57' }}>
            다 찾았어요! {seconds != null && `${seconds}초`}
          </div>
        </div>
      )}

      {/* 두 그림 */}
      <div className={`flex gap-2 mb-3 ${layout === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
        <div className="flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={originalUrl} alt="원본" className="w-full rounded-xl select-none" draggable={false} />
        </div>
        <div className="flex-1">
          <div
            className={`relative ${started && !done ? 'cursor-crosshair' : ''}`}
            onClick={tap}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={variantUrl} alt="바뀐 그림" className="w-full rounded-xl select-none" draggable={false} />
            {found.map((s, i) => (
              <div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${s.r * 200}%`,
                  aspectRatio: '1',
                  transform: 'translate(-50%, -50%)',
                  border: '4px solid #3BAF9F',
                  background: 'rgba(59,175,159,0.2)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {msg && (
        <div className="text-center text-[15px] font-bold mb-3" style={{ color: '#A6762A' }}>{msg}</div>
      )}

      {/* 순위 */}
      <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>
        🏆 빨리 찾은 친구들
      </div>
      {ranks.length === 0 ? (
        <div className="py-5 text-center text-[13px]" style={{ color: '#A89880' }}>
          아직 다 찾은 친구가 없어요
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {ranks.slice(0, 10).map((r, i) => (
            <div
              key={r.studentUid}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: r.studentUid === user?.uid ? '#FFF1D6' : 'white',
              }}
            >
              <span className="text-[14px] font-black w-5" style={{ color: i < 3 ? '#E8A33C' : '#A89880' }}>
                {i + 1}
              </span>
              <span className="text-[14px] font-bold flex-1 truncate" style={{ color: '#3A3226' }}>
                {r.studentName}
              </span>
              <span className="text-[14px] font-bold" style={{ color: '#8A7A5F' }}>{r.seconds}초</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
