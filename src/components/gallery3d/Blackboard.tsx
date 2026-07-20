'use client';

import { useEffect, useMemo, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { TEX_W, TEX_H, BOARD_BG, paintBoard } from '@/lib/blackboard-paint';

export interface BoardItem {
  id: string;
  kind: 'stroke' | 'text';
  points: number[][];
  color: string;
  width: number;
  text?: string;
  authorName: string;
}

interface Props {
  classLabel: string;
  items: BoardItem[];
}

/**
 * 교실 칠판 — **보여주기만 한다.**
 *
 * 예전에는 이 3D 면 위에 직접 그렸는데, 카메라가 조금만 돌아가도 선이 엉뚱한 자리에
 * 그어지고 확정할 시점도 없었다. 지금은 편집을 BlackboardComposer(2D 모달)가 맡고,
 * 여기는 저장된 낙서를 텍스처로 올리기만 한다.
 */
export default function Blackboard({ classLabel, items }: Props) {
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

  // three.js 텍스처는 needsUpdate 를 직접 올려야 갱신된다 (원본과 같은 구조 유지)
  const paint = useCallback(() => {
    if (!canvas || !texture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintBoard(ctx, items, TEX_W, TEX_H);
    texture.needsUpdate = true;
  }, [canvas, texture, items]);

  useEffect(() => {
    paint();
  }, [paint]);

  return (
    <group position={[0, 2.15, -5.93]}>
      {/* 나무 프레임 */}
      <mesh castShadow>
        <boxGeometry args={[6.4, 2.15, 0.08]} />
        <meshStandardMaterial color="#A97B4F" roughness={0.5} />
      </mesh>

      {/* 칠판면 */}
      <mesh position={[0, 0.04, 0.045]}>
        <planeGeometry args={[6.05, 1.85]} />
        {/* key 없이 map 만 갈아끼우면 셰이더가 다시 컴파일되지 않아 까맣게 나온다
            (전시실 액자에서 실제로 겪은 문제) */}
        <meshStandardMaterial
          key={texture ? 'with-map' : 'plain'}
          map={texture ?? undefined}
          color={texture ? '#FFFFFF' : BOARD_BG}
          roughness={0.85}
        />
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
