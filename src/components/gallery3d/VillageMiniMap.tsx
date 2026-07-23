'use client';

import { useMemo, useRef, useState } from 'react';
import type { WarpTarget } from '@/lib/village-travel';

/**
 * 마을 전체 지도 — **누르면 그 자리로 간다.**
 *
 * 예전 순간이동은 **글자 목록**이었다('한담해변 · 320m'). 아이는 그 이름이
 * 어디쯤인지 모른다 — 자기가 지금 어디 서 있는지도 모르는 채로 이름만 고른다.
 *
 * **새로 받아오는 것이 없다.** 마을을 그리려고 이미 손에 든 좌표(길·건물·물·공원)를
 * 그대로 SVG 로 한 번 더 그릴 뿐이다 — 지도 API 도, 이미지도 안 부른다.
 *
 * **좌표를 미터 그대로 쓴다.** viewBox 를 미터 단위로 잡으면 확대·축소가
 * '보는 네모를 좁히고 넓히는 것' 이 되어 계산이 사라진다. 대신 글자와 점은
 * 화면에서 늘 같은 크기로 보여야 하므로 배율만큼 되돌려 그린다.
 */

interface Props {
  /** 마을 반경(미터). 좌표는 학교를 원점으로 한 미터다. */
  radius: number;
  roads: { p: [number, number][]; w: number }[];
  buildings: { p: [number, number][]; n?: string }[];
  areas: { p: [number, number][]; k: 'water' | 'park' }[];
  /** 지금 내가 선 자리와 보는 쪽 */
  me: { x: number; z: number; yaw?: number };
  targets: WarpTarget[];
  /** 그중 **들어가 볼 수 있는** 곳(우체국·읍사무소 …). 다르게 그린다. */
  civicIds?: Set<string>;
  onWarp: (t: WarpTarget) => void;
  onClose: () => void;
}

/** 얼마나 당겨 볼 수 있나 — 1 은 마을 전체, 6 이면 한 골목 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

const pathOf = (p: [number, number][]) => p.map(([x, z]) => `${x},${z}`).join(' ');

export default function VillageMiniMap({
  radius, roads, buildings, areas, me, targets, civicIds, onWarp, onClose,
}: Props) {
  const [zoom, setZoom] = useState(1);
  /** 보는 한가운데(미터). 처음에는 내가 선 자리를 비춘다 — 마을 전체보다 먼저 '나' 다. */
  const [center, setCenter] = useState({ x: me.x, z: me.z });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 보는 네모의 한 변(미터) */
  const span = (radius * 2) / zoom;
  /** 화면에서 늘 같아 보여야 하는 것들의 배율 (전체를 볼 때가 1) */
  const s = span / (radius * 2);

  /** 마을 밖으로 밀려나지 않게 가둔다 — 빈 초록만 보이면 길을 잃는다 */
  const clamp = (v: number) => {
    const limit = Math.max(0, radius - span / 2);
    return Math.max(-limit, Math.min(limit, v));
  };
  const cx = clamp(center.x);
  const cz = clamp(center.z);
  const viewBox = `${cx - span / 2} ${cz - span / 2} ${span} ${span}`;

  const setZoomAt = (next: number) => setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));

  /** 끌어서 옮기기 — 손가락으로도 마우스로도 같은 길 */
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, cx, cz };
    setGrabbing(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = svgRef.current;
    if (!d || !el) return;
    // 화면 픽셀 → 미터. 그림이 정사각형이라 한 변만 재면 된다.
    const perPx = span / el.getBoundingClientRect().width;
    setCenter({ x: d.cx - (e.clientX - d.x) * perPx, z: d.cz - (e.clientY - d.y) * perPx });
  };
  const onUp = () => { drag.current = null; setGrabbing(false); };

  const namedBuildings = useMemo(() => buildings.filter((b) => b.n), [buildings]);
  const plainBuildings = useMemo(() => buildings.filter((b) => !b.n), [buildings]);

  /** 확대해서 좁게 볼 때만 이름을 다 띄운다 — 전체를 볼 때 다 띄우면 글자가 겹친다 */
  const showAllNames = zoom >= 2.2;

  const btn = 'h-9 w-9 rounded-full text-[17px] font-black flex items-center justify-center';
  const btnStyle = { background: 'rgba(255,255,255,0.92)', color: '#5B4A3B', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' };

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
          <div className="text-[12px]" style={{ color: '#A89880' }}>끌어서 옮기고, 눌러서 가요</div>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full text-sm"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#6B5B43' }}
          >
            ✕
          </button>
        </div>

        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="w-full block touch-none select-none"
            // 끄는 중인지는 상태로 둔다 — ref 를 그리는 중에 읽으면 안 된다
            style={{ background: '#DCEFD6', aspectRatio: '1 / 1', cursor: grabbing ? 'grabbing' : 'grab' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={(e) => setZoomAt(zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18))}
          >
            {/* 물·공원 — 바닥에 깔린 것부터 */}
            {areas.map((a, i) => (
              <polygon
                key={`a${i}`}
                points={pathOf(a.p)}
                fill={a.k === 'water' ? '#A9DCF2' : '#BFE3B3'}
                stroke="none"
              />
            ))}

            {/* 길 — 실제 폭(미터)으로 긋는다. 당겨 보면 골목이 좁다는 게 보인다. */}
            {roads.map((r, i) => (
              <polyline
                key={`r${i}`}
                points={pathOf(r.p)}
                fill="none"
                stroke="#CDBE9E"
                strokeWidth={r.w}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* 이름 없는 건물 — 옅게. 있는 것과 없는 것은 다르다 */}
            {plainBuildings.map((b, i) => (
              <polygon key={`p${i}`} points={pathOf(b.p)} fill="#DED6C6" opacity={0.75} />
            ))}
            {/* 이름 있는 건물 */}
            {namedBuildings.map((b, i) => (
              <polygon key={`n${i}`} points={pathOf(b.p)} fill="#E6DAC4" stroke="#B9A480" strokeWidth={1.2 * s} />
            ))}

            {/*
              갈 수 있는 곳. **누르는 자리를 넉넉히** 준다 —
              아이 손가락에 작은 점은 못 누른다. 배율이 바뀌어도 손가락 크기는 그대로다.
            */}
            {targets.map((t) => {
              const isSchool = t.id === 'school';
              /**
               * **들어갈 수 있는 곳은 다르게 그린다.** 그냥 갈 수만 있는 곳(은행 앞)과
               * 안에 들어가 배울 수 있는 곳(읍사무소)은 아이에게 다른 이야기다.
               */
              const civic = !isSchool && !!civicIds?.has(t.id);
              const r = (isSchool ? 16 : civic ? 14 : 11) * s;
              return (
                <g key={t.id} onClick={() => onWarp(t)} style={{ cursor: 'pointer' }}>
                  <circle cx={t.x} cy={t.z} r={38 * s} fill="transparent" />
                  <circle
                    cx={t.x}
                    cy={t.z}
                    r={r}
                    fill={isSchool ? '#E8A33C' : civic ? '#8FA9C9' : '#FFFFFF'}
                    stroke={isSchool ? '#B87A22' : civic ? '#4A6FA5' : '#8A7A5F'}
                    strokeWidth={4 * s}
                  />
                  {/* 들어갈 수 있는 곳에는 문 표시를 얹는다 */}
                  {civic && (
                    <text x={t.x} y={t.z + 5 * s} textAnchor="middle" style={{ fontSize: `${14 * s}px` }}>
                      🚪
                    </text>
                  )}
                  {(isSchool || civic || showAllNames) && (
                    <text
                      x={t.x}
                      y={t.z - 24 * s}
                      textAnchor="middle"
                      style={{
                        fontFamily: 'Pretendard, sans-serif',
                        fontSize: `${30 * s}px`,
                        fontWeight: 800,
                        fill: '#4A3F30',
                        paintOrder: 'stroke',
                        stroke: '#FAF5EA',
                        strokeWidth: 7 * s,
                      }}
                    >
                      {t.name.length > 9 ? `${t.name.slice(0, 9)}…` : t.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/*
              내 자리 — 갈 곳들 위에 그린다. **보는 쪽까지 그린다**:
              점 하나만 있으면 어느 쪽으로 걸어야 할지 알 수 없다.
            */}
            <circle cx={me.x} cy={me.z} r={22 * s} fill="rgba(59,175,159,0.25)" />
            <g transform={`translate(${me.x} ${me.z}) rotate(${((me.yaw ?? 0) * 180) / Math.PI})`}>
              <polygon
                points={`0,${-17 * s} ${8 * s},${6 * s} ${-8 * s},${6 * s}`}
                fill="#3BAF9F"
                stroke="#FFFFFF"
                strokeWidth={3 * s}
              />
            </g>
          </svg>

          {/* 확대·축소 — 손가락으로도 누를 수 있게 크게 */}
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <button onClick={() => setZoomAt(zoom * 1.5)} className={btn} style={btnStyle}>＋</button>
            <button onClick={() => setZoomAt(zoom / 1.5)} className={btn} style={btnStyle}>－</button>
            <button
              onClick={() => { setZoom(1); setCenter({ x: 0, z: 0 }); }}
              className={btn}
              style={btnStyle}
              title="마을 전체 보기"
            >
              ⤢
            </button>
            <button
              onClick={() => { setZoomAt(2.6); setCenter({ x: me.x, z: me.z }); }}
              className={btn}
              style={btnStyle}
              title="내 자리로"
            >
              ◎
            </button>
          </div>

          {/* 북쪽 — 지도에 방향이 없으면 어디가 어딘지 모른다 */}
          <div
            className="absolute left-3 top-3 h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-black"
            style={{ background: 'rgba(255,255,255,0.92)', color: '#5B4A3B' }}
          >
            N↑
          </div>

          {/* 얼마나 당겨 봤나 — 게임 지도에는 늘 있는 것 */}
          <div
            className="absolute left-3 bottom-3 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: 'rgba(255,255,255,0.92)', color: '#8A7A5F' }}
          >
            한 변 {Math.round(span)}m
          </div>
        </div>

        <div className="px-4 py-3 text-[12px] leading-relaxed" style={{ color: '#8A7A5F' }}>
          <b style={{ color: '#3BAF9F' }}>▲</b> 지금 나(보는 쪽) ·{' '}
          <b style={{ color: '#E8A33C' }}>●</b> 학교 ·{' '}
          <b style={{ color: '#4A6FA5' }}>●</b> 🚪 들어가 볼 수 있는 곳 ·{' '}
          <b style={{ color: '#8A7A5F' }}>●</b> 그 자리로 가기
        </div>
      </div>
    </div>
  );
}
