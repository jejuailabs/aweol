'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { JejuPlace } from '@/lib/jeju-map';

const JejuMapScene = dynamic(() => import('@/components/gallery3d/JejuMapScene'), { ssr: false });

/**
 * 제주 전도 — 워프 허브. (docs/10-jeju-warp-map.md)
 *
 * 실좌표를 투영한 제주도 위에서 무대를 고른다.
 * 지금 열린 곳: 애월(마을) · 한담해변 · 곽지해수욕장(마을 안 워프).
 * 나머지는 '예정중' — 눌러보면 그렇게 말해준다.
 */
export default function JejuPage() {
  const router = useRouter();
  /** 예정인 곳을 눌렀을 때 잠깐 띄우는 말 */
  const [soonMsg, setSoonMsg] = useState('');

  const pick = (p: JejuPlace) => {
    if (p.status === 'open' && p.route) {
      router.push(p.route);
      return;
    }
    setSoonMsg(`${p.emoji} ${p.name}은 아직 준비 중이에요!`);
    setTimeout(() => setSoonMsg(''), 2200);
  };

  return (
    <div className="scene-page">
      <JejuMapScene onPick={pick} />

      <button
        onClick={() => router.push('/village')}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 마을로
      </button>

      <div
        className="pos-top-safe absolute left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-2 text-[14px] font-black pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.92)', color: '#5B4A3B' }}
      >
        🗾 제주 어디로 갈까?
      </div>

      {soonMsg && (
        <div
          className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-3 text-[15px] font-black"
          style={{ background: 'rgba(24,20,16,0.82)', color: '#FFF8E7' }}
        >
          {soonMsg}
        </div>
      )}
    </div>
  );
}
