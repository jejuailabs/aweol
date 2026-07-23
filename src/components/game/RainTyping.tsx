'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { countStrokes, pickWord, strokesPerMinute, type RainLevel } from '@/lib/typing';
import { playSound } from '@/lib/sound';

/**
 * 산성비 — 떨어지는 낱말을 쳐서 없앤다.
 *
 * **바닥에 닿으면 목숨이 준다.** 세 번 놓치면 끝.
 *
 * 화면이 아니라 **입력칸이 주인공**이다. 아이는 낱말을 보고 치기만 하면 되고,
 * 마우스는 한 번도 안 쓴다 — 타자 연습이니 손이 자판을 떠나면 안 된다.
 * 그래서 시작도 끝도 엔터로 되게 했다.
 */

interface Drop {
  id: number;
  word: string;
  /** 가로 자리 (0~1) */
  x: number;
  /** 떨어지기 시작한 시각 */
  born: number;
}

const LIVES = 3;
/** 몇 프레임마다 화면을 다시 그리나 — 60fps 로 그릴 이유가 없다 */
const TICK_MS = 50;

export default function RainTyping({
  level, onEnd,
}: {
  level: RainLevel;
  /** 판이 끝나면 점수를 넘긴다. 기록은 부모가 서버로 보낸다. */
  onEnd: (r: { words: string[]; strokes: number; missed: number; ms: number; cpm: number }) => void;
}) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [typed, setTyped] = useState('');
  const [lives, setLives] = useState(LIVES);
  const [cleared, setCleared] = useState(0);
  const [strokes, setStrokes] = useState(0);
  const [now, setNow] = useState(0);
  /** 방금 맞힌 낱말 — 잠깐 크게 띄운다 */
  const [hit, setHit] = useState<string | null>(null);

  /**
   * 판이 시작한 시각.
   *
   * `useRef(performance.now())` 로 두면 **그리는 중에 시계를 읽는 것**이라
   * 렌더가 두 번 돌면 값이 흔들린다. 0 으로 두고 화면에 붙은 뒤 한 번 찍는다.
   */
  const startedAt = useRef(0);
  useEffect(() => { startedAt.current = performance.now(); }, []);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const ended = useRef(false);
  /**
   * 맞힌 낱말들 — **이것만 서버로 간다.**
   *
   * 타수는 서버가 이 목록으로 다시 센다. 화면이 '나 500타 쳤어' 라고 보내면
   * 그건 그냥 믿는 것이 된다 — 순위표가 걸린 것은 서버가 다시 본다(달리기·양궁과 같은 원칙).
   * 상태가 아니라 ref 인 이유: 판이 끝나는 순간의 값을 정확히 집어야 하는데,
   * 상태는 그리기 뒤에 따라오므로 한 발 늦은 값이 넘어갈 수 있다.
   */
  const clearedWords = useRef<string[]>([]);

  /** 자판에서 손이 떠나지 않게 — 들어오자마자 칸에 커서를 둔다 */
  useEffect(() => { inputRef.current?.focus(); }, []);

  const finish = useCallback((missed: number) => {
    if (ended.current) return;
    ended.current = true;
    const ms = performance.now() - startedAt.current;
    const words = clearedWords.current;
    const total = words.reduce((n, w) => n + countStrokes(w), 0);
    onEnd({ words, strokes: total, missed, ms, cpm: strokesPerMinute(total, ms) });
  }, [onEnd]);

  /**
   * 시계 하나로 떨어뜨리고, 새로 만들고, 놓친 것을 센다.
   *
   * **`setInterval` 하나로 끝낸다.** `requestAnimationFrame` 을 쓰면 탭이 뒤로
   * 갔을 때 멈춰서, 아이가 돌아오면 낱말이 우수수 바닥에 닿아 있다.
   */
  useEffect(() => {
    const t = setInterval(() => {
      const t0 = performance.now();
      setNow(t0);

      setDrops((prev) => {
        // 바닥에 닿은 것
        const alive: Drop[] = [];
        let fell = 0;
        for (const d of prev) {
          if (t0 - d.born >= level.fallMs) fell += 1;
          else alive.push(d);
        }
        if (fell > 0) {
          playSound('error');
          setLives((l) => {
            const left = l - fell;
            if (left <= 0) setTimeout(() => finish(LIVES), 0);
            return Math.max(0, left);
          });
        }

        // 새 낱말
        if (alive.length < level.maxOnScreen) {
          const last = alive[alive.length - 1];
          if (!last || t0 - last.born >= level.spawnMs) {
            alive.push({
              id: nextId.current++,
              word: pickWord(level),
              // 가장자리에 붙으면 글자가 잘린다
              x: 0.08 + Math.random() * 0.84,
              born: t0,
            });
          }
        }
        return alive;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [level, finish]);

  /**
   * 친 낱말이 화면에 있으면 없앤다.
   *
   * **엔터를 안 눌러도 맞으면 사라진다.** 아이가 낱말을 다 치고 엔터까지
   * 눌러야 하면 그 사이에 다른 것이 바닥에 닿는다.
   * 여러 개가 같으면 **가장 낮은 것**부터 없앤다 — 급한 것부터가 당연하다.
   */
  const tryHit = (text: string) => {
    const word = text.trim();
    if (!word) return;
    setDrops((prev) => {
      const idx = prev.reduce<number>((lowest, d, i) => {
        if (d.word !== word) return lowest;
        if (lowest < 0) return i;
        return d.born < prev[lowest].born ? i : lowest;
      }, -1);
      if (idx < 0) return prev;

      clearedWords.current = [...clearedWords.current, word];
      setCleared((c) => c + 1);
      setStrokes((s) => s + countStrokes(word));
      setHit(word);
      setTyped('');
      playSound('success');
      return prev.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(null), 500);
    return () => clearTimeout(t);
  }, [hit]);

  return (
    <div className="w-full max-w-[520px] mx-auto">
      {/* 하늘 — 낱말이 떨어지는 곳 */}
      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: '46vh', minHeight: '260px', background: 'linear-gradient(180deg,#DCEFFA 0%,#EAF6EF 100%)' }}
      >
        {drops.map((d) => {
          const p = Math.min(1, (now - d.born) / level.fallMs);
          return (
            <div
              key={d.id}
              className="absolute -translate-x-1/2 rounded-full px-3 py-1.5 text-[16px] font-black whitespace-nowrap"
              style={{
                left: `${d.x * 100}%`,
                top: `${p * 88}%`,
                background: p > 0.75 ? '#FFE0DA' : 'rgba(255,255,255,0.95)',
                color: p > 0.75 ? '#B02A37' : '#3A3226',
                border: `2px solid ${p > 0.75 ? '#E8604C' : '#CFE3D6'}`,
              }}
            >
              {d.word}
            </div>
          );
        })}

        {/* 바닥 — 여기 닿으면 목숨이 준다 */}
        <div className="absolute left-0 right-0 bottom-0 h-2" style={{ background: '#E8604C', opacity: 0.55 }} />

        {hit && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[30px] font-black pointer-events-none"
            style={{ color: '#3BAF9F' }}
          >
            {hit} ✓
          </div>
        )}
      </div>

      {/* 목숨·성적 */}
      <div className="flex items-center gap-2 mt-3 mb-2 text-[14px] font-bold" style={{ color: '#6B5B43' }}>
        <span>{'❤️'.repeat(lives)}{'🤍'.repeat(Math.max(0, LIVES - lives))}</span>
        <span className="ml-auto">{cleared}개 · {strokes}타</span>
      </div>

      {/*
        입력칸 — **여기가 주인공이다.**
        `autoFocus` 만으로는 부족하다. 아이가 실수로 딴 데를 눌러 커서를 잃으면
        아무리 쳐도 안 들어간다. 그래서 흐려질 때마다 다시 붙잡는다.
      */}
      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => {
          const v = e.target.value;
          setTyped(v);
          tryHit(v);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') tryHit(typed); }}
        onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
        placeholder="떨어지는 낱말을 치세요"
        autoComplete="off"
        className="w-full rounded-2xl px-4 py-3.5 text-[18px] font-bold outline-none text-center"
        style={{ background: 'white', color: '#3A3226', border: '3px solid #CFE3D6' }}
      />
    </div>
  );
}
