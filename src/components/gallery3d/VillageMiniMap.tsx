'use client';

import { useMemo, useRef, useState } from 'react';
import type { WarpTarget } from '@/lib/village-travel';
import { spotVector, type VillageSpot } from '@/lib/village-spots';

/**
 * 마을 지도 — **두 층으로 본다.**
 *
 * 1) **읍 지도**: 애월리·한담·곽지가 서로 어디쯤인가. 눌러서 그 자리로 넘어간다.
 * 2) **자리 지도**: 지금 자리 안에서 어디로 갈까. 눌러서 그 앞으로 순간이동한다.
 *
 * 예전에는 자리 지도 하나뿐이었다. 그래서 "곽지가 어느 쪽이지?" 에 답할 방법이
 * 아예 없었다 — 마을 밖은 지도에 없는 세상이었다.
 *
 * **새로 받아오는 것이 없다.** 마을을 그리려고 이미 손에 든 좌표(길·건물·물·공원)를
 * 그대로 SVG 로 한 번 더 그릴 뿐이다. 읍 지도도 표에 적힌 위경도로 계산만 한다.
 *
 * **가로로 넓게 본다.** 휴대폰을 눕히든 컴퓨터로 보든 화면은 가로가 길다.
 * 정사각형 지도를 가운데 조그맣게 띄우면 그 넓은 여백이 다 낭비다.
 */

interface Props {
  /** 지금 자리의 반경(미터). 좌표는 자리 한가운데를 원점으로 한 미터다. */
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

  /** 이 학교의 모든 자리. 읍 지도가 이걸로 그려진다. */
  spots?: VillageSpot[];
  /** 지금 있는 자리 */
  currentSpot?: VillageSpot;
  /** 다른 자리로 넘어갈 때 */
  onGoSpot?: (spotId: string) => void;
}

/** 얼마나 당겨 볼 수 있나 — 1 은 자리 전체, 6 이면 한 골목 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
/** 가로:세로. 화면이 가로로 길어서 지도도 눕힌다. */
const ASPECT = 16 / 9;

const pathOf = (p: [number, number][]) => p.map(([x, z]) => `${x},${z}`).join(' ');

export default function VillageMiniMap({
  radius, roads, buildings, areas, me, targets, civicIds, onWarp, onClose,
  spots, currentSpot, onGoSpot,
}: Props) {
  /** 'town' = 읍 지도(자리들), 'spot' = 지금 자리 안 */
  const [level, setLevel] = useState<'town' | 'spot'>('spot');
  const [zoom, setZoom] = useState(1);
  /** 보는 한가운데(미터). 처음에는 내가 선 자리를 비춘다 — 자리 전체보다 먼저 '나' 다. */
  const [center, setCenter] = useState({ x: me.x, z: me.z });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 보는 네모의 **세로** 한 변(미터). 가로는 여기에 ASPECT 를 곱한다. */
  const span = (radius * 2) / zoom;
  const spanX = span * ASPECT;
  /** 화면에서 늘 같아 보여야 하는 것들의 배율 (자리 전체를 볼 때가 1) */
  const s = span / (radius * 2);

  /** 자리 밖으로 밀려나지 않게 가둔다 — 빈 초록만 보이면 길을 잃는다 */
  const clampX = (v: number) => {
    const limit = Math.max(0, radius - spanX / 2);
    return Math.max(-limit, Math.min(limit, v));
  };
  const clampZ = (v: number) => {
    const limit = Math.max(0, radius - span / 2);
    return Math.max(-limit, Math.min(limit, v));
  };
  const cx = clampX(center.x);
  const cz = clampZ(center.z);
  const viewBox = `${cx - spanX / 2} ${cz - span / 2} ${spanX} ${span}`;

  const setZoomAt = (next: number) => setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));

  /**
   * 끌어서 옮기기 + **두 손가락으로 확대·축소.**
   *
   * 휴대폰에는 휠이 없다. 오른쪽 ＋／－ 단추만 두면 지도를 볼 때마다
   * 단추를 여러 번 두드려야 하는데, **아이는 그냥 손가락을 벌린다** —
   * 지도라면 당연히 되는 동작이고, 안 되면 지도가 고장 난 줄 안다.
   */
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const onDown = (e: React.PointerEvent) => {
    if (level !== 'spot') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, cx, cz };
      setGrabbing(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      // 두 손가락이 닿는 순간 끌기는 그만둔다 — 안 그러면 지도가 휙 튄다
      drag.current = null;
      setGrabbing(false);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 두 손가락 — 벌린 만큼 확대
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      // 10px 아래는 손 떨림이라 무시한다 — 안 그러면 지도가 덜덜 떨린다
      if (pinch.current.dist > 10) {
        setZoomAt(pinch.current.zoom * (d / pinch.current.dist));
      }
      return;
    }

    const d = drag.current;
    const el = svgRef.current;
    if (!d || !el) return;
    // 화면 픽셀 → 미터. 가로 기준으로 재면 세로도 같은 배율이다(viewBox 비율이 같다).
    const perPx = spanX / el.getBoundingClientRect().width;
    setCenter({ x: d.cx - (e.clientX - d.x) * perPx, z: d.cz - (e.clientY - d.y) * perPx });
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) { drag.current = null; setGrabbing(false); }
    /**
     * 손가락 하나가 떨어지고 하나가 남으면 **남은 손가락으로 끌기를 이어받는다.**
     * 안 그러면 확대하다 한 손을 떼는 순간 지도가 얼어붙는다.
     */
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, cx, cz };
      setGrabbing(true);
    }
  };

  const namedBuildings = useMemo(() => buildings.filter((b) => b.n), [buildings]);
  const plainBuildings = useMemo(() => buildings.filter((b) => !b.n), [buildings]);

  /**
   * 읍 지도에 놓을 자리들 — **지금 자리를 원점으로 한 실제 미터.**
   * 방위도 거리도 실제 좌표에서 나온 값이라, 지도를 보고 "서쪽으로 1km" 라고
   * 말하면 그게 걸어서도 맞는 말이다.
   */
  const townSpots = useMemo(() => {
    if (!spots?.length || !currentSpot) return [];
    return spots.map((sp) => {
      if (sp.id === currentSpot.id) {
        return { spot: sp, x: 0, z: 0, dist: 0, distLabel: '지금 여기', dirLabel: '' };
      }
      const v = spotVector(currentSpot, sp);
      return { spot: sp, x: v.x, z: v.z, dist: v.dist, distLabel: v.distLabel, dirLabel: v.dirLabel };
    });
  }, [spots, currentSpot]);

  /** 읍 지도의 보는 네모 — 제일 먼 자리가 넉넉히 들어오게 */
  const townSpan = useMemo(() => {
    const far = Math.max(1200, ...townSpots.map((t) => Math.hypot(t.x, t.z) + t.spot.radius));
    return far * 2.3;
  }, [townSpots]);
  const townViewBox = `${-(townSpan * ASPECT) / 2} ${-townSpan / 2} ${townSpan * ASPECT} ${townSpan}`;
  /** 읍 지도에서 글자·점 배율 (자리 지도의 s 와 같은 구실) */
  const ts = townSpan / (radius * 2);

  /** 확대해서 좁게 볼 때만 이름을 다 띄운다 — 자리 전체를 볼 때 다 띄우면 글자가 겹친다 */
  const showAllNames = zoom >= 2.2;

  const btn = 'h-9 w-9 rounded-full text-[17px] font-black flex items-center justify-center';
  const btnStyle = {
    background: 'rgba(255,255,255,0.92)', color: '#5B4A3B',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  };

  const hasTown = townSpots.length > 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-3"
      style={{ background: 'rgba(24,20,16,0.6)' }}
      onClick={onClose}
    >
      {/*
        화면의 대부분을 쓴다. 지도는 크게 볼수록 쓸모가 커진다 —
        작게 띄우면 손가락으로 누를 수도 없고 골목도 안 보인다.
      */}
      <div
        className="w-full rounded-3xl overflow-hidden flex flex-col"
        style={{
          maxWidth: 'min(96vw, 1180px)',
          maxHeight: '92vh',
          background: '#FAF5EA',
          border: '3px solid rgba(255,255,255,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 머리말 + 층 고르기 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="text-[15px] font-black shrink-0" style={{ color: '#3A3226' }}>
            🗺️ {level === 'town' ? '애월읍 전체' : currentSpot?.name ?? '우리 동네'}
          </div>
          <div className="hidden sm:block text-[12px] min-w-0 truncate" style={{ color: '#A89880' }}>
            {level === 'town' ? '자리를 눌러 그곳으로 넘어가요' : '끌어서 옮기고, 눌러서 가요'}
          </div>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full text-sm shrink-0"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#6B5B43' }}
          >
            ✕
          </button>
        </div>

        {/*
          층 단추 — **전체 지도와 자리 지도를 오간다.**
          자리가 하나뿐인 학교에는 안 띄운다. 고를 것이 없는 단추는 군더더기다.
        */}
        {hasTown && (
          <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto shrink-0">
            <button
              onClick={() => setLevel('town')}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold"
              style={level === 'town'
                ? { background: 'var(--color-primary)', color: 'white' }
                : { background: 'white', color: '#8A7A5F' }}
            >
              🌏 애월읍 전체
            </button>
            {townSpots.map((t) => {
              const here = t.spot.id === currentSpot?.id;
              const on = level === 'spot' && here;
              return (
                <button
                  key={t.spot.id}
                  onClick={() => {
                    if (here) { setLevel('spot'); return; }
                    onGoSpot?.(t.spot.id);
                  }}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap"
                  style={on
                    ? { background: 'var(--color-primary)', color: 'white' }
                    : { background: 'white', color: here ? '#8A7A5F' : '#A89880' }}
                >
                  {t.spot.emoji} {t.spot.name}
                  {!here && <span style={{ opacity: 0.7 }}> ›</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative flex-1 min-h-0">
          {level === 'town' ? (
            /* ---------- 읍 지도 ---------- */
            <svg
              viewBox={townViewBox}
              className="w-full block select-none"
              style={{ background: '#DCEFD6', aspectRatio: `${ASPECT}`, maxHeight: '70vh' }}
            >
              {/* 바다 — 애월은 북쪽이 바다다. 방위를 몸으로 익히는 데 이만한 게 없다. */}
              <rect
                x={-(townSpan * ASPECT) / 2}
                y={-townSpan / 2}
                width={townSpan * ASPECT}
                height={townSpan / 2 - 300}
                fill="#A9DCF2"
                opacity={0.55}
              />
              <text
                x={-(townSpan * ASPECT) / 2 + 60 * ts}
                y={-townSpan / 2 + 90 * ts}
                style={{
                  fontFamily: 'Pretendard, sans-serif', fontSize: `${34 * ts}px`,
                  fontWeight: 800, fill: '#4E8BA8',
                }}
              >
                제주 바다
              </text>

              {/* 자리끼리 잇는 선 — 얼마나 떨어져 있는지가 선 길이로 보인다 */}
              {townSpots.filter((t) => t.dist > 0).map((t) => (
                <g key={`ln-${t.spot.id}`}>
                  <line
                    x1={0} y1={0} x2={t.x} y2={t.z}
                    stroke="#C4B79E" strokeWidth={5 * ts} strokeDasharray={`${14 * ts} ${10 * ts}`}
                  />
                  <text
                    x={t.x / 2}
                    y={t.z / 2 - 14 * ts}
                    textAnchor="middle"
                    style={{
                      fontFamily: 'Pretendard, sans-serif', fontSize: `${26 * ts}px`,
                      fontWeight: 700, fill: '#8A7A5F',
                      paintOrder: 'stroke', stroke: '#DCEFD6', strokeWidth: 7 * ts,
                    }}
                  >
                    {t.dirLabel}쪽 {t.distLabel}
                  </text>
                </g>
              ))}

              {/* 자리들 */}
              {townSpots.map((t) => {
                const here = t.spot.id === currentSpot?.id;
                return (
                  <g
                    key={t.spot.id}
                    onClick={() => { if (!here) onGoSpot?.(t.spot.id); }}
                    style={{ cursor: here ? 'default' : 'pointer' }}
                  >
                    {/* 자리의 실제 반경 — 걸어다닐 수 있는 넓이가 그대로 보인다 */}
                    <circle
                      cx={t.x} cy={t.z} r={t.spot.radius}
                      fill={here ? 'rgba(59,175,159,0.22)' : 'rgba(255,255,255,0.55)'}
                      stroke={here ? '#3BAF9F' : '#B9A480'}
                      strokeWidth={6 * ts}
                    />
                    <text
                      x={t.x} y={t.z + 16 * ts} textAnchor="middle"
                      style={{ fontSize: `${64 * ts}px` }}
                    >
                      {t.spot.emoji}
                    </text>
                    <text
                      x={t.x} y={t.z - 60 * ts} textAnchor="middle"
                      style={{
                        fontFamily: 'Pretendard, sans-serif', fontSize: `${40 * ts}px`,
                        fontWeight: 900, fill: '#3A3226',
                        paintOrder: 'stroke', stroke: '#FAF5EA', strokeWidth: 9 * ts,
                      }}
                    >
                      {t.spot.name}
                    </text>
                    <text
                      x={t.x} y={t.z + 92 * ts} textAnchor="middle"
                      style={{
                        fontFamily: 'Pretendard, sans-serif', fontSize: `${28 * ts}px`,
                        fontWeight: 700, fill: here ? '#2E8B7A' : '#A6762A',
                        paintOrder: 'stroke', stroke: '#FAF5EA', strokeWidth: 7 * ts,
                      }}
                    >
                      {here ? '지금 여기' : '가기 ›'}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            /* ---------- 자리 지도 ---------- */
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="w-full block touch-none select-none"
              // 끄는 중인지는 상태로 둔다 — ref 를 그리는 중에 읽으면 안 된다
              style={{
                background: '#DCEFD6', aspectRatio: `${ASPECT}`, maxHeight: '70vh',
                cursor: grabbing ? 'grabbing' : 'grab',
              }}
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
          )}

          {/* 확대·축소 — 자리 지도에서만. 읍 지도는 한 화면에 다 들어온다. */}
          {level === 'spot' && (
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              <button onClick={() => setZoomAt(zoom * 1.5)} className={btn} style={btnStyle}>＋</button>
              <button onClick={() => setZoomAt(zoom / 1.5)} className={btn} style={btnStyle}>－</button>
              <button
                onClick={() => { setZoom(1); setCenter({ x: 0, z: 0 }); }}
                className={btn}
                style={btnStyle}
                title="자리 전체 보기"
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
          )}

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
            {level === 'town'
              ? `가로 ${(townSpan * ASPECT / 1000).toFixed(1)}km`
              : `세로 ${Math.round(span)}m`}
          </div>
        </div>

        <div className="px-4 py-2.5 text-[12px] leading-relaxed shrink-0" style={{ color: '#8A7A5F' }}>
          {level === 'town' ? (
            <>
              <b style={{ color: '#3BAF9F' }}>●</b> 지금 있는 자리 ·{' '}
              <b style={{ color: '#B9A480' }}>●</b> 눌러서 넘어갈 자리 ·{' '}
              동그라미 크기가 <b>걸어다닐 수 있는 넓이</b>예요
            </>
          ) : (
            <>
              <b style={{ color: '#3BAF9F' }}>▲</b> 지금 나(보는 쪽) ·{' '}
              <b style={{ color: '#E8A33C' }}>●</b> 학교 ·{' '}
              <b style={{ color: '#4A6FA5' }}>●</b> 🚪 들어가 볼 수 있는 곳 ·{' '}
              <b style={{ color: '#8A7A5F' }}>●</b> 그 자리로 가기
            </>
          )}
        </div>
      </div>
    </div>
  );
}
