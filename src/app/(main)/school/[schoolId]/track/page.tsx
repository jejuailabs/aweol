'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { inventoryPath } from '@/lib/paths';
import { playSound } from '@/lib/sound';
import { formatTime } from '@/lib/track';
import { setMovementLock } from '@/components/gallery3d/walker';
import {
  watchLobby, setReady, callStart, clearStart, COUNTDOWN_MS, type LobbyState,
} from '@/lib/race-lobby';

const TrackScene = dynamic(() => import('@/components/gallery3d/TrackScene'), { ssr: false });

type Phase = 'ready' | 'count' | 'running' | 'done' | 'foul';

/** 순위표 한 줄. `Record` 라고 쓰면 TS 내장 Record<K,V> 를 가린다 */
interface TrackRecord { uid: string; name: string; bestMs: number }

export default function TrackPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;

  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ ms: number; isBest: boolean; reason?: string } | null>(null);
  const [records, setRecords] = useState<TrackRecord[]>([]);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  /** 경기 번호 — 올리면 아바타가 출발선으로 돌아간다 */
  const [runId, setRunId] = useState(0);

  /** 출발선에 선 사람들 */
  const [lobby, setLobby] = useState<LobbyState>({ players: [], startAt: 0 });
  const [iAmReady, setIAmReady] = useState(false);
  /** 이번 출발 신호를 이미 받았나 (같은 신호로 두 번 뛰지 않게) */
  const usedStart = useRef(0);

  /** 가진 놀이 아이템 */
  const [items, setItems] = useState<Record<string, number>>({});
  /** 구름 신발을 신었나 — 선을 한 번 밟아도 봐준다 */
  const [cloud, setCloud] = useState(false);
  const cloudRef = useRef(false);
  useEffect(() => { cloudRef.current = cloud; }, [cloud]);

  const me = user && userDoc
    ? { uid: user.uid, name: userDoc.displayName || '친구' }
    : null;

  /** 화면에 보여주는 시계. 진짜 기록은 서버가 잰다 — 이건 보기용이다. */
  const startedAt = useRef(0);

  const loadRecords = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(
      collection(db, 'schools', schoolId, 'trackRecords'),
      orderBy('bestMs', 'asc'), limit(10)
    ));
    setRecords(snap.docs.map((d) => d.data() as TrackRecord));
  }, [schoolId]);

  useEffect(() => { loadRecords().catch(() => {}); }, [loadRecords]);

  useEffect(() => watchLobby(schoolId, setLobby), [schoolId]);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      collection(db, inventoryPath(user.uid)),
      (snap) => {
        const m: Record<string, number> = {};
        snap.forEach((d) => {
          const c = (d.data().count as number) ?? 0;
          if (c > 0) m[d.id] = c;
        });
        setItems(m);
      },
      () => setItems({})
    );
  }, [user]);

  // 화면을 떠나면 출발선에서도 빠진다
  useEffect(() => () => {
    if (me) setReady(schoolId, me.uid, me.name, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 준비를 누르면 **곧바로 출발선으로 옮긴다.**
   * 출발 직전에 옮기면 어디서 시작하는지 볼 새가 없다.
   */
  const toggleReady = useCallback(async () => {
    if (!me) { setErr('로그인해야 기록이 남아요'); return; }
    const next = !iAmReady;
    setIAmReady(next);
    if (next) { setRunId((n) => n + 1); setMovementLock(true); }
    else setMovementLock(false);
    await setReady(schoolId, me.uid, me.name, next);
  }, [me, iAmReady, schoolId]);

  /**
   * 출발 신호를 받으면 **다 같이** 센다.
   * 각자 자기 화면에서 세면 누구는 먼저 뛴다 — 신호 시각 하나를 모두가 본다.
   */
  useEffect(() => {
    if (!iAmReady || !lobby.startAt || lobby.startAt === usedStart.current) return;
    if (lobby.startAt < Date.now() - COUNTDOWN_MS * 2) return;   // 지난 신호는 무시
    usedStart.current = lobby.startAt;

    let alive = true;
    const tick = () => {
      if (!alive) return;
      const left = lobby.startAt - Date.now();
      if (left <= 0) {
        // 서버에 출발을 알리고(여기서부터 서버가 시간을 잰다) 잠금을 푼다
        (async () => {
          try {
            const token = await auth?.currentUser?.getIdToken();
            await fetch('/api/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ schoolId }),
            });
          } catch { /* 실패해도 뛰게는 둔다. 기록만 안 남는다 */ }
          if (!alive) return;
          setMovementLock(false);
          startedAt.current = Date.now();
          setElapsed(0);
          setPhase('running');
          playSound('success');
        })();
        return;
      }
      setCount(Math.ceil(left / 1000));
      setPhase('count');
      setTimeout(tick, 120);
    };
    tick();
    return () => { alive = false; };
  }, [lobby.startAt, iAmReady, schoolId]);

  // 달리는 동안 시계를 굴린다
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 50);
    return () => clearInterval(t);
  }, [phase]);

  // 화면을 떠날 때 잠금이 남으면 다른 화면에서 못 움직인다
  useEffect(() => () => setMovementLock(false), []);

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
    /**
     * 구름 신발은 **한 번만** 봐준다. 그 뒤로는 그냥 탈락이다.
     * 시간에는 손대지 않는다 — 순위표는 신발을 신었든 아니든 같은 기록이어야 한다.
     */
    if (cloudRef.current) {
      setCloud(false);
      setFlash('🩹 구름 신발이 한 번 봐줬어요!');
      setTimeout(() => setFlash(''), 1800);
      playSound('tap');
      return;
    }
    setPhase('foul');
    setMovementLock(false);
    playSound('error');
  };

  const reset = () => {
    setPhase('ready');
    setCloud(false);
    setResult(null);
    setErr('');
    // 다음 판을 위해 준비를 푼다. 안 풀면 지난 출발 신호로 또 뛴다.
    setIAmReady(false);
    setMovementLock(false);
    if (me) setReady(schoolId, me.uid, me.name, false);
    clearStart(schoolId);
  };

  const myBest = records.find((r) => r.uid === user?.uid);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <TrackScene
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        running={phase === 'running'}
        runId={runId}
        onLap={finish}
        onFoul={foul}
      />

      {/* 나가기 */}
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="absolute left-4 top-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
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

      {flash && (
        <div className="absolute inset-x-0 top-24 z-40 flex justify-center pointer-events-none px-4">
          <div
            className="rounded-2xl px-5 py-3 text-base font-black text-center"
            style={{ background: 'rgba(255,248,231,0.96)', color: '#6B5B43', boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
          >
            {flash}
          </div>
        </div>
      )}

      {/* 달리는 중 안내 */}
      {phase === 'running' && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-4 z-30 rounded-full px-4 py-2 text-[13px] font-bold"
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
                <div className="text-[13px] mb-3 leading-relaxed" style={{ color: '#8A7A5F' }}>
                  트랙을 따라 한 바퀴 달려요. <b>흰 선을 밟으면 탈락</b>이고,
                  안쪽으로 질러가도 탈락이에요.
                </div>

                {/* 출발선에 선 사람들 */}
                <div className="rounded-2xl p-3 mb-3" style={{ background: 'white' }}>
                  <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>
                    🏁 출발선 ({lobby.players.length}명)
                  </div>
                  {lobby.players.length === 0 ? (
                    <div className="text-[13px]" style={{ color: '#A89880' }}>
                      아직 아무도 없어요. 준비를 누르면 출발선으로 가요.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {lobby.players.map((p) => (
                        <span
                          key={p.uid}
                          className="rounded-full px-2.5 py-1 text-[13px] font-bold"
                          style={{
                            background: p.uid === me?.uid ? 'var(--color-primary)' : '#F0E9DA',
                            color: p.uid === me?.uid ? 'white' : '#6B5B43',
                          }}
                        >
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 숙제로 모은 도장으로 산 것 */}
                <button
                  onClick={async () => {
                    if (cloud || !(items['play-cloud'] > 0)) return;
                    const token = await auth?.currentUser?.getIdToken();
                    const res = await fetch('/api/shop', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ action: 'use', itemId: 'play-cloud' }),
                    });
                    if (res.ok) setCloud(true);
                  }}
                  disabled={cloud || !(items['play-cloud'] > 0)}
                  className="w-full rounded-2xl py-2.5 mb-2 flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: cloud ? '#EAF7EA' : 'white' }}
                >
                  <span className="text-lg">🩹</span>
                  <span className="text-[13px] font-bold" style={{ color: '#8A7A5F' }}>
                    {cloud ? '구름 신발을 신었어요 — 한 번 봐줘요' : `구름 신발 신기 (${items['play-cloud'] ?? 0}개)`}
                  </span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={toggleReady}
                    className="flex-1 rounded-full py-3 text-sm font-bold"
                    style={{
                      background: iAmReady ? '#F0E9DA' : 'white',
                      color: '#6B5B43',
                      border: '2px solid #E3D5B8',
                    }}
                  >
                    {iAmReady ? '✅ 준비됨 (취소)' : '🏁 준비'}
                  </button>
                  <button
                    onClick={() => callStart(schoolId)}
                    disabled={!iAmReady}
                    className="flex-1 rounded-full py-3 text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    출발 신호!
                  </button>
                </div>
                <div className="text-[12px] text-center mt-2 leading-relaxed" style={{ color: '#A89880' }}>
                  준비한 사람들이 <b>다 같이</b> 출발해요. 혼자여도 눌러서 뛸 수 있어요.
                </div>
              </>
            )}

            {phase === 'foul' && (
              <>
                <div className="text-base font-black mb-1" style={{ color: '#C0392B' }}>😵 선을 밟았어요!</div>
                <div className="text-[13px] mb-3" style={{ color: '#8A7A5F' }}>
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
                  <div className="text-[13px] mb-2" style={{ color: '#C0392B' }}>{result.reason}</div>
                )}
              </>
            )}

            {err && <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{err}</div>}

            {phase !== 'ready' && (
              <button
                onClick={reset}
                className="w-full rounded-full py-3 text-sm font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                한 번 더
              </button>
            )}

            {/* 순위표 */}
            {records.length > 0 && (
              <div className="mt-4">
                <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>🏆 우리 학교 기록</div>
                <div className="flex flex-col gap-1">
                  {records.slice(0, 5).map((r, i) => (
                    <div
                      key={r.uid}
                      className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[14px]"
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
                  <div className="text-[12px] mt-1.5 text-center" style={{ color: '#A89880' }}>
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
