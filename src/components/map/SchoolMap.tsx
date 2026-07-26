'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export interface MapSchool {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tagline: string;
  imageUrl: string;
  classCount: number;
}

export interface MapHall {
  id: string;
  title: string;
  lat: number;
  lng: number;
  tagline: string;
  coverUrl: string;
  ownerName: string;
  showCount: number;
}

/** 웹 머케이터 변환 — 타일 좌표계로 위경도를 옮긴다 */
const TILE = 256;
const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const latToY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const xToLng = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;
const yToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const MIN_Z = 6;
const MAX_Z = 17;

export default function SchoolMap({
  schools,
  onSelect,
  focus,
  halls = [],
  onSelectHall,
}: {
  schools: MapSchool[];
  onSelect: (school: MapSchool) => void;
  focus?: { lat: number; lng: number; zoom: number };
  halls?: MapHall[];
  onSelectHall?: (hall: MapHall) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({
    lat: focus?.lat ?? 33.46,
    lng: focus?.lng ?? 126.33,
    zoom: focus?.zoom ?? 11,
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  const drag = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const z = Math.round(view.zoom);
  const scale = 2 ** (view.zoom - z);
  const centerX = lngToX(view.lng, z);
  const centerY = latToY(view.lat, z);

  // 줌이 바뀌면 펼친 클러스터를 닫는다
  useEffect(() => { setExpandedCluster(null); }, [z]);

  const project = useCallback(
    (lat: number, lng: number) => ({
      x: size.w / 2 + (lngToX(lng, z) - centerX) * scale,
      y: size.h / 2 + (latToY(lat, z) - centerY) * scale,
    }),
    [size.w, size.h, z, scale, centerX, centerY]
  );

  // --- 클러스터링: 가까운 마커를 묶는다 ---
  const clusters = useMemo(() => {
    if (size.w === 0) return [];
    const all = [
      ...schools.map((s) => ({ key: `s-${s.id}`, lat: s.lat, lng: s.lng })),
      ...halls.map((h) => ({ key: `h-${h.id}`, lat: h.lat, lng: h.lng })),
    ].map((m) => ({ ...m, p: project(m.lat, m.lng) }));

    const groups: (typeof all)[] = [];
    const used = new Set<number>();
    for (let i = 0; i < all.length; i++) {
      if (used.has(i)) continue;
      const g = [all[i]];
      used.add(i);
      for (let j = i + 1; j < all.length; j++) {
        if (used.has(j)) continue;
        if (g.some((m) => Math.abs(m.p.x - all[j].p.x) < 130 && Math.abs(m.p.y - all[j].p.y) < 56)) {
          g.push(all[j]);
          used.add(j);
        }
      }
      groups.push(g);
    }

    return groups.filter((g) => g.length >= 2).map((g) => {
      const cx = g.reduce((s, m) => s + m.p.x, 0) / g.length;
      const cy = g.reduce((s, m) => s + m.p.y, 0) / g.length;
      const id = g.map((m) => m.key).sort().join('|');
      return { id, items: g, center: { x: cx, y: cy } };
    });
  }, [schools, halls, project, size.w]);

  // 펼친 클러스터의 마커 오프셋 + 숨겨야 할 마커 키
  const { fanOffsets, hiddenKeys } = useMemo(() => {
    const fo = new Map<string, { dx: number; dy: number }>();
    const hk = new Set<string>();
    for (const c of clusters) {
      if (c.id === expandedCluster) {
        const spread = Math.min(150, 400 / Math.max(c.items.length - 1, 1));
        c.items.forEach((m, i) => {
          const dx = Math.round((i - (c.items.length - 1) / 2) * spread);
          fo.set(m.key, { dx, dy: -22 });
        });
      } else {
        c.items.forEach((m) => hk.add(m.key));
      }
    }
    return { fanOffsets: fo, hiddenKeys: hk };
  }, [clusters, expandedCluster]);

  // 화면을 덮을 타일 목록
  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
  if (size.w > 0) {
    const half = TILE * scale;
    const cols = Math.ceil(size.w / half) + 2;
    const rows = Math.ceil(size.h / half) + 2;
    const originX = Math.floor(centerX / TILE);
    const originY = Math.floor(centerY / TILE);
    const max = 2 ** z;
    for (let dx = -Math.ceil(cols / 2); dx <= Math.ceil(cols / 2); dx++) {
      for (let dy = -Math.ceil(rows / 2); dy <= Math.ceil(rows / 2); dy++) {
        const tx = originX + dx;
        const ty = originY + dy;
        if (ty < 0 || ty >= max) continue;
        const wrapped = ((tx % max) + max) % max;
        tiles.push({
          key: `${z}/${wrapped}/${ty}`,
          x: wrapped,
          y: ty,
          left: size.w / 2 + (tx * TILE - centerX) * scale,
          top: size.h / 2 + (ty * TILE - centerY) * scale,
        });
      }
    }
  }

  // ---------- 조작 ----------
  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    if ((e.target as HTMLElement).closest('button')) return;
    setExpandedCluster(null);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, lat: view.lat, lng: view.lng };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.dist > 10) {
        const next = pinch.current.zoom + Math.log2(d / pinch.current.dist);
        setView((v) => ({ ...v, zoom: Math.max(MIN_Z, Math.min(MAX_Z, next)) }));
      }
      moved.current = true;
      return;
    }

    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    const cx = lngToX(drag.current.lng, z) - dx / scale;
    const cy = latToY(drag.current.lat, z) - dy / scale;
    setView((v) => ({ ...v, lng: xToLng(cx, z), lat: yToLat(cy, z) }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const next = view.zoom - Math.sign(e.deltaY) * 0.5;
    setView((v) => ({ ...v, zoom: Math.max(MIN_Z, Math.min(MAX_Z, next)) }));
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#AFD3E7', touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {/* 펼친 마커를 실제 위치와 이어주는 점선 */}
      {size.w > 0 && [
        ...schools.map((s) => ({ key: `s-${s.id}`, lat: s.lat, lng: s.lng })),
        ...halls.map((h) => ({ key: `h-${h.id}`, lat: h.lat, lng: h.lng })),
      ].map((m) => {
        const off = fanOffsets.get(m.key);
        if (!off) return null;
        const p = project(m.lat, m.lng);
        if (p.x < -200 || p.x > size.w + 200 || p.y < -200 || p.y > size.h + 200) return null;
        return (
          <svg
            key={`ln-${m.key}`}
            width="1"
            height="1"
            className="absolute pointer-events-none"
            style={{ left: p.x, top: p.y, overflow: 'visible', zIndex: 9 }}
          >
            <line
              x1={0} y1={0} x2={off.dx} y2={off.dy}
              stroke="rgba(60,50,40,0.5)" strokeWidth={2} strokeDasharray="4 3"
            />
            <circle cx={0} cy={0} r={4} fill="#FFF8E7" stroke="rgba(60,50,40,0.6)" strokeWidth={2} />
          </svg>
        );
      })}

      {/* 지도 타일 */}
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={t.key}
          src={`https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`}
          alt=""
          draggable={false}
          className="absolute select-none"
          style={{
            left: t.left,
            top: t.top,
            width: TILE * scale,
            height: TILE * scale,
            filter: 'saturate(0.75) brightness(1.06)',
          }}
        />
      ))}

      {/* 학교 마커 */}
      {size.w > 0 &&
        schools.map((s) => {
          if (hiddenKeys.has(`s-${s.id}`)) return null;
          const p = project(s.lat, s.lng);
          if (p.x < -120 || p.x > size.w + 120 || p.y < -160 || p.y > size.h + 120) return null;
          const isHot = hovered === s.id;
          const detail = isHot || view.zoom >= 12 ? 'full' : view.zoom >= 9 ? 'compact' : 'pin';
          return (
            <button
              key={s.id}
              onClick={() => { if (!moved.current) onSelect(s); }}
              onPointerEnter={() => setHovered(s.id)}
              onPointerLeave={() => setHovered(null)}
              className="absolute flex flex-col items-center"
              style={{
                left: p.x + (fanOffsets.get(`s-${s.id}`)?.dx ?? 0),
                top: p.y + (fanOffsets.get(`s-${s.id}`)?.dy ?? 0),
                transform: `translate(-50%, -100%) scale(${isHot ? 1.08 : 1})`,
                transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
                zIndex: isHot ? 20 : 10,
              }}
            >
              {detail === 'pin' ? (
                <div
                  className="rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    background: '#FFF8E7',
                    border: '3px solid #EFE3CB',
                    boxShadow: '0 3px 0 #E3D5B8, 0 6px 12px rgba(0,0,0,0.25)',
                  }}
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm">🏫</span>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-2xl flex items-center gap-2"
                  style={{
                    background: '#FFF8E7',
                    border: '3px solid #EFE3CB',
                    boxShadow: isHot
                      ? '0 6px 0 #E3D5B8, 0 14px 26px rgba(0,0,0,0.32)'
                      : '0 4px 0 #E3D5B8, 0 8px 16px rgba(0,0,0,0.22)',
                    minWidth: detail === 'full' ? 132 : 0,
                    padding: detail === 'full' ? '8px 12px' : '5px 9px',
                  }}
                >
                  <div
                    className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                      background: '#8FD98A',
                      width: detail === 'full' ? 36 : 24,
                      height: detail === 'full' ? 36 : 24,
                    }}
                  >
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className={detail === 'full' ? 'text-lg' : 'text-sm'}>🏫</span>
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <div
                      className="font-black truncate"
                      style={{ color: '#6B5B43', fontSize: detail === 'full' ? 12 : 10 }}
                    >
                      {s.name}
                    </div>
                    {detail === 'full' && (
                      <div className="text-[11px]" style={{ color: '#A89880' }}>
                        {s.classCount > 0 ? `${s.classCount}개 반 전시 중` : '준비 중'}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div
                className="h-3 w-3 rotate-45 -mt-1.5"
                style={{ background: '#FFF8E7', border: '3px solid #EFE3CB', borderTop: 0, borderLeft: 0 }}
              />
              <div
                className="h-1.5 w-1.5 rounded-full mt-0.5"
                style={{ background: 'rgba(0,0,0,0.35)' }}
              />
            </button>
          );
        })}

      {/* 개인 전시관 마커 */}
      {size.w > 0 &&
        halls.map((h) => {
          if (hiddenKeys.has(`h-${h.id}`)) return null;
          const p = project(h.lat, h.lng);
          if (p.x < -120 || p.x > size.w + 120 || p.y < -160 || p.y > size.h + 120) return null;
          const isHot = hovered === `hall-${h.id}`;
          const detail = isHot || view.zoom >= 12 ? 'full' : view.zoom >= 9 ? 'compact' : 'pin';
          return (
            <button
              key={`hall-${h.id}`}
              onClick={() => { if (!moved.current) onSelectHall?.(h); }}
              onPointerEnter={() => setHovered(`hall-${h.id}`)}
              onPointerLeave={() => setHovered(null)}
              className="absolute flex flex-col items-center"
              style={{
                left: p.x + (fanOffsets.get(`h-${h.id}`)?.dx ?? 0),
                top: p.y + (fanOffsets.get(`h-${h.id}`)?.dy ?? 0),
                transform: `translate(-50%, -100%) scale(${isHot ? 1.08 : 1})`,
                transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
                zIndex: isHot ? 20 : 11,
              }}
            >
              {detail === 'pin' ? (
                <div
                  className="overflow-hidden flex items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    background: '#2E2B27',
                    border: '3px solid #D8B25C',
                    boxShadow: '0 3px 0 #A98B3E, 0 6px 12px rgba(0,0,0,0.28)',
                  }}
                >
                  {h.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm">🖼️</span>
                  )}
                </div>
              ) : (
                <div
                  className="flex items-center gap-2"
                  style={{
                    background: '#2E2B27',
                    border: '3px solid #D8B25C',
                    borderRadius: 8,
                    boxShadow: isHot
                      ? '0 6px 0 #A98B3E, 0 14px 26px rgba(0,0,0,0.36)'
                      : '0 4px 0 #A98B3E, 0 8px 16px rgba(0,0,0,0.26)',
                    minWidth: detail === 'full' ? 138 : 0,
                    padding: detail === 'full' ? '8px 12px' : '5px 9px',
                  }}
                >
                  <div
                    className="shrink-0 overflow-hidden flex items-center justify-center"
                    style={{
                      background: '#4A453E',
                      borderRadius: 4,
                      width: detail === 'full' ? 36 : 24,
                      height: detail === 'full' ? 36 : 24,
                    }}
                  >
                    {h.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className={detail === 'full' ? 'text-lg' : 'text-sm'}>🖼️</span>
                    )}
                  </div>
                  <div className="text-left min-w-0">
                    <div
                      className="font-black truncate"
                      style={{ color: '#F7F2E6', fontSize: detail === 'full' ? 12 : 10 }}
                    >
                      {h.title}
                    </div>
                    {detail === 'full' && (
                      <div className="text-[11px]" style={{ color: '#D8B25C' }}>
                        {h.showCount > 0 ? `전시 ${h.showCount}개` : '준비 중'}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div
                className="h-3 w-3 rotate-45 -mt-1.5"
                style={{ background: '#2E2B27', border: '3px solid #D8B25C', borderTop: 0, borderLeft: 0 }}
              />
              <div className="h-1.5 w-1.5 rounded-full mt-0.5" style={{ background: 'rgba(0,0,0,0.35)' }} />
            </button>
          );
        })}

      {/* 클러스터 배지 — 겹치는 마커를 숫자로 묶어 보여준다 */}
      {size.w > 0 &&
        clusters.map((c) => {
          if (c.id === expandedCluster) return null;
          if (c.center.x < -60 || c.center.x > size.w + 60 || c.center.y < -60 || c.center.y > size.h + 60) return null;
          return (
            <button
              key={`cluster-${c.id}`}
              onClick={() => { if (!moved.current) setExpandedCluster(c.id); }}
              className="absolute flex flex-col items-center"
              style={{
                left: c.center.x,
                top: c.center.y,
                transform: 'translate(-50%, -100%)',
                zIndex: 15,
              }}
            >
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FFF8E7 0%, #F5E6C8 100%)',
                  border: '3.5px solid #D8B25C',
                  boxShadow: '0 4px 0 #C4A044, 0 8px 16px rgba(0,0,0,0.28)',
                  fontWeight: 900,
                  fontSize: 20,
                  color: '#6B5B43',
                  letterSpacing: '-0.5px',
                }}
              >
                {c.items.length}
              </div>
              <div
                className="h-3 w-3 rotate-45 -mt-1.5"
                style={{ background: '#FFF8E7', border: '3px solid #D8B25C', borderTop: 0, borderLeft: 0 }}
              />
              <div
                className="h-1.5 w-1.5 rounded-full mt-0.5"
                style={{ background: 'rgba(0,0,0,0.35)' }}
              />
            </button>
          );
        })}

      {/* 줌 버튼 */}
      <div className="absolute right-4 bottom-28 z-30 flex flex-col gap-1.5">
        {([['+', 1], ['−', -1]] as [string, number][]).map(([label, dir]) => (
          <button
            key={label}
            onClick={() =>
              setView((v) => ({ ...v, zoom: Math.max(MIN_Z, Math.min(MAX_Z, v.zoom + dir)) }))
            }
            className="ac-btn h-10 w-10 items-center justify-center text-lg"
          >
            {label}
          </button>
        ))}
      </div>

      {/* 저작권 표기 (OSM 타일 사용 조건) */}
      <div
        className="absolute bottom-1 right-1 z-30 rounded px-1.5 py-0.5 text-[11px]"
        style={{ background: 'rgba(255,255,255,0.75)', color: '#5B5B5B' }}
      >
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
