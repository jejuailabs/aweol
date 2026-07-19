'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';

export interface BoardItem {
  id: string;
  kind: 'stroke' | 'text';
  points: number[][];
  color: string;
  width: number;
  text?: string;
  authorName: string;
}

const TEX_W = 1400;
const TEX_H = 430;
const BOARD_BG = '#2E5844';

interface Props {
  classLabel: string;
  items: BoardItem[];
  /** 낙서 가능 여부 (로그인 + 해당 반 소속이거나 교직원) */
  canDraw: boolean;
  drawMode: 'pen' | 'eraser' | 'text';
  color: string;
  penWidth: number;
  onCommitStroke: (points: number[][], color: string, width: number) => void;
  onRequestText: (point: number[]) => void;
}

export default function Blackboard({
  classLabel,
  items,
  canDraw,
  drawMode,
  color,
  penWidth,
  onCommitStroke,
  onRequestText,
}: Props) {
  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    return c;
  }, []);

  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  // 그리는 중인 획 (아직 서버에 안 보낸 것)
  const draftRef = useRef<number[][]>([]);
  const drawingRef = useRef(false);
  const [, forceRedraw] = useState(0);

  const paint = useCallback(() => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    // 분필 자국 느낌의 옅은 얼룩
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(0, (i * TEX_H) / 6 + 8, TEX_W, 2);
    }
    ctx.globalAlpha = 1;

    const drawStroke = (pts: number[][], c: string, w: number) => {
      if (pts.length === 0) return;
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * TEX_W, pts[0][1] * TEX_H);
      if (pts.length === 1) {
        ctx.lineTo(pts[0][0] * TEX_W + 0.1, pts[0][1] * TEX_H);
      } else {
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0] * TEX_W, pts[i][1] * TEX_H);
        }
      }
      ctx.stroke();
    };

    items.forEach((it) => {
      if (it.kind === 'stroke') {
        drawStroke(it.points, it.color, it.width);
      } else if (it.kind === 'text' && it.text) {
        const [nx, ny] = it.points[0] || [0.5, 0.5];
        const x = nx * TEX_W;
        const y = ny * TEX_H;
        ctx.fillStyle = it.color;
        ctx.font = `bold ${it.width * 7}px Pretendard, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(it.text, x, y);
        // 작성자를 글씨 옆에 작게 붙여 익명 글이 남지 않게 한다
        const w = ctx.measureText(it.text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `${it.width * 3.4}px Pretendard, sans-serif`;
        ctx.fillText(` ✏️${it.authorName}`, x + w, y + it.width * 3);
      }
    });

    // 그리는 중인 획을 즉시 보여준다 (서버 왕복을 기다리지 않음)
    if (draftRef.current.length > 0) {
      drawStroke(draftRef.current, drawMode === 'eraser' ? BOARD_BG : color, penWidth);
    }

    texture.needsUpdate = true;
  }, [canvas, texture, items, color, penWidth, drawMode]);

  useEffect(() => {
    paint();
  }, [paint]);

  const pushPoint = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    // uv는 좌하단 원점이므로 y를 뒤집어 캔버스 좌표계에 맞춘다
    draftRef.current.push([e.uv.x, 1 - e.uv.y]);
  };

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canDraw || !e.uv) return;
    e.stopPropagation();

    if (drawMode === 'text') {
      onRequestText([e.uv.x, 1 - e.uv.y]);
      return;
    }
    drawingRef.current = true;
    draftRef.current = [];
    pushPoint(e);
    paint();
  };

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drawingRef.current || !canDraw) return;
    e.stopPropagation();
    pushPoint(e);
    paint();
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = draftRef.current;
    draftRef.current = [];
    if (pts.length > 0) {
      onCommitStroke(pts, drawMode === 'eraser' ? BOARD_BG : color, penWidth);
    }
    forceRedraw((n) => n + 1);
  };

  // 칠판 밖에서 손을 떼도 획이 마무리되도록
  useEffect(() => {
    const onUp = () => finishStroke();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, color, penWidth]);

  return (
    <group position={[0, 2.15, -5.93]}>
      {/* 나무 프레임 */}
      <mesh castShadow>
        <boxGeometry args={[6.4, 2.15, 0.08]} />
        <meshStandardMaterial color="#A97B4F" roughness={0.5} />
      </mesh>

      {/* 칠판면 — 여기에 그린다 */}
      <mesh
        position={[0, 0.04, 0.045]}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={finishStroke}
      >
        <planeGeometry args={[6.05, 1.85]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.85} />
        ) : (
          <meshStandardMaterial color={BOARD_BG} roughness={0.85} />
        )}
      </mesh>

      {/* 분필 받침 */}
      <mesh position={[0, -1.12, 0.12]}>
        <boxGeometry args={[6.4, 0.07, 0.22]} />
        <meshStandardMaterial color="#8F6238" />
      </mesh>

      {/* 반 이름 팻말 (칠판 위) */}
      <Html position={[0, 1.32, 0]} transform scale={0.4} pointerEvents="none" zIndexRange={[5, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#7A6A52', fontWeight: 800, fontSize: '26px',
            padding: '8px 32px', borderRadius: '999px', fontFamily: 'Pretendard, sans-serif',
            border: '4px solid #EFE3CB', boxShadow: '0 5px 0 #E3D5B8',
            whiteSpace: 'nowrap', userSelect: 'none',
          }}
        >
          🏫 {classLabel} 교실
        </div>
      </Html>

      {/* 태극기 */}
      <mesh position={[3.6, 0.6, 0]}>
        <boxGeometry args={[0.75, 0.5, 0.03]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}
