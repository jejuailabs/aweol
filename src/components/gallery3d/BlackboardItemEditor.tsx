'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { playSound } from '@/lib/sound';
import {
  TEX_W, TEX_H, paintBoard, drawStroke, drawText, bounds, applyTransform,
} from '@/lib/blackboard-paint';
import type { BoardItem } from './Blackboard';

/**
 * 칠판에 이미 올라간 낙서 하나를 고치는 모달.
 *
 * 새로 그릴 때의 '배치' 단계(BlackboardComposer)와 같은 감각으로 —
 * 끌어서 옮기고, 크기를 조절하고, 글이면 내용도 바꾼다.
 * 저장은 서버(PATCH)가 확정한다 — 본인 것 또는 담임만 통과된다.
 */

const CHALK_COLORS = ['#FFFFFF', '#FFE86B', '#FF9EAF', '#8FE3FF', '#8FD98A'];

export default function BlackboardItemEditor({
  schoolId, classId, item, others, onDone, onClose,
}: {
  schoolId: string;
  classId: string;
  /** 고칠 낙서 */
  item: BoardItem;
  /** 나머지 낙서들 — 배경으로 그려서 어디에 놓을지 보인다 */
  others: BoardItem[];
  /** 저장이 끝났을 때 */
  onDone: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [scale, setScale] = useState(1);
  const [color, setColor] = useState(item.color);
  const [textValue, setTextValue] = useState(item.text ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const dragRef = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  /** 지금 상태를 적용한 좌표 */
  const movedPoints = useCallback(() => {
    if (item.kind === 'stroke') {
      const b = bounds([item.points]);
      return applyTransform([item.points], b.cx, b.cy, dx, dy, scale)[0];
    }
    const [x, y] = item.points[0] ?? [0.5, 0.5];
    return [[Math.min(1, Math.max(0, x + dx)), Math.min(1, Math.max(0, y + dy))]];
  }, [item, dx, dy, scale]);

  const repaint = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const w = el.width;
    const h = el.height;

    // 나머지는 그대로, 고치는 것만 옮겨진 자리에
    paintBoard(ctx, others, w, h);

    const moved = movedPoints();
    const width = item.width * scale;
    if (item.kind === 'stroke') {
      drawStroke(ctx, moved, color, width, w, h);
    } else {
      drawText(ctx, {
        kind: 'text', points: [moved[0]], color, width,
        text: (textValue.trim() || item.text || ''), authorName: item.authorName,
      }, w, h, false);
    }

    // 잡고 있는 것 표시 — 점선 상자
    const k = w / TEX_W;
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    if (item.kind === 'stroke') {
      moved.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
    } else {
      // 텍스트 상자는 픽셀로 바로 그린다
      const [x, y] = moved[0];
      const size = width * 7 * k;
      ctx.font = `bold ${size}px Pretendard, sans-serif`;
      const tw = ctx.measureText(textValue.trim() || item.text || '').width;
      ctx.strokeStyle = 'rgba(255,232,107,0.9)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(x * w - 6, y * h - size / 2 - 6, tw + 12, size + 12);
      ctx.setLineDash([]);
      return;
    }
    const pad = 8 + width * k * 0.5;
    ctx.strokeStyle = 'rgba(255,232,107,0.9)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(
      minX * w - pad, minY * h - pad,
      (maxX - minX) * w + pad * 2, (maxY - minY) * h + pad * 2
    );
    ctx.setLineDash([]);
  }, [others, movedPoints, item, scale, color, textValue]);

  useEffect(() => { repaint(); }, [repaint]);

  useEffect(() => {
    const el = canvasRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const resize = () => {
      const w = Math.min(wrap.clientWidth, 900);
      el.width = Math.round(w);
      el.height = Math.round((w * TEX_H) / TEX_W);
      repaint();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [repaint]);

  const toLocal = (e: React.PointerEvent) => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onDown = (e: React.PointerEvent) => {
    const p = toLocal(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: p[0], y: p[1], dx, dy };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toLocal(e);
    if (!p || !dragRef.current) return;
    setDx(dragRef.current.dx + (p[0] - dragRef.current.x));
    setDy(dragRef.current.dy + (p[1] - dragRef.current.y));
  };
  const onUp = () => { dragRef.current = null; };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const payload: Record<string, unknown> = {
        schoolId, classId, itemId: item.id,
        points: movedPoints(),
        width: Math.max(1, Math.min(40, Math.round(item.width * scale))),
        color,
      };
      if (item.kind === 'text') payload.text = textValue.trim();
      const res = await fetch('/api/blackboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || '고치지 못했어요.');
        return;
      }
      playSound('success');
      onDone();
      onClose();
    } catch {
      setErr('고치지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center px-3 py-4"
      style={{ background: 'rgba(24,20,16,0.6)' }}
    >
      <div
        className="w-full max-w-[940px] rounded-3xl p-4 max-h-[94vh] overflow-y-auto"
        style={{ background: '#FAF5EA' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-black shrink-0 whitespace-nowrap" style={{ color: '#3A3226' }}>
            🛠️ {item.kind === 'text' ? '글씨 고치기' : '낙서 고치기'}
          </div>
          <div className="hidden sm:block text-[13px] min-w-0 truncate" style={{ color: '#A89880' }}>
            끌어서 옮기고, 아래에서 크기를 맞춰요
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-bold"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#8A7A5F' }}
          >
            취소
          </button>
        </div>

        {/* 글이면 내용도 고칠 수 있다 */}
        {item.kind === 'text' && (
          <input
            value={textValue}
            onChange={(e) => setTextValue(e.target.value.slice(0, 60))}
            placeholder="칠판에 쓸 내용 (최대 60자)"
            className="w-full rounded-xl px-3 py-2.5 mb-2 text-sm outline-none"
            style={{ background: 'white', color: '#3A3226' }}
          />
        )}

        {/* 색 바꾸기 */}
        <div className="flex items-center gap-1 mb-2">
          {CHALK_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`색 ${c}`}
              className="h-7 w-7 rounded-full"
              style={{
                background: c,
                border: color === c ? '3px solid #7A6A52' : '2px solid rgba(0,0,0,0.15)',
                transform: color === c ? 'scale(1.12)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <div ref={wrapRef} className="rounded-2xl overflow-hidden mb-2" style={{ background: '#2E5844' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block w-full"
            style={{ touchAction: 'none', cursor: 'move' }}
          />
        </div>

        <label className="flex items-center gap-2 text-[14px] mb-2" style={{ color: '#8A7A5F' }}>
          크기
          <input
            type="range" min={0.3} max={2.5} step={0.05} value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right">{Math.round(scale * 100)}%</span>
        </label>

        {err && (
          <div className="rounded-xl px-3 py-2.5 mb-2 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>
            ⚠️ {err}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { setDx(0); setDy(0); setScale(1); setColor(item.color); setTextValue(item.text ?? ''); }}
            className="rounded-xl px-4 py-2.5 text-[15px] font-bold"
            style={{ background: 'white', color: '#8A7A5F' }}
          >
            ↩︎ 되돌리기
          </button>
          <button
            onClick={save}
            disabled={saving || (item.kind === 'text' && !textValue.trim())}
            className="flex-1 rounded-xl py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? '고치는 중...' : '이대로 고치기'}
          </button>
        </div>
      </div>
    </div>
  );
}
