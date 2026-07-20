'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { formatTime } from '@/lib/track';
import { setMovementLock } from '@/components/gallery3d/walker';

const TrackScene = dynamic(() => import('@/components/gallery3d/TrackScene'), { ssr: false });

type Phase = 'ready' | 'count' | 'running' | 'done' | 'foul';

interface Record { uid: string; name: string; bestMs: number }

export default function TrackPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;

  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ ms: number; isBest: boolean; reason?: string } | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [err, setErr] = useState('');

  /** 화면에 보여주는 시계. 진짜 기록은 서버가 잰다 — 이건 보기용이다. */
  const startedAt = useRef(0);

  const loadRecords = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(
      collection(db, 'schools', schoolId, 'trackRecords'),
      orderBy('bestMs', 'asc'), limit(10)
    ));
    setRecords(snap.docs.map((d) => d.data() as Record));
  }, [schoolId]);

  useEffect(() => { loadRecords().catch(() => {}); }, [loadRecords]);

  // 달리는 동안 시계를 굴린다
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 50);
    return () => clearInterval(t);
  }, [phase]);

  // 카운트다운. 세는 동안은 못 움직이게 잠근다 — 미리 출발하면 시작부터 불공평하다.
  useEffect(() => {
    if (phase !== 'count') return;
    setMovementLock(true);
    if (count <= 0) {
      setMovementLock(false);
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase('running');
      playSound('success');
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
  }, [phase, count]);

  // 화면을 떠날 때 잠금이 남으면 다른 화면에서 못 움직인다
  useEffect(() => () => setMovementLock(false), []);

  const start = async () => {
    if (!user) { setErr('로그인해야 기록이 남아요'); return; }
    setErr(''); setResult(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '출발하지 못했어요');
      setCount(3);
      setPhase('count');
    } catch (e) { setErr((e as Error).message); }
  };

  const finish = async () => {
    setPhase('done');
    setMovementLock(false);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/track', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, laps: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '기록을 남기지 못했어요');
      setResult({ ms: json.elapsedMs, isBest: !!json.isBest, reason: json.reason });
      playSound(json.isBest ? 'success' : 'tap');
      await loadRecords();
    } catch (e) { setErr((e as Error).message); }
  };

  const foul = () => {
    if (phase !== 'running') return;
    setPhase('foul');
    setMovementLock(false);
    playSound('error');
  };

  const reset = () => { setPhase('ready'); setResult(null); setErr(''); };

  const myBest = records.find((r) => r.uid === user?.uid);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <TrackScene
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        running={phase === 'running'}
        onLap={finish}
        onFoul={foul}
      />

      {/* 나가기 */}
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="absolute left-4 top-4 z-30 rounded-full px-4 py-2.5 text-xs font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 학교로
      </button>

      {/* 시계 */}
      {(phase === 'running' || phase === 'done') && (
        <div
          className="absolute right-4 top-4 z-30 rounded-2xl px-4 py-2.5 text-lg font-black tabular-nums"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB' }}
        >
          ⏱ {formatTime(result?.ms ?? elapsed)}
        </div>
      )}

      {/* 카운트다운 */}
      {phase === 'count' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div
            className="text-[96px] font-black"
            style={{ color: 'white', textShadow: '0 6px 24px rgba(0,0,0,0.45)' }}
          >
            {count > 0 ? count : '출발!'}
          </div>
        </div>
      )}

      {/* 달리는 중 안내 */}
      {phase === 'running' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-4 z-30 rounded-full px-4 py-2 text-[11px] font-bold"
          style={{ background: 'rgba(255,248,231,0.92)', color: '#6B5B43' }}
        >
          흰 선을 밟으면 탈락이에요! 한 바퀴 돌아 출발선으로
        </div>
      )}

      {/* 준비 / 결과 */}
      {(phase === 'ready' || phase === 'done' || phase === 'foul') && (
        <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-6">
          <div
            className="mx-auto w-full max-w-[420px] rounded-[28px] p-5"
            style={{ background: 'rgba(255,250,240,0.96)', border: '3px solid rgba(255,255,255,0.7)' }}
          >
            {phase === 'ready' && (
              <>
                <div className="text-base font-black mb-1" style={{ color: '#3A3226' }}>🏃 운동장 한 바퀴</div>
                <div className="text-[11px] mb-3 leading-relaxed" style={{ color: '#8A7A5F' }}>
                  트랙을 따라 한 바퀴 달려요. <b>흰 선을 밟으면 탈락</b>이고,
                  안쪽으로 질러가도 탈락이에요.
                </div>
              </>
            )}

            {phase === 'foul' && (
              <>
                <div className="text-base font-black mb-1" style={{ color: '#C0392B' }}>😵 선을 밟았어요!</div>
                <div className="text-[11px] mb-3" style={{ color: '#8A7A5F' }}>
                  트랙 안에서만 달려야 해요. 다시 해볼까요?
                </div>
              </>
            )}

            {phase === 'done' && result && (
              <>
                <div className="text-base font-black mb-1" style={{ color: '#3A3226' }}>
                  {result.isBest ? '🎉 내 최고 기록!' : '🏁 들어왔어요'}
                </div>
                <div className="text-2xl font-black mb-1 tabular-nums" style={{ color: 'var(--color-primary)' }}>
                  {formatTime(result.ms)}
                </div>
                {result.reason && (
                  <div className="text-[11px] mb-2" style={{ color: '#C0392B' }}>{result.reason}</div>
                )}
              </>
            )}

            {err && <div className="text-[11px] font-bold mb-2" style={{ color: '#C0392B' }}>{err}</div>}

            <button
              onClick={phase === 'ready' ? start : reset}
              className="w-full rounded-full py-3 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {phase === 'ready' ? '출발 준비!' : '한 번 더'}
            </button>

            {/* 순위표 */}
            {records.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>🏆 우리 학교 기록</div>
                <div className="flex flex-col gap-1">
                  {records.slice(0, 5).map((r, i) => (
                    <div
                      key={r.uid}
                      className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px]"
                      style={{
                        background: r.uid === user?.uid ? '#EAF7EA' : 'white',
                        color: '#3A3226',
                      }}
                    >
                      <span className="font-black w-5">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                      <span className="truncate">{r.name}</span>
                      <span className="ml-auto font-bold tabular-nums">{formatTime(r.bestMs)}</span>
                    </div>
                  ))}
                </div>
                {myBest && !records.slice(0, 5).some((r) => r.uid === user?.uid) && (
                  <div className="text-[10px] mt-1.5 text-center" style={{ color: '#A89880' }}>
                    내 최고 기록 {formatTime(myBest.bestMs)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
