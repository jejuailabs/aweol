'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { PLAYGROUND_GAMES } from '@/lib/playground-games';

/**
 * 뒤에 깔리는 운동장.
 *
 * 흰 종이에 카드만 두 장 있으면 '운동장에 들어왔다' 는 느낌이 안 난다.
 * 트랙을 흐리게 깔아 여기가 어디인지 보이게 한다 — 고르는 건 앞의 카드다.
 */
const TrackScene = dynamic(() => import('@/components/gallery3d/TrackScene'), { ssr: false });

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
      for (const g of PLAYGROUND_GAMES.filter((x) => !x.hideOnPlayground)) {
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
    <div className="scene-page">
      {/*
        운동장을 흐리게 깔아둔다. 고르는 동안 배경이 움직이면 어지러우니
        `running={false}` 로 세워두고, 눌리지도 않게 막는다.
      */}
      <div
        className="absolute inset-0"
        style={{ filter: 'blur(7px) saturate(1.05)', pointerEvents: 'none', transform: 'scale(1.06)' }}
        aria-hidden
      >
        <TrackScene running={false} runId={0} onLap={() => {}} onFoul={() => {}} />
      </div>
      {/* 글자가 읽히게 살짝 덮는다 */}
      <div className="absolute inset-0" style={{ background: 'rgba(255,250,240,0.55)' }} aria-hidden />

      <div className="relative z-10 px-4 pt-6 pb-28 mx-auto max-w-[520px]">
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="ac-btn px-3.5 py-2 text-sm mb-4"
      >
        ← 학교로
      </button>

      <h1 className="text-2xl font-black mb-1" style={{ color: '#3A3226' }}>
        🏟️ 운동장
      </h1>
      <p className="text-[15px] mb-5 leading-relaxed font-bold" style={{ color: '#8A7A5F' }}>
        무엇을 하고 놀까요?
      </p>

      <div className="flex flex-col gap-3">
        {PLAYGROUND_GAMES.filter((g) => !g.hideOnPlayground).map((g) => (
          <button
            key={g.key}
            onClick={() => { playSound('tap'); router.push(`/school/${schoolId}/${g.path}`); }}
            className="w-full rounded-[28px] overflow-hidden text-left transition-transform active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.96)',
              border: `4px solid ${g.color}`,
              boxShadow: `0 7px 0 ${g.color}`,
            }}
          >
            {/* 색 띠 — 카드마다 다른 색이라 멀리서도 구별된다 */}
            <div
              className="flex items-center justify-center"
              style={{ background: g.color, height: 74 }}
            >
              <span style={{ fontSize: 44, lineHeight: 1 }}>{g.emoji}</span>
            </div>

            <div className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[19px] font-black" style={{ color: '#3A3226' }}>
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
              <span className="text-[22px] shrink-0" style={{ color: g.color }}>›</span>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push(`/school/${schoolId}/ranking`)}
        className="w-full mt-4 rounded-2xl py-3.5 text-[15px] font-bold"
        style={{ background: 'rgba(255,255,255,0.9)', color: '#8A7A5F', border: '2px solid #EFE3CB' }}
      >
        🏆 우리 학교 기록 보기
      </button>

      {!user && (
        <p className="text-[13px] text-center mt-5 font-bold" style={{ color: '#8A7A5F' }}>
          로그인하면 기록이 남아요
        </p>
      )}
      </div>
    </div>
  );
}
