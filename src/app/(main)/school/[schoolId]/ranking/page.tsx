'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PLAYGROUND_GAMES, type PlaygroundGame } from '@/lib/playground-games';

interface Row { uid: string; name: string; text: string }

/** 한 게임에 몇 명까지 보여줄까. 길면 아래로 갈수록 아무도 안 본다. */
const TOP = 5;

/**
 * 우리 학교 기록.
 *
 * 게임마다 흩어져 있던 순위표를 한자리에 모았다. 아이가 '내가 뭘 잘하나' 를
 * 한 번에 볼 수 있어야 한다.
 *
 * **여기 오르는 값은 전부 서버가 낸 것이다.** 달리기는 서버가 시간을 재고,
 * 양궁과 짝맞추기는 서버가 되짚어 점수를 낸다. 클라이언트가 정한 점수를
 * 랭킹에 올리면 그날로 순위표가 의미를 잃는다.
 */
export default function RankingPage() {
  const router = useRouter();
  const schoolId = String(useParams().schoolId ?? '');
  const { user } = useAuth();

  const [boards, setBoards] = useState<Record<string, Row[]>>({});
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!db) return;
    let alive = true;
    (async () => {
      const out: Record<string, Row[]> = {};
      for (const g of PLAYGROUND_GAMES) {
        if (!g.recordCol || !g.rankBy || !g.formatBest) continue;
        try {
          const snap = await getDocs(
            query(
              collection(db!, `schools/${schoolId}/${g.recordCol}`),
              orderBy(g.rankBy.field, g.rankBy.dir),
              limit(TOP)
            )
          );
          out[g.key] = snap.docs
            .map((d) => {
              const v = d.data() as Record<string, unknown>;
              return {
                uid: d.id,
                name: (v.name as string) || '친구',
                text: g.formatBest!(v) || '',
              };
            })
            .filter((r) => r.text);
        } catch {
          // 한 게임이 안 읽혀도 나머지는 보여준다
          out[g.key] = [];
        }
      }
      if (alive) { setBoards(out); setFetched(true); }
    })();
    return () => { alive = false; };
  }, [schoolId]);

  const board = (g: PlaygroundGame) => {
    const rows = boards[g.key] ?? [];
    return (
      <div key={g.key} className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[20px]">{g.emoji}</span>
          <span className="text-[16px] font-black" style={{ color: 'var(--color-text-main)' }}>
            {g.label}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>{g.trains}</span>
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl px-4 py-4 text-[13px] text-center"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            아직 기록이 없어요. 첫 번째가 되어보세요!
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => {
              const mine = !!user && r.uid === user.uid;
              return (
                <div
                  key={r.uid}
                  className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
                  style={
                    // 내 기록은 눈에 띄게 — 목록에서 나를 못 찾으면 볼 이유가 없다
                    mine
                      ? { background: '#FFF1D6', border: '2px solid #E8C86A' }
                      : { background: 'var(--color-surface)' }
                  }
                >
                  <span className="text-[16px] w-6 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}
                  </span>
                  <span
                    className="flex-1 min-w-0 truncate text-[14px] font-bold"
                    style={{ color: 'var(--color-text-main)' }}
                  >
                    {r.name}{mine && ' (나)'}
                  </span>
                  <span className="text-[14px] font-black shrink-0" style={{ color: g.color }}>
                    {r.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pt-6 pb-28 mx-auto max-w-[520px]">
      <button
        onClick={() => router.push(`/school/${schoolId}/playground`)}
        className="ac-btn px-3.5 py-2 text-sm mb-4"
      >
        ← 운동장으로
      </button>

      <h1 className="text-xl font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        🏆 우리 학교 기록
      </h1>
      <p className="text-[14px] mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        게임마다 제일 잘한 친구들이에요.
      </p>

      {!fetched ? (
        <div className="text-[14px]" style={{ color: 'var(--color-text-sub)' }}>불러오는 중...</div>
      ) : (
        PLAYGROUND_GAMES.filter((g) => g.rankBy).map(board)
      )}
    </div>
  );
}
