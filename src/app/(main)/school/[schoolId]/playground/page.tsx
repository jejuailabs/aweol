'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { PLAYGROUND_GAMES } from '@/lib/playground-games';

/**
 * 운동장 — 무엇을 하고 놀지 고르는 곳.
 *
 * 전에는 운동장에 들어가면 곧장 달리기가 떴다. 게임이 늘어도 아이가 찾을
 * 길이 없어서, 카드로 고르게 바꿨다.
 *
 * 카드에 **내 최고 기록**을 같이 보여준다. 기록이 보이면 다시 해보고 싶어진다.
 */
export default function PlaygroundPage() {
  const router = useRouter();
  const schoolId = String(useParams().schoolId ?? '');
  const { user } = useAuth();

  /** 게임 key → 사람이 읽는 내 최고 기록 */
  const [best, setBest] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!db || !user) { setBest({}); return; }
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      // 게임이 몇 개뿐이라 하나씩 읽어도 싸다. 늘어나면 한 번에 모으는 걸로 바꾼다.
      for (const g of PLAYGROUND_GAMES) {
        if (!g.recordCol || !g.formatBest) continue;
        try {
          const snap = await getDoc(doc(db!, `schools/${schoolId}/${g.recordCol}/${user.uid}`));
          if (!snap.exists()) continue;
          const text = g.formatBest(snap.data() as Record<string, unknown>);
          if (text) out[g.key] = text;
        } catch {
          // 기록을 못 읽어도 게임은 할 수 있어야 한다. 조용히 넘어간다.
        }
      }
      if (alive) setBest(out);
    })();
    return () => { alive = false; };
  }, [schoolId, user]);

  return (
    <div className="px-4 pt-6 pb-28 mx-auto max-w-[520px]">
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="ac-btn px-3.5 py-2 text-sm mb-4"
      >
        ← 학교로
      </button>

      <h1 className="text-xl font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        🏟️ 운동장
      </h1>
      <p className="text-[14px] mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        무엇을 하고 놀까요?
      </p>

      <div className="flex flex-col gap-3">
        {PLAYGROUND_GAMES.map((g) => (
          <button
            key={g.key}
            onClick={() => { playSound('tap'); router.push(`/school/${schoolId}/${g.path}`); }}
            className="w-full rounded-3xl p-4 text-left transition-transform active:scale-[0.98]"
            style={{
              background: 'var(--color-surface)',
              border: '3px solid var(--color-surface-soft)',
              boxShadow: '0 5px 0 var(--color-surface-soft)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center text-[28px]"
                style={{ background: g.color }}
              >
                {g.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-black" style={{ color: 'var(--color-text-main)' }}>
                    {g.label}
                  </span>
                  {/* 어떤 힘이 늘어나는지 — 선생님이 고를 때 본다 */}
                  <span
                    className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
                  >
                    {g.trains}
                  </span>
                </div>
                <div className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                  {g.desc}
                </div>
                {/* 기록이 있으면 보여준다. 없으면 칸 자체를 안 만든다 — 빈 줄은 지저분하다. */}
                {best[g.key] && (
                  <div className="text-[13px] font-bold mt-1" style={{ color: g.color }}>
                    🏅 내 최고 {best[g.key]}
                  </div>
                )}
              </div>
              <span className="text-[20px] shrink-0" style={{ color: 'var(--color-text-sub)' }}>›</span>
            </div>
          </button>
        ))}
      </div>

      {!user && (
        <p className="text-[13px] text-center mt-5" style={{ color: 'var(--color-text-sub)' }}>
          로그인하면 기록이 남아요
        </p>
      )}
    </div>
  );
}
