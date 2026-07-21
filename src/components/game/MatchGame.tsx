'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { playSound } from '@/lib/sound';
import { buildMatchDeck, isMatch, matchScore, type MatchCard, type WordPair } from '@/lib/wordset';

/** 한 판에 쓰는 쌍 수. 12장이면 휴대폰 한 화면에 들어간다. */
const PAIRS_PER_ROUND = 6;

/** 못 맞힌 두 장을 도로 덮기까지 (ms). 너무 짧으면 읽을 새가 없다. */
const FLIP_BACK_MS = 900;

/**
 * 짝맞추기.
 *
 * 낱말 카드와 뜻 카드를 뒤집어 짝을 찾는다. 낱말 쌍만 있으면 되므로
 * 선생님이 따로 만들 게 없다 — 스테이지 하나로 여러 게임이 돌아간다.
 */
export default function MatchGame({
  pairs, seed, onDone, onExit,
}: {
  pairs: WordPair[];
  /** 판 배치를 정하는 수. 같은 값이면 같은 배치다(새로고침으로 쉬운 판을 못 고른다). */
  seed: number;
  onDone: (r: { flips: number; score: number }) => void;
  onExit: () => void;
}) {
  const deck = useMemo(() => buildMatchDeck(pairs, seed, PAIRS_PER_ROUND), [pairs, seed]);
  const pairCount = useMemo(() => new Set(deck.map((c) => c.pairId)).size, [deck]);

  /** 지금 뒤집혀 있는 카드 자리(최대 2장) */
  const [open, setOpen] = useState<number[]>([]);
  /** 이미 맞힌 쌍 */
  const [found, setFound] = useState<number[]>([]);
  const [flips, setFlips] = useState(0);
  /** 도로 덮는 중에는 못 누른다 — 연타하면 세 장이 뒤집힌다 */
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);

  const cleared = pairCount > 0 && found.length === pairCount;

  useEffect(() => {
    if (!cleared || done) return;
    setDone(true);
    playSound('success');
    onDone({ flips, score: matchScore(pairCount, flips) });
  }, [cleared, done, flips, pairCount, onDone]);

  const flip = useCallback((i: number) => {
    if (locked || done) return;
    if (open.includes(i)) return;
    if (found.includes(deck[i].pairId)) return;

    const next = [...open, i];
    setOpen(next);
    setFlips((n) => n + 1);
    playSound('open');

    if (next.length < 2) return;

    const [x, y] = next;
    if (isMatch(deck[x], deck[y])) {
      setFound((f) => [...f, deck[x].pairId]);
      setOpen([]);
      playSound('success');
      return;
    }
    // 틀렸다 — 잠깐 보여준 뒤 도로 덮는다
    setLocked(true);
    setTimeout(() => {
      setOpen([]);
      setLocked(false);
    }, FLIP_BACK_MS);
  }, [locked, done, open, found, deck]);

  if (deck.length === 0) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.8)' }}>
        <div className="text-3xl mb-2">🃏</div>
        <div className="text-[14px]" style={{ color: '#8A7A5F' }}>
          아직 낱말이 없어요.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[14px] font-black" style={{ color: '#3A3226' }}>
          🃏 짝맞추기
        </div>
        <div className="text-[13px] font-bold" style={{ color: '#8A7A5F' }}>
          {found.length} / {pairCount} 쌍
        </div>
        <div className="ml-auto text-[13px] font-bold" style={{ color: '#8A7A5F' }}>
          뒤집은 횟수 {flips}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {deck.map((c, i) => {
          const isFound = found.includes(c.pairId);
          const isOpen = open.includes(i) || isFound;
          return (
            <button
              key={`${c.pairId}-${c.side}`}
              onClick={() => flip(i)}
              disabled={isFound || done}
              className="rounded-2xl px-2 py-3 text-[13px] font-bold leading-tight transition-transform active:scale-95"
              style={{
                minHeight: '76px',
                // 맞힌 카드는 흐리게 두어 '이건 끝났다' 를 보이게 한다
                opacity: isFound ? 0.45 : 1,
                background: isOpen ? (c.side === 'a' ? '#FFF1D6' : '#E4F1FB') : '#B08860',
                color: isOpen ? '#3A3226' : '#B08860',
                border: isOpen ? '2px solid #E8C86A' : '2px solid #9C7448',
              }}
            >
              {isOpen ? c.text : '?'}
            </button>
          );
        })}
      </div>

      {done ? (
        <div
          className="rounded-2xl px-4 py-3 text-center"
          style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}
        >
          <div className="text-[15px] font-black mb-0.5" style={{ color: '#2E8B57' }}>
            🎉 다 맞혔어요! {matchScore(pairCount, flips)}점
          </div>
          <div className="text-[13px]" style={{ color: '#5FA87C' }}>
            {flips}번 뒤집었어요 (제일 적게는 {pairCount * 2}번)
          </div>
          <button
            onClick={onExit}
            className="mt-2.5 w-full rounded-xl py-2.5 text-[14px] font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            그만하기
          </button>
        </div>
      ) : (
        <button
          onClick={onExit}
          className="w-full rounded-xl py-2.5 text-[13px] font-bold"
          style={{ background: 'rgba(255,255,255,0.8)', color: '#8A7A5F' }}
        >
          ← 그만두기
        </button>
      )}
    </div>
  );
}
