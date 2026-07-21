'use client';

import { useState } from 'react';
import SpotPanel from '@/components/notice/SpotPanel';
import StagePanel from './StagePanel';

type GameKind = 'match' | 'spot';

/**
 * 게임 — 여러 게임을 한자리에 모은 곳.
 *
 * 전에는 '틀린그림 찾기' 가 알림판 칸 하나를 통째로 쓰고 있었다. 게임이 늘어날
 * 때마다 칸을 하나씩 더 만들 수는 없어서, **게임이라는 칸 하나** 안에 종류를 둔다.
 *
 * 게임을 늘릴 때 여기 한 줄만 더하면 된다.
 */
const GAMES: { kind: GameKind; label: string; emoji: string; desc: string }[] = [
  { kind: 'match', label: '짝맞추기', emoji: '🃏', desc: '낱말과 뜻을 맞춰요' },
  { kind: 'spot', label: '틀린그림 찾기', emoji: '🔍', desc: '다른 곳을 찾아요' },
];

export default function GamePanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const [kind, setKind] = useState<GameKind>('match');

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {GAMES.map((g) => (
          <button
            key={g.kind}
            onClick={() => setKind(g.kind)}
            className="flex-1 rounded-2xl px-3 py-2.5 text-left transition-transform active:scale-95"
            style={
              kind === g.kind
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'rgba(255,255,255,0.85)', color: '#8A7A5F' }
            }
          >
            <div className="text-[15px] font-black">{g.emoji} {g.label}</div>
            <div className="text-[12px] opacity-85">{g.desc}</div>
          </button>
        ))}
      </div>

      {kind === 'match' ? (
        <StagePanel schoolId={schoolId} classId={classId} />
      ) : (
        <SpotPanel schoolId={schoolId} classId={classId} />
      )}
    </div>
  );
}
