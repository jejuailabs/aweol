'use client';

import { useMemo } from 'react';
import type { WarpTarget } from '@/lib/village-travel';

/**
 * 마을 전체 지도 — **누르면 그 자리로 간다.**
 *
 * 예전 순간이동은 **글자 목록**이었다('한담해변 · 320m'). 아이는 그 이름이
 * 어디쯤인지 모른다 — 자기가 지금 어디 서 있는지도 모르는 채로 이름만 고른다.
 * 동네가 800m 로 넓어지면서 그게 더 심해졌다.
 *
 * **새로 받아오는 것이 없다.** 마을을 그리려고 이미 손에 든 좌표(길·건물)를
 * 그대로 SVG 로 한 번 더 그릴 뿐이다 — 지도 API 도, 이미지도 안 부른다.
 */

interface Props {
  /** 마을 반경(미터). 좌표는 학교를 원점으로 한 미터다. */
  radius: number;
  roads: { p: [number, number][] }[];
  buildings: { p: [number, number][]; n?: string }[];
  /** 지금 내가 선 자리 */
  me: { x: number; z: number };
  targets: WarpTarget[];
  /** 그중 **들어가 볼 수 있는** 곳(우체국·읍사무소 …). 다르게 그린다. */
  civicIds?: Set<string>;
  onWarp: (t: WarpTarget) => void;
  onClose: () => void;
}

/** 그리는 판 크기 (SVG 안쪽 좌표) */
const SIZE = 1000;

export default function VillageMiniMap({
  radius, roads, buildings, me, targets, civicIds, onWarp, onClose,
}: Props) {
  /** 미터 → 판 좌표. 학교가 한가운데다. */
  const toXY = useMemo(() => {
    const scale = SIZE / (radius * 2);
    return (x: number, z: number): [number, number] => [
      SIZE / 2 + x * scale,
      SIZE / 2 + z * scale,
    ];
  }, [radius]);

  const roadPaths = useMemo(
    () =>
      roads
        .filter((r) => r.p.length >= 2)
        .map((r) => r.p.map(([x, z]) => toXY(x, z).join(',')).join(' ')),
    [roads, toXY]
  );

  /**
   * 건물은 **이름 있는 것만** 그린다. 수백 채를 다 그리면 지도가 회색 덩어리가 되고,
   * 아이가 찾는 것은 어차피 이름 있는 곳이다.
   */
  const buildingPaths = useMemo(
    () =>
      buildings
        .filter((b) => b.n && b.p.length >= 3)
        .map((b) => b.p.map(([x, z]) => toXY(x, z).join(',')).join(' ')),
    [buildings, toXY]
  );

  const [meX, meY] = toXY(me.x, me.z);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      style={{ background: 'rgba(24,20,16,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-3xl overflow-hidden"
        style={{ background: '#FAF5EA', border: '3px solid rgba(255,255,255,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="text-[15px] font-black" style={{ color: '#3A3226' }}>🗺️ 우리 동네</div>
          <div className="text-[12px]" style={{ color: '#A89880' }}>가고 싶은 곳을 눌러요</div>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full text-sm"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#6B5B43' }}
          >
            ✕
          </button>
        </div>

        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full block"
          style={{ background: '#DCEFD6', aspectRatio: '1 / 1' }}
        >
          {/* 길 */}
          {roadPaths.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="#CDBE9E"
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* 이름 있는 건물 */}
          {buildingPaths.map((pts, i) => (
            <polygon key={i} points={pts} fill="#E6DAC4" stroke="#C9B695" strokeWidth={2} />
          ))}

          {/*
            갈 수 있는 곳. **누르는 자리를 넉넉히** 준다 —
            아이 손가락에 6px 짜리 점은 못 누른다.
          */}
          {targets.map((t) => {
            const [tx, ty] = toXY(t.x, t.z);
            const isSchool = t.id === 'school';
            /**
             * **들어갈 수 있는 곳은 다르게 그린다.**
             * 그냥 갈 수만 있는 곳(은행 앞)과 안에 들어가 배울 수 있는 곳(읍사무소)은
             * 아이에게 전혀 다른 이야기다. 같은 흰 점으로 그리면 구별할 길이 없다.
             */
            const civic = !isSchool && !!civicIds?.has(t.id);
            return (
              <g
                key={t.id}
                onClick={() => onWarp(t)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={tx} cy={ty} r={38} fill="transparent" />
                <circle
                  cx={tx}
                  cy={ty}
                  r={isSchool ? 16 : civic ? 14 : 12}
                  fill={isSchool ? '#E8A33C' : civic ? '#8FA9C9' : '#FFFFFF'}
                  stroke={isSchool ? '#B87A22' : civic ? '#4A6FA5' : '#8A7A5F'}
                  strokeWidth={4}
                />
                <text
                  x={tx}
                  y={ty - 24}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'Pretendard, sans-serif',
                    fontSize: '30px',
                    fontWeight: 800,
                    fill: '#4A3F30',
                    paintOrder: 'stroke',
                    stroke: '#FAF5EA',
                    strokeWidth: 7,
                  }}
                >
                  {t.name.length > 9 ? `${t.name.slice(0, 9)}…` : t.name}
                </text>
              </g>
            );
          })}

          {/* 내 자리 — 갈 곳들 위에 그려서 가려지지 않게 */}
          <circle cx={meX} cy={meY} r={22} fill="rgba(59,175,159,0.25)" />
          <circle cx={meX} cy={meY} r={10} fill="#3BAF9F" stroke="#FFFFFF" strokeWidth={4} />
        </svg>

        <div className="px-4 py-3 text-[12px] leading-relaxed" style={{ color: '#8A7A5F' }}>
          <b style={{ color: '#3BAF9F' }}>●</b> 지금 나 ·{' '}
          <b style={{ color: '#E8A33C' }}>●</b> 학교 ·{' '}
          <b style={{ color: '#4A6FA5' }}>●</b> 들어가 볼 수 있는 곳 ·{' '}
          <b style={{ color: '#8A7A5F' }}>●</b> 그 자리로 가기
        </div>
      </div>
    </div>
  );
}
