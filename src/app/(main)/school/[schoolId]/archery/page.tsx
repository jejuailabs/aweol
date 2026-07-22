'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import dynamic from 'next/dynamic';
import { PERFECT, SHOTS, aimAt, ringScore, shotSetup, type ShotSetup } from '@/lib/archery';

/** 3D 경기장. 화면이 뜨기 전에 받아올 이유가 없다. */
const ArcheryScene = dynamic(() => import('@/components/gallery3d/ArcheryScene'), { ssr: false });

type Phase = 'ready' | 'aiming' | 'sending' | 'done';

/** 화살이 날아가는 데 걸리는 시간(ms). 3D 연출과 맞춰야 한다. */
const FLIGHT_MS = 620;

interface Hit { x: number; y: number; score: number }

/**
 * 양궁 — 집중력 게임.
 *
 * 조준점이 8자를 그리며 흔들린다. 가운데에 왔을 때 쏘면 높은 점수.
 * 화살은 바람에 옆으로 밀리므로, **바람을 보고 반대쪽에서 쏴야** 한다.
 *
 * 점수는 여기서 계산하지 않는다. '언제 쏘았는지' 만 모아 서버에 내면
 * 서버가 씨앗으로 다시 계산한다 — 순위표가 걸려 있기 때문이다.
 */
export default function ArcheryPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('ready');
  const [seed, setSeed] = useState(0);
  const [shotIdx, setShotIdx] = useState(0);
  const [setup, setSetup] = useState<ShotSetup | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [result, setResult] = useState<{ shots: number[]; total: number; best: number } | null>(null);
  const [err, setErr] = useState('');
  const [board, setBoard] = useState<{ name: string; total: number }[]>([]);
  /** 화살이 날아가는 중 — 도착할 때까지 다음 발을 못 쏜다 */
  const [flight, setFlight] = useState<{ x: number; y: number } | null>(null);
  /** 겨누기 시작한 시각. 3D 가 이걸로 흔들림을 그린다. */
  const [startedAt, setStartedAt] = useState(0);
  /**
   * 지금까지 화면에서 센 발별 점수. **표시용**이다 — 최종 점수는 서버가 낸다.
   * 발마다 바로 보여주려면 화면도 세야 한다. 서버 값과 같은 함수(ringScore·landing)를
   * 쓰므로 어긋나지 않는다.
   */
  const [shotScores, setShotScores] = useState<number[]>([]);
  /** 방금 쏜 발 점수 — 화면 위에 잠깐 크게 띄운다 */
  const [flash, setFlash] = useState<number | null>(null);

  /** 이 화살을 쏘기까지 흐른 시간을 재는 기준 */
  const shotStart = useRef(0);
  /** 쏜 시각들 — 이것만 서버로 간다 */
  const times = useRef<number[]>([]);

  // 순위표
  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(
      query(collection(db, `schools/${schoolId}/archeryRecords`), orderBy('total', 'desc'), limit(5)),
      (snap) => setBoard(snap.docs.map((d) => d.data() as { name: string; total: number })),
      () => setBoard([])
    );
  }, [schoolId]);

  const start = async () => {
    if (!user) { setErr('로그인하면 쏠 수 있어요'); return; }
    setErr(''); setResult(null); setHits([]); setShotScores([]); setFlash(null); times.current = [];
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/archery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || '시작하지 못했어요'); return; }
      setSeed(data.seed);
      setShotIdx(0);
      setSetup(shotSetup(data.seed, 0));
      shotStart.current = performance.now();
      setStartedAt(shotStart.current);
      setFlight(null);
      setPhase('aiming');
      playSound('open');
    } catch {
      setErr('시작하지 못했어요. 잠시 뒤 다시 해주세요.');
    }
  };

  const send = useCallback(async (all: number[]) => {
    setPhase('sending');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/archery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ schoolId, times: all }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || '기록을 남기지 못했어요'); setPhase('done'); return; }
      setResult({ shots: data.shots, total: data.total, best: data.best });
      setPhase('done');
      playSound('success');
    } catch {
      setErr('기록을 남기지 못했어요');
      setPhase('done');
    }
  }, [schoolId]);

  /**
   * 격발.
   *
   * 화살이 날아가는 동안에는 다음 발을 못 쏜다(`flight` 가 차 있으면 막힌다).
   * 도착하는 자리는 **계산이 준 값 그대로** 쓴다 — 보이는 자리와 점수가
   * 어긋나면 아이가 속았다고 느낀다.
   */
  const shoot = () => {
    if (phase !== 'aiming' || !setup || flight) return;
    const t = performance.now() - shotStart.current;
    times.current = [...times.current, t];

    const p = aimAt(setup, t);
    const land = { x: p.x + setup.wind, y: p.y };
    // 화면에서 미리 세는 점수. 서버와 같은 함수라 최종값과 어긋나지 않는다.
    const shotScore = ringScore(land.x, land.y);
    setFlight(land);
    playSound('tap');

    // 날아가는 시간만큼 기다렸다가 꽂고 점수를 띄운 뒤 다음 발로
    setTimeout(() => {
      setHits((h) => [...h, { ...land, score: shotScore }]);
      setShotScores((s) => [...s, shotScore]);
      setFlash(shotScore);
      setFlight(null);
      playSound(shotScore >= 9 ? 'success' : 'like');

      const next = shotIdx + 1;
      if (next >= SHOTS) {
        // 마지막 발 점수를 잠깐 보여주고 서버로
        setTimeout(() => send(times.current), 900);
        return;
      }
      setShotIdx(next);
      setSetup(shotSetup(seed, next));
      shotStart.current = performance.now();
      setStartedAt(shotStart.current);
    }, FLIGHT_MS);
  };

  // 방금 쏜 점수는 잠깐만 크게 보인다
  useEffect(() => {
    if (flash === null) return;
    const t = setTimeout(() => setFlash(null), 850);
    return () => clearTimeout(t);
  }, [flash]);

  const wind = setup?.wind ?? 0;
  const runningTotal = shotScores.reduce((a, b) => a + b, 0);

  return (
    /*
      달리기와 같은 짜임 — **경기장이 화면을 가득 채우고** 조작·기록은 그 위에 얹는다.
      전에는 3D 를 작은 네모 안에 넣었더니 운동장이 아니라 그림 한 장처럼 보였다.
    */
    <div className="relative min-h-dvh overflow-hidden">
      <ArcheryScene
        setup={phase === 'aiming' ? setup : null}
        startedAt={startedAt}
        shooting={!!flight}
        flight={flight}
        hits={hits}
      />

      {/* 나가기 */}
      <button
        onClick={() => router.push(`/school/${schoolId}/playground`)}
        className="ac-btn pos-top-safe absolute left-4 z-30 px-3.5 py-2 text-sm"
      >
        ← 운동장으로
      </button>

      {/* 겨누는 중 — 몇 번째 화살인지와 바람 */}
      {phase === 'aiming' && (
        <div
          className="pos-top-safe absolute right-4 z-30 rounded-full px-4 py-2 text-[14px] font-black"
          style={{ background: 'rgba(255,248,231,0.95)', color: '#6B5B43' }}
        >
          화살 {shotIdx + 1}/{SHOTS} · 바람 {wind > 0 ? '→' : '←'} {Math.abs(wind).toFixed(0)}
        </div>
      )}

      {/*
        누적 점수 — 판이 도는 동안 화면 위 가운데에 늘 떠 있다.
        한꺼번에 매겨 보여주지 말고 발마다 쌓이는 게 보여야 한다는 요청.
      */}
      {(phase === 'aiming' || phase === 'sending') && shotScores.length > 0 && (
        <div
          className="pos-top-safe absolute left-1/2 -translate-x-1/2 z-30 rounded-2xl px-5 py-2 text-[22px] font-black tabular-nums"
          style={{ background: 'rgba(255,248,231,0.95)', color: '#2E8B57', border: '3px solid #EFE3CB' }}
        >
          {runningTotal}점
          <span className="text-[13px] font-bold ml-1" style={{ color: '#8A7A5F' }}>
            ({shotScores.join('·')})
          </span>
        </div>
      )}

      {/* 방금 쏜 발 점수 — 화면 한가운데에 잠깐 크게 */}
      {flash !== null && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div
            className="text-[80px] font-black"
            style={{
              color: flash >= 9 ? '#F6D65B' : flash >= 7 ? '#E8604C' : flash === 0 ? '#B02A37' : 'white',
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {flash === 0 ? '빗나감!' : `${flash}점`}
          </div>
        </div>
      )}

      {/* 아래쪽 — 쏘기 / 시작 / 결과 */}
      <div className="pos-above-nav absolute left-4 right-4 z-30 mx-auto max-w-[420px]">
        {phase === 'aiming' && (
          <button
            onClick={shoot}
            disabled={!!flight}
            className="w-full rounded-2xl py-5 text-[18px] font-black text-white active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: 'var(--color-primary)', boxShadow: '0 6px 0 rgba(0,0,0,0.18)' }}
          >
            {flight ? '화살이 날아가는 중...' : '🏹 쏘기'}
          </button>
        )}

        {phase === 'sending' && (
          <div
            className="rounded-2xl py-4 text-center text-[15px] font-bold"
            style={{ background: 'rgba(255,248,231,0.95)', color: '#6B5B43' }}
          >
            점수를 합치는 중...
          </div>
        )}

        {(phase === 'ready' || phase === 'done') && (
          <div
            className="rounded-3xl p-4"
            style={{ background: 'rgba(255,250,240,0.96)', border: '3px solid rgba(255,255,255,0.7)' }}
          >
            {result ? (
              <>
                <div className="text-[20px] font-black text-center" style={{ color: '#2E8B57' }}>
                  {result.total} / {PERFECT}점
                </div>
                <div className="text-[13px] text-center mt-0.5" style={{ color: '#5FA87C' }}>
                  {result.shots.join(' · ')} · 내 최고 {result.best}점
                </div>
              </>
            ) : (
              <div className="text-[13px] mb-2 leading-relaxed" style={{ color: '#8A7A5F' }}>
                조준점이 흔들려요. 가운데에 왔을 때 쏘세요.
                화살은 바람에 밀리니까 <b>바람 반대쪽</b>에서 쏘면 가운데로 가요.
              </div>
            )}

            <button
              onClick={start}
              className="w-full mt-2 rounded-2xl py-4 text-[16px] font-black text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {phase === 'done' ? '한 번 더' : '시작하기'}
            </button>

            {board.length > 0 && (
              <div className="mt-3">
                <div className="text-[13px] font-black mb-1.5" style={{ color: '#3A3226' }}>
                  🏆 우리 학교 기록
                </div>
                <div className="flex flex-col gap-1">
                  {board.slice(0, 3).map((b, i) => (
                    <div key={`${b.name}-${i}`} className="flex items-center gap-2 text-[13px]">
                      <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                      <span className="flex-1 min-w-0 truncate" style={{ color: '#3A3226' }}>{b.name}</span>
                      <span className="font-bold" style={{ color: '#8A7A5F' }}>{b.total}점</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {err && (
              <div className="rounded-xl px-3 py-2 mt-2 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>
                ⚠️ {err}
              </div>
            )}
            {!user && (
              <p className="text-[12px] text-center mt-2" style={{ color: '#A89880' }}>
                로그인하면 기록이 남아요
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
