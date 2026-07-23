'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import RainTyping from '@/components/game/RainTyping';
import { PRACTICE_LINES, RAIN_LEVELS, rainLevel } from '@/lib/typing';
import { nextResetKST, weekKeyKST } from '@/lib/week';

type Mode = 'rain' | 'practice';

/**
 * 타자 연습 — **산성비**와 **단문 연습** 둘.
 *
 * 산성비는 순발력이고, 단문은 끊지 않고 이어 치는 연습이다. 둘 다 있어야
 * 손가락이 는다 — 산성비만 하면 낱말 하나하나를 '맞히는' 데만 익숙해진다.
 *
 * 기록은 **분당 타수(CPM)** 로 남기고 주마다 새로 시작한다(양궁과 같은 얼개).
 * 산성비는 난이도까지 갈라 겨룬다 — 1단계 500타와 5단계 500타는 다른 일이다.
 */
export default function TypingPage() {
  const router = useRouter();
  const schoolId = String(useParams().schoolId ?? '');
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>('rain');
  const [level, setLevel] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<{ cpm: number; strokes: number; best: number } | null>(null);
  const [err, setErr] = useState('');
  const [board, setBoard] = useState<{ name: string; cpm: number }[]>([]);

  const week = useMemo(() => weekKeyKST(), []);
  const resetLabel = useMemo(() => {
    const d = nextResetKST();
    return `${d.getMonth() + 1}월 ${d.getDate()}일(월)`;
  }, []);

  // ---- 단문 연습 ----
  const [lineIdx, setLineIdx] = useState(0);
  const [input, setInput] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const line = PRACTICE_LINES[lineIdx % PRACTICE_LINES.length];

  /**
   * 순위표 — 이번 주, 이 모드(산성비면 그 난이도)만.
   * 무슨 표인지 화면에 적어준다 — 안 그러면 난이도를 바꿨을 때
   * 자기 기록이 사라진 줄 안다.
   */
  useEffect(() => {
    if (!db || !schoolId) return;
    return onSnapshot(
      query(
        collection(db, `schools/${schoolId}/typingRecords`),
        where('week', '==', week),
        where('mode', '==', mode),
        where('level', '==', mode === 'rain' ? level : 0),
        orderBy('cpm', 'desc'),
        limit(5)
      ),
      (snap) => setBoard(snap.docs.map((d) => d.data() as { name: string; cpm: number })),
      () => setBoard([])
    );
  }, [schoolId, week, mode, level]);

  /** 서버가 타수를 다시 센다 — 화면이 보낸 숫자는 안 읽힌다 */
  const send = async (words: string[], ms: number) => {
    if (!user) { setErr('로그인하면 기록이 남아요'); return; }
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ schoolId, mode, level, words, ms }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error || '기록을 남기지 못했어요'); return; }
      setResult({ cpm: data.cpm, strokes: data.strokes, best: data.best });
      playSound('success');
    } catch {
      setErr('기록을 남기지 못했어요');
    }
  };

  const startPractice = () => {
    setResult(null); setErr(''); setDone([]); setInput('');
    setStartedAt(performance.now());
    setPlaying(true);
  };

  /** 한 줄을 다 치면 다음 줄로. 다섯 줄을 치면 기록으로 남긴다. */
  const submitLine = () => {
    if (input.trim() !== line) return;
    const next = [...done, line];
    setDone(next);
    setInput('');
    playSound('like');
    if (next.length >= 5) {
      setPlaying(false);
      send(next, performance.now() - startedAt);
      return;
    }
    setLineIdx((i) => i + 1);
  };

  const chip = (on: boolean) => ({
    background: on ? 'var(--color-primary)' : 'var(--color-surface-soft)',
    color: on ? 'white' : 'var(--color-text-sub)',
  });

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[560px]">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => router.push(`/school/${schoolId}/playground`)}
          className="ac-btn px-3.5 py-2 text-sm"
        >
          ← 운동장으로
        </button>
        <h1 className="text-lg font-black" style={{ color: 'var(--color-text-main)' }}>⌨️ 타자 연습</h1>
      </div>

      {!playing && (
        <>
          <div className="flex gap-2 mb-3">
            {([['rain', '🌧️ 산성비'], ['practice', '📝 단문 연습']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResult(null); }}
                className="flex-1 rounded-2xl py-3 text-[15px] font-bold"
                style={chip(mode === m)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'rain' && (
            <>
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                난이도
              </div>
              <div className="flex gap-1.5 mb-3">
                {RAIN_LEVELS.map((l) => (
                  <button
                    key={l.level}
                    onClick={() => setLevel(l.level)}
                    className="flex-1 rounded-xl py-2.5 text-[14px] font-bold"
                    style={chip(level === l.level)}
                  >
                    {l.level}
                  </button>
                ))}
              </div>
              <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                떨어지는 낱말을 쳐서 없애요. <b>바닥에 닿으면 하트가 줄어요</b> — 세 번 놓치면 끝.
                올라갈수록 길고 빠르고 많아져요.
              </p>
            </>
          )}
          {mode === 'practice' && (
            <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              문장을 <b>그대로</b> 쳐요. 다섯 줄을 치면 기록이 남아요.
              끊지 않고 이어 치는 연습이에요.
            </p>
          )}

          <button
            onClick={() => {
              setResult(null); setErr('');
              if (mode === 'rain') { setPlaying(true); playSound('open'); }
              else startPractice();
            }}
            className="w-full rounded-2xl py-3.5 text-[16px] font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            시작하기
          </button>
        </>
      )}

      {playing && mode === 'rain' && (
        <RainTyping
          level={rainLevel(level)}
          onEnd={(r) => {
            setPlaying(false);
            // 서버가 다시 세도록 **친 낱말 그대로** 보낸다
            send(r.words ?? [], r.ms);
          }}
        />
      )}

      {playing && mode === 'practice' && (
        <div>
          <div className="text-[13px] mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
            {done.length + 1} / 5 번째 줄
          </div>
          <div
            className="rounded-2xl px-4 py-4 mb-2 text-[17px] font-bold leading-relaxed"
            style={{ background: 'white', color: '#3A3226' }}
          >
            {/* 어디까지 맞게 쳤는지 글자마다 보여준다 — 틀린 자리를 스스로 찾게 */}
            {[...line].map((ch, i) => {
              const typed = [...input][i];
              const state = typed === undefined ? 'todo' : typed === ch ? 'ok' : 'bad';
              return (
                <span
                  key={i}
                  style={{
                    color: state === 'ok' ? '#3BAF9F' : state === 'bad' ? '#C0392B' : '#B9AC97',
                    textDecoration: state === 'bad' ? 'underline' : 'none',
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
          <input
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitLine(); }}
            placeholder="위 문장을 그대로 치고 엔터"
            autoComplete="off"
            className="w-full rounded-2xl px-4 py-3.5 text-[17px] outline-none"
            style={{ background: 'white', color: '#3A3226', border: '3px solid #CFE3D6' }}
          />
          <button
            onClick={() => { setPlaying(false); setDone([]); }}
            className="w-full mt-2 rounded-xl py-2.5 text-[13px] font-bold"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            그만두기
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-2xl p-4 mt-4 text-center" style={{ background: '#EAF6EF' }}>
          <div className="text-[28px] font-black" style={{ color: '#3BAF9F' }}>{result.cpm}타</div>
          <div className="text-[13px] mt-1" style={{ color: '#6B5B43' }}>
            분당 타수 · 모두 {result.strokes}타를 쳤어요
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: '#8A7A5F' }}>
            이번 주 내 최고 {result.best}타
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-xl px-3 py-2 mt-3 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>
          ⚠️ {err}
        </div>
      )}

      {/* 순위표 */}
      <div className="mt-5">
        <div className="text-[14px] font-black" style={{ color: 'var(--color-text-main)' }}>
          🏆 이번 주 {mode === 'rain' ? `산성비 ${level}단계` : '단문 연습'} 기록
        </div>
        <div className="text-[12px] mb-2" style={{ color: 'var(--color-text-sub)' }}>
          {resetLabel}에 새로 시작해요 · 분당 타수로 겨뤄요
        </div>
        {board.length === 0 ? (
          <div className="text-[13px]" style={{ color: 'var(--color-text-sub)' }}>
            아직 이번 주 기록이 없어요. 첫 기록을 남겨보세요!
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {board.map((b, i) => (
              <div key={`${b.name}-${i}`} className="flex items-center gap-2 text-[14px]">
                <span>{['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</span>
                <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-main)' }}>{b.name}</span>
                <span className="font-bold" style={{ color: '#8A7A5F' }}>{b.cpm}타</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
