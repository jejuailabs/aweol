'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

const W = 900;
const H = 640;
const COLORS = ['#2B2016', '#E8493C', '#4A90D9', '#3BAF9F', '#E8A33C'];

/** 손글씨·그림 숙제용 간단 캔버스. 그릴 때마다 PNG Blob을 부모에 넘긴다. */
export default function DrawingPad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [erasing, setErasing] = useState(false);
  const [dirty, setDirty] = useState(false);

  const clearTo = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (ctx) clearTo(ctx);
  }, [clearTo]);

  const emit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((b) => onChange(b), 'image/png');
  }, [onChange]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    setDirty(true);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.strokeStyle = erasing ? '#FFFFFF' : color;
    ctx.lineWidth = erasing ? width * 5 : width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    emit();
  };

  const clearAll = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    clearTo(ctx);
    setDirty(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { setColor(c); setErasing(false); }}
            className="h-6 w-6 rounded-full"
            style={{
              background: c,
              border: color === c && !erasing ? '3px solid #7A6A52' : '2px solid rgba(0,0,0,0.15)',
              transform: color === c && !erasing ? 'scale(1.15)' : 'scale(1)',
            }}
            aria-label={`색 ${c}`}
          />
        ))}
        <span className="mx-0.5 opacity-30">|</span>
        {[3, 6, 12].map((w) => (
          <button
            key={w}
            onClick={() => setWidth(w)}
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: width === w ? '#4A90D9' : '#F1EADB' }}
          >
            <span
              className="rounded-full"
              style={{ width: w, height: w, background: width === w ? 'white' : '#8A7A5F' }}
            />
          </button>
        ))}
        <button
          onClick={() => setErasing((v) => !v)}
          className="rounded-full px-2.5 py-1 text-[12px] font-bold"
          style={{ background: erasing ? '#4A90D9' : '#F1EADB', color: erasing ? 'white' : '#8A7A5F' }}
        >
          🧽 지우개
        </button>
        <button
          onClick={clearAll}
          className="rounded-full px-2.5 py-1 text-[12px] font-bold"
          style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
        >
          전체 지우기
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="w-full rounded-xl"
        style={{ background: 'white', border: '2px solid #E0D6C2', touchAction: 'none', aspectRatio: `${W} / ${H}` }}
      />
      {!dirty && (
        <div className="text-[12px] mt-1 text-center" style={{ color: '#A89880' }}>
          손가락이나 마우스로 그려보세요
        </div>
      )}
    </div>
  );
}
