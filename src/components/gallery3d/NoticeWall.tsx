'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';
import { NoticeKind } from '@/lib/firestore-schema';

export const NOTICE_TABS: { kind: NoticeKind; label: string; emoji: string; color: string }[] = [
  { kind: 'notice', label: '알림장', emoji: '📌', color: '#E8604C' },
  { kind: 'meal', label: '오늘의 급식', emoji: '🍚', color: '#E8A33C' },
  { kind: 'homework', label: '숙제', emoji: '📝', color: '#4A90D9' },
  { kind: 'quiz', label: '오늘의 퀴즈', emoji: '🧩', color: '#7B4B94' },
];

/**
 * 교실 앞벽에 걸린 알림판.
 * 화면을 전환하지 않고 그 자리에서 모달을 띄우기 위해 클릭만 위로 전달한다.
 */
export default function NoticeWall({
  counts,
  onOpen,
}: {
  counts: Record<NoticeKind, number>;
  onOpen: (kind: NoticeKind) => void;
}) {
  const [hovered, setHovered] = useState<NoticeKind | null>(null);

  return (
    // 앞벽(z=+6) 안쪽에 붙이고 교실을 향하도록 돌린다
    <group position={[0, 2.1, 5.88]} rotation={[0, Math.PI, 0]}>
      {/* 코르크 보드 */}
      <mesh castShadow>
        <boxGeometry args={[7.2, 2.7, 0.07]} />
        <meshStandardMaterial color="#A97B4F" />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[6.9, 2.4]} />
        <meshStandardMaterial color="#E4C9A0" roughness={0.95} />
      </mesh>

      {/* 팻말 */}
      {/*
        occlude 를 빼면 안 된다. Html transform 은 3D 위에 얹히는 DOM 이라
        깊이 판정을 하지 않아서, 아바타가 알림판 앞에 서 있어도 카드가 머리 위에 그려진다.
      */}
      <Html position={[0, 1.62, 0.05]} transform occlude="blending" scale={0.36} pointerEvents="none" zIndexRange={[5, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#7A6A52', fontWeight: 800, fontSize: '28px',
            padding: '9px 36px', borderRadius: '999px', fontFamily: 'Pretendard, sans-serif',
            border: '4px solid #EFE3CB', boxShadow: '0 5px 0 #E3D5B8',
            whiteSpace: 'nowrap', userSelect: 'none',
          }}
        >
          📢 우리 반 알림판
        </div>
      </Html>

      {/* 카테고리 4개 */}
      {NOTICE_TABS.map((tab, i) => {
        const x = -2.55 + i * 1.7;
        const isHot = counts[tab.kind] > 0;
        return (
          <group key={tab.kind} position={[x, 0, 0.06]}>
            {/* 압정 */}
            <mesh position={[0, 0.86, 0.04]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color={tab.color} metalness={0.3} roughness={0.4} />
            </mesh>
            <Html position={[0, 0, 0.02]} transform occlude="blending" scale={0.3} zIndexRange={[10, 0]}>
              <button
                onClick={() => onOpen(tab.kind)}
                onPointerEnter={() => setHovered(tab.kind)}
                onPointerLeave={() => setHovered(null)}
                style={{
                  width: '176px', height: '210px', borderRadius: '18px', cursor: 'pointer',
                  background: '#FFF8E7', border: '3px solid #EFE3CB',
                  fontFamily: 'Pretendard, sans-serif',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: '8px',
                  boxShadow: hovered === tab.kind
                    ? '0 6px 0 #E3D5B8, 0 14px 26px rgba(0,0,0,0.3)'
                    : '0 4px 0 #E3D5B8, 0 8px 16px rgba(0,0,0,0.18)',
                  transform: hovered === tab.kind ? 'translateY(-4px) scale(1.05)' : 'scale(1)',
                  transition: 'all 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <div
                  style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: tab.color + '30', border: `3px solid ${tab.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px',
                  }}
                >
                  {tab.emoji}
                </div>
                <div style={{ fontWeight: 800, fontSize: '19px', color: '#6B5B43' }}>{tab.label}</div>
                <div
                  style={{
                    fontSize: '12px', fontWeight: 700,
                    color: isHot ? 'white' : '#A89880',
                    background: isHot ? tab.color : 'transparent',
                    borderRadius: '999px', padding: isHot ? '3px 12px' : 0,
                  }}
                >
                  {isHot ? `${counts[tab.kind]}개` : '아직 없어요'}
                </div>
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
