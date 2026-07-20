'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface MapSchool {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tagline: string;
  imageUrl: string;
  classCount: number;
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

/**
 * OpenStreetMap 타일을 직접 그리는 가벼운 지도.
 * 외부 지도 라이브러리를 쓰지 않아 번들이 늘지 않고, 위에 게임 레이어를 자유롭게 얹을 수 있다.
 */
export default function SchoolMap({
  schools,
  onSelect,
  focus,
}: {
  schools: MapSchool[];
  onSelect: (school: MapSchool) => void;
  focus?: { lat: number; lng: number; zoom: number };
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({
    lat: focus?.lat ?? 33.46,   // 제주 애월 근처를 기본 시야로
    lng: focus?.lng ?? 126.33,
    zoom: focus?.zoom ?? 11,
  });
  const [hovered, setHovered] = useState<string | null>(null);

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

  /** 화면 좌표 → 타일 좌표 */
  const project = useCallback(
    (lat: number, lng: number) => ({
      x: size.w / 2 + (lngToX(lng, z) - centerX) * scale,
      y: size.h / 2 + (latToY(lat, z) - centerY) * scale,
    }),
    [size.w, size.h, z, scale, centerX, centerY]
  );

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
    // 마커(버튼) 위에서 시작한 눌림은 지도를 끌지 않는다.
    // 다만 moved 는 여기서 반드시 초기화해야 한다 — 아래 early return 뒤에 두면
    // 지도를 한 번 끈 뒤로 moved 가 true 로 남아 마커 클릭이 영영 무시된다.
    moved.current = false;
    if ((e.target as HTMLElement).closest('button')) return;
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
            // 지도를 배경으로 눕히고 그 위 게임 레이어가 도드라지게 한다
            filter: 'saturate(0.75) brightness(1.06)',
          }}
        />
      ))}

      {/* 학교 마커 */}
      {size.w > 0 &&
        schools.map((s) => {
          const p = project(s.lat, s.lng);
          if (p.x < -120 || p.x > size.w + 120 || p.y < -160 || p.y > size.h + 120) return null;
          const isHot = hovered === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { if (!moved.current) onSelect(s); }}
              onPointerEnter={() => setHovered(s.id)}
              onPointerLeave={() => setHovered(null)}
              className="absolute flex flex-col items-center"
              style={{
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -100%) scale(${isHot ? 1.08 : 1})`,
                transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
                zIndex: isHot ? 20 : 10,
              }}
            >
              {/* 말풍선 카드 */}
              <div
                className="rounded-2xl px-3 py-2 flex items-center gap-2"
                style={{
                  background: '#FFF8E7',
                  border: '3px solid #EFE3CB',
                  boxShadow: isHot
                    ? '0 6px 0 #E3D5B8, 0 14px 26px rgba(0,0,0,0.32)'
                    : '0 4px 0 #E3D5B8, 0 8px 16px rgba(0,0,0,0.22)',
                  minWidth: 132,
                }}
              >
                <div
                  className="h-9 w-9 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ background: '#8FD98A' }}
                >
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg">🏫</span>
                  )}
                </div>
                <div className="text-left min-w-0">
                  <div className="text-[12px] font-black truncate" style={{ color: '#6B5B43' }}>
                    {s.name}
                  </div>
                  <div className="text-[9px]" style={{ color: '#A89880' }}>
                    {s.classCount > 0 ? `${s.classCount}개 반 전시 중` : '준비 중'}
                  </div>
                </div>
              </div>
              {/* 핀 꼬리 */}
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
        className="absolute bottom-1 right-1 z-30 rounded px-1.5 py-0.5 text-[9px]"
        style={{ background: 'rgba(255,255,255,0.75)', color: '#5B5B5B' }}
      >
        © OpenStreetMap contributors
      </div>
    </div>
  );
}
