'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  TEX_W, TEX_H, paintBoard, drawStroke, drawText, bounds, applyTransform,
  type PaintItem,
} from '@/lib/blackboard-paint';

/**
 * 칠판 편집 모달.
 *
 * 예전에는 3D 칠판에 직접 그렸다. 화면이 조금만 돌아가도 선이 엉뚱한 데 그어지고,
 * 쓰다 말고 확정할 방법도 없었다. 그래서 흐름을 둘로 나눴다.
 *   1) 그리기·쓰기 — 큰 2D 미리보기 위에서 정확하게
 *   2) 배치 — 방금 만든 걸 끌어서 옮기고 크기를 맞춘 뒤 확정
 * 확정할 때 이름이 함께 기록된다.
 */

const CHALK_COLORS = ['#FFFFFF', '#FFE86B', '#FF9EAF', '#8FE3FF', '#8FD98A'];

type Tool = 'pen' | 'eraser' | 'text';
type Phase = 'edit' | 'place';

export interface ComposerResult {
  strokes: { points: number[][]; color: string; width: number }[];
  text: { point: number[]; content: string; color: string; width: number } | null;
}

export default function BlackboardComposer({
  items,
  authorName,
  onCommit,
  onClose,
}: {
  items: PaintItem[];
  authorName: string;
  onCommit: (result: ComposerResult) => Promise<void> | void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(CHALK_COLORS[0]);
  const [penWidth, setPenWidth] = useState(5);
  const [phase, setPhase] = useState<Phase>('edit');
  const [saving, setSaving] = useState(false);

  // 그린 것 (칠판 정규화 좌표)
  const [draft, setDraft] = useState<number[][][]>([]);
  const strokeRef = useRef<number[][]>([]);
  const drawingRef = useRef(false);

  // 쓴 것
  const [textValue, setTextValue] = useState('');
  const [textSize, setTextSize] = useState(9);

  // 배치
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const hasDraft = tool === 'text' ? textValue.trim().length > 0 : draft.length > 0;

  // ---------- 그리기 ----------
  const toLocal = (e: React.PointerEvent) => {
    const el = canvasRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const repaint = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const w = el.width;
    const h = el.height;

    paintBoard(ctx, items, w, h);

    // 지금 만들고 있는 것 (배치 중이면 옮겨진 위치로)
    const b = bounds(draft);
    const moved = phase === 'place' ? applyTransform(draft, b.cx, b.cy, dx, dy, scale) : draft;
    moved.forEach((s) => drawStroke(ctx, s, tool === 'eraser' ? '#2E5844' : color, penWidth, w, h));
    if (strokeRef.current.length > 0 && phase === 'edit') {
      drawStroke(ctx, strokeRef.current, tool === 'eraser' ? '#2E5844' : color, penWidth, w, h);
    }

    if (tool === 'text' && textValue.trim()) {
      drawText(
        ctx,
        {
          kind: 'text',
          points: [[0.06 + dx, 0.5 + dy]],
          color,
          width: textSize * scale,
          text: textValue.trim(),
          authorName,
        },
        w,
        h,
        false
      );
    }
  }, [items, draft, phase, dx, dy, scale, color, penWidth, tool, textValue, textSize, authorName]);

  useEffect(() => { repaint(); }, [repaint]);

  // 캔버스 실제 해상도를 컨테이너에 맞춘다 (선명하게)
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

  const onDown = (e: React.PointerEvent) => {
    const p = toLocal(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (phase === 'place') {
      dragRef.current = { x: p[0], y: p[1], dx, dy };
      return;
    }
    if (tool === 'text') return;
    drawingRef.current = true;
    strokeRef.current = [p];
    repaint();
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toLocal(e);
    if (!p) return;

    if (phase === 'place' && dragRef.current) {
      setDx(dragRef.current.dx + (p[0] - dragRef.current.x));
      setDy(dragRef.current.dy + (p[1] - dragRef.current.y));
      return;
    }
    if (!drawingRef.current) return;
    strokeRef.current.push(p);
    repaint();
  };

  const onUp = () => {
    if (phase === 'place') { dragRef.current = null; return; }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (strokeRef.current.length > 0) {
      setDraft((prev) => [...prev, strokeRef.current]);
      strokeRef.current = [];
    }
  };

  // ---------- 확정 ----------
  const commit = useCallback(async () => {
    setSaving(true);
    try {
      if (tool === 'text') {
        await onCommit({
          strokes: [],
          text: {
            point: [0.06 + dx, 0.5 + dy],
            content: textValue.trim(),
            color,
            width: Math.round(textSize * scale),
          },
        });
      } else {
        const b = bounds(draft);
        const moved = applyTransform(draft, b.cx, b.cy, dx, dy, scale);
        await onCommit({
          strokes: moved.map((points) => ({
            points,
            color: tool === 'eraser' ? '#2E5844' : color,
            width: Math.round(penWidth * scale),
          })),
          text: null,
        });
      }
      // 다음 낙서를 이어서 할 수 있게 초기화
      setDraft([]);
      setTextValue('');
      setDx(0); setDy(0); setScale(1);
      setPhase('edit');
    } finally {
      setSaving(false);
    }
  }, [tool, draft, dx, dy, scale, color, penWidth, textValue, textSize, onCommit]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-3 py-4"
      style={{ background: 'rgba(24,20,16,0.6)' }}
    >
      <div
        className="w-full max-w-[940px] rounded-3xl p-4 max-h-[94vh] overflow-y-auto"
        style={{ background: '#FAF5EA' }}
      >
        {/* 머리말 */}
        {/*
          휴대폰에서 세 덩이가 다 줄바꿈돼서 '칠판에 남 / 기기', '종 / 료' 가 됐다.
          제목과 종료는 절대 안 줄이고(shrink-0 + nowrap), 가운데 안내만 줄인다.
          좁으면 안내는 아예 감춘다 — 없어도 되는 말이다.
        */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="text-sm font-black shrink-0 whitespace-nowrap"
            style={{ color: '#3A3226' }}
          >
            ✏️ 칠판에 남기기
          </div>
          <div
            className="hidden sm:block text-[13px] min-w-0 truncate"
            style={{ color: '#A89880' }}
          >
            {authorName} 이름으로 기록돼요
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] font-bold"
            style={{ background: 'rgba(232,96,76,0.14)', color: '#E8604C' }}
          >
            종료
          </button>
        </div>

        {/* 도구 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {([
            { k: 'pen' as Tool, label: '✏️ 그리기' },
            { k: 'eraser' as Tool, label: '🧽 지우개' },
            { k: 'text' as Tool, label: '🔤 글씨' },
          ]).map((t) => (
            <button
              key={t.k}
              onClick={() => { setTool(t.k); setPhase('edit'); setDx(0); setDy(0); setScale(1); }}
              disabled={phase === 'place'}
              className="rounded-xl px-3 py-2 text-[14px] font-bold disabled:opacity-40"
              style={{
                background: tool === t.k ? 'var(--color-primary)' : 'white',
                color: tool === t.k ? 'white' : '#8A7A5F',
              }}
            >
              {t.label}
            </button>
          ))}

          <div className="flex items-center gap-1 ml-1">
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

          {tool !== 'text' && (
            <label className="flex items-center gap-1.5 text-[13px] ml-1" style={{ color: '#8A7A5F' }}>
              굵기
              <input
                type="range" min={2} max={16} value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                className="w-20"
              />
            </label>
          )}
        </div>

        {/* 글씨 입력 */}
        {tool === 'text' && phase === 'edit' && (
          <div className="flex gap-1.5 mb-2">
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value.slice(0, 60))}
              placeholder="칠판에 쓸 내용 (최대 60자)"
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'white', color: '#3A3226' }}
            />
            <label className="flex items-center gap-1.5 text-[13px] shrink-0" style={{ color: '#8A7A5F' }}>
              크기
              <input
                type="range" min={5} max={20} value={textSize}
                onChange={(e) => setTextSize(Number(e.target.value))}
                className="w-20"
              />
            </label>
          </div>
        )}

        {/* 칠판 미리보기 */}
        <div ref={wrapRef} className="rounded-2xl overflow-hidden mb-2" style={{ background: '#2E5844' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block w-full"
            style={{
              touchAction: 'none',
              cursor: phase === 'place' ? 'move' : tool === 'text' ? 'default' : 'crosshair',
            }}
          />
        </div>

        {/* 안내 + 버튼 */}
        {phase === 'edit' ? (
          <>
            <div className="text-[13px] mb-2" style={{ color: '#A89880' }}>
              {tool === 'text'
                ? '내용을 적고 [붙이기]를 누르면 칠판 위에서 위치를 옮길 수 있어요'
                : '칠판 위에 그린 뒤 [붙이기]를 누르면 위치와 크기를 맞출 수 있어요'}
            </div>
            <div className="flex gap-2">
              {tool !== 'text' && draft.length > 0 && (
                <button
                  onClick={() => setDraft((p) => p.slice(0, -1))}
                  className="rounded-xl px-4 py-2.5 text-[15px] font-bold"
                  style={{ background: 'white', color: '#8A7A5F' }}
                >
                  ↩︎ 한 획 취소
                </button>
              )}
              <button
                onClick={() => setPhase('place')}
                disabled={!hasDraft}
                className="flex-1 rounded-xl py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                붙이기
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] mb-2" style={{ color: '#A89880' }}>
              끌어서 옮기고, 아래에서 크기를 맞춘 뒤 [칠판에 올리기]를 누르세요
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
            <div className="flex gap-2">
              <button
                onClick={() => { setPhase('edit'); setDx(0); setDy(0); setScale(1); }}
                className="rounded-xl px-4 py-2.5 text-[15px] font-bold"
                style={{ background: 'white', color: '#8A7A5F' }}
              >
                ← 다시 그리기
              </button>
              <button
                onClick={commit}
                disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? '올리는 중...' : '칠판에 올리기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
