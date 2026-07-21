'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import dynamic from 'next/dynamic';
import { PERFECT, SHOTS, aimAt, shotSetup, type ShotSetup } from '@/lib/archery';

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
    setErr(''); setResult(null); setHits([]); times.current = [];
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
    setFlight(land);
    playSound('tap');

    // 날아가는 시간만큼 기다렸다가 꽂고 다음 발로
    setTimeout(() => {
      setHits((h) => [...h, { ...land, score: 0 }]);
      setFlight(null);
      playSound('like');

      const next = shotIdx + 1;
      if (next >= SHOTS) {
        send(times.current);
        return;
      }
      setShotIdx(next);
      setSetup(shotSetup(seed, next));
      shotStart.current = performance.now();
      setStartedAt(shotStart.current);
    }, FLIGHT_MS);
  };

  const wind = setup?.wind ?? 0;

  return (
    <div className="px-4 pt-6 pb-28 mx-auto max-w-[520px]">
      <button
        onClick={() => router.push(`/school/${schoolId}/playground`)}
        className="ac-btn px-3.5 py-2 text-sm mb-3"
      >
        ← 운동장으로
      </button>

      <h1 className="text-lg font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        🏹 양궁
      </h1>
      <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        조준점이 흔들려요. 가운데에 왔을 때 쏘세요. 화살은 바람에 밀리니까
        <b> 바람 반대쪽</b>에서 쏘면 가운데로 가요.
      </p>

      {/* 경기장 — 화살이 꽂히는 자리는 계산이 준 값 그대로다 */}
      <div className="mb-3">
        <ArcheryScene
          setup={phase === 'aiming' ? setup : null}
          startedAt={startedAt}
          shooting={!!flight}
          flight={flight}
          hits={hits}
        />
      </div>

      {phase === 'aiming' && (
        <>
          <div className="flex items-center justify-between mb-2 text-[14px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
            <span>화살 {shotIdx + 1} / {SHOTS}</span>
            {/* 바람을 화살표로 — 숫자보다 방향이 먼저 읽힌다 */}
            <span>
              바람 {wind > 0 ? '→' : '←'} {Math.abs(wind).toFixed(0)}
            </span>
          </div>
          <button
            onClick={shoot}
            disabled={!!flight}
            className="w-full rounded-2xl py-5 text-[18px] font-black text-white active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {flight ? '화살이 날아가는 중...' : '🏹 쏘기'}
          </button>
        </>
      )}

      {(phase === 'ready' || phase === 'done') && (
        <button
          onClick={start}
          className="w-full rounded-2xl py-4 text-[16px] font-black text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          {phase === 'done' ? '한 번 더' : '시작하기'}
        </button>
      )}

      {phase === 'sending' && (
        <div className="text-center text-[14px] font-bold py-4" style={{ color: 'var(--color-text-sub)' }}>
          점수를 매기는 중...
        </div>
      )}

      {err && (
        <div className="rounded-xl px-3 py-2.5 mt-3 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>
          ⚠️ {err}
        </div>
      )}

      {result && (
        <div className="rounded-2xl p-4 mt-3 text-center" style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}>
          <div className="text-[20px] font-black" style={{ color: '#2E8B57' }}>
            {result.total} / {PERFECT}점
          </div>
          <div className="text-[13px] mt-1" style={{ color: '#5FA87C' }}>
            {result.shots.join(' · ')}
          </div>
          <div className="text-[13px] mt-1.5 font-bold" style={{ color: '#2E8B57' }}>
            내 최고 기록 {result.best}점
          </div>
        </div>
      )}

      {/* 순위표 */}
      {board.length > 0 && (
        <div className="mt-5">
          <div className="text-[14px] font-black mb-2" style={{ color: 'var(--color-text-main)' }}>
            🏆 우리 학교 최고 기록
          </div>
          <div className="flex flex-col gap-1.5">
            {board.map((b, i) => (
              <div
                key={`${b.name}-${i}`}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: 'var(--color-surface)' }}
              >
                <span className="text-[14px] font-black w-5" style={{ color: '#A6762A' }}>{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-[14px]" style={{ color: 'var(--color-text-main)' }}>
                  {b.name}
                </span>
                <span className="text-[14px] font-bold" style={{ color: 'var(--color-text-sub)' }}>{b.total}점</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!user && (
        <p className="text-[13px] text-center mt-4" style={{ color: 'var(--color-text-sub)' }}>
          로그인하면 기록이 남아요
        </p>
      )}
    </div>
  );
}
