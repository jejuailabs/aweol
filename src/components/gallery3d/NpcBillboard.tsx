'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * NPC 빌보드 — 생성 이미지를 판때기에 세우고 Y축으로만 카메라를 따라 돌린다.
 *
 * 진짜 3D 모델이 아니라 그림 한 장이다(Don't Starve 방식). NPC 는 서서
 * 말을 거는 존재라 옆·뒤 모습이 없어도 어색하지 않고, 대신 그림 품질은
 * 절차 모델이 못 따라온다. 이미지는 `app-assets/`(webp 20~40KB, 전 학교 공용).
 *
 * 통째로 lookAt 하면 언덕·부감에서 뒤로 눕는다 — **Y축만** 돌린다.
 */
export default function NpcBillboard({
  url, x, z, h = 2.1, onClick,
}: {
  url: string;
  x: number;
  z: number;
  /** 키(m). 폭은 이미지 비율대로 맞춘다. */
  h?: number;
  onClick?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [ar, setAr] = useState(0.5);

  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) { t.dispose(); return; }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      setAr(t.image.width / t.image.height);
      setTex(t);
    });
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  /** 부모 그룹 안에 놓여도 맞게 — 로컬이 아니라 **월드 좌표**로 바라본다 */
  const world = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(world.current);
    g.rotation.y = Math.atan2(camera.position.x - world.current.x, camera.position.z - world.current.z);
  });

  if (!tex) return null;

  return (
    <group position={[x, 0, z]}>
      <group ref={group}>
        <mesh
          position={[0, h / 2, 0]}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
          onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
          onPointerOut={onClick ? () => { document.body.style.cursor = 'auto'; } : undefined}
        >
          <planeGeometry args={[h * ar, h]} />
          <meshBasicMaterial map={tex} transparent alphaTest={0.35} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      {/* 그림자 원판 — 판때기 그림자는 종잇장이라 발밑에 깔아준다 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[h * 0.2, 18]} />
        <meshBasicMaterial color="#2E2850" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}
