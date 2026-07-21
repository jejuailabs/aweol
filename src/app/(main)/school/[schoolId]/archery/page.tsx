'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import {
  PERFECT, SHOTS, TARGET_R, aimAt, shotSetup, type ShotSetup,
} from '@/lib/archery';

type Phase = 'ready' | 'aiming' | 'sending' | 'done';

interface Hit { x: number; y: number; score: number }

/** 과녁 그림의 반지름(px). 계산 단위(TARGET_R)와 나누어 둔다. */
const VIEW = 130;
const K = VIEW / TARGET_R;

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
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [hits, setHits] = useState<Hit[]>([]);
  const [result, setResult] = useState<{ shots: number[]; total: number; best: number } | null>(null);
  const [err, setErr] = useState('');
  const [board, setBoard] = useState<{ name: string; total: number }[]>([]);

  /** 이 화살을 쏘기까지 흐른 시간을 재는 기준 */
  const shotStart = useRef(0);
  /** 쏜 시각들 — 이것만 서버로 간다 */
  const times = useRef<number[]>([]);
  const raf = useRef(0);

  // 순위표
  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(
      query(collection(db, `schools/${schoolId}/archeryRecords`), orderBy('total', 'desc'), limit(5)),
      (snap) => setBoard(snap.docs.map((d) => d.data() as { name: string; total: number })),
      () => setBoard([])
    );
  }, [schoolId]);

  /** 조준점을 계속 움직인다 */
  useEffect(() => {
    if (phase !== 'aiming' || !setup) return;
    const tick = () => {
      setAim(aimAt(setup, performance.now() - shotStart.current));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, setup]);

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

  /** 격발 */
  const shoot = () => {
    if (phase !== 'aiming' || !setup) return;
    const t = performance.now() - shotStart.current;
    times.current = [...times.current, t];

    // 어디에 꽂혔는지는 화면에만 보여준다 — 점수는 서버가 낸다
    const p = aimAt(setup, t);
    setHits((h) => [...h, { x: p.x + setup.wind, y: p.y, score: 0 }]);
    playSound('tap');

    const next = shotIdx + 1;
    if (next >= SHOTS) {
      send(times.current);
      return;
    }
    setShotIdx(next);
    setSetup(shotSetup(seed, next));
    shotStart.current = performance.now();
  };

  const wind = setup?.wind ?? 0;

  return (
    <div className="px-4 pt-6 pb-28 mx-auto max-w-[520px]">
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="ac-btn px-3.5 py-2 text-sm mb-3"
      >
        ← 학교로
      </button>

      <h1 className="text-lg font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        🏹 양궁
      </h1>
      <p className="text-[13px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        조준점이 흔들려요. 가운데에 왔을 때 쏘세요. 화살은 바람에 밀리니까
        <b> 바람 반대쪽</b>에서 쏘면 가운데로 가요.
      </p>

      {/* 과녁 */}
      <div className="flex justify-center mb-3">
        <svg
          viewBox={`${-VIEW - 12} ${-VIEW - 12} ${(VIEW + 12) * 2} ${(VIEW + 12) * 2}`}
          className="w-full"
          style={{ maxWidth: 340 }}
        >
          {/*
            **큰 고리부터** 그린다. 작은 것부터 그리면 뒤에 그린 큰 원이
            덮어버려서 민무늬 원 하나만 남는다 — 실제로 그렇게 나왔었다.
          */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ring) => {
            const r = (11 - ring) * (VIEW / 10);
            const fill =
              ring >= 9 ? '#F6D65B' : ring >= 7 ? '#E8604C' : ring >= 5 ? '#6FA8DC' : ring >= 3 ? '#3A3226' : '#FBF7EE';
            return <circle key={ring} cx={0} cy={0} r={r} fill={fill} stroke="#8A7A5F" strokeWidth={0.8} />;
          })}

          {/* 꽂힌 화살 */}
          {hits.map((h, i) => (
            <circle key={i} cx={h.x * K} cy={h.y * K} r={5} fill="#2E8B57" stroke="white" strokeWidth={2} />
          ))}

          {/* 조준점 */}
          {phase === 'aiming' && (
            <g>
              <circle cx={aim.x * K} cy={aim.y * K} r={11} fill="none" stroke="#1F6FEB" strokeWidth={3} />
              <line x1={aim.x * K - 17} y1={aim.y * K} x2={aim.x * K + 17} y2={aim.y * K} stroke="#1F6FEB" strokeWidth={2} />
              <line x1={aim.x * K} y1={aim.y * K - 17} x2={aim.x * K} y2={aim.y * K + 17} stroke="#1F6FEB" strokeWidth={2} />
            </g>
          )}
        </svg>
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
            className="w-full rounded-2xl py-5 text-[18px] font-black text-white active:scale-95 transition-transform"
            style={{ background: 'var(--color-primary)' }}
          >
            🏹 쏘기
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
