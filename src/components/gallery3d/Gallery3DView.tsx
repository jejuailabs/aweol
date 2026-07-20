'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls, type Obstacle, type AvatarCustom } from './walker';

// 벤치 2개 + 코너 화분 4개 (Room의 배치와 같은 값)
const ROOM_OBSTACLES: Obstacle[] = [
  ...[-2.5, 2.5].map((x) => ({ x, z: 2.5, halfW: 0.85, halfD: 0.3 })),
  ...([[-7, -7], [7, -7], [-7, 6.5], [7, 6.5]] as [number, number][]).map(([x, z]) => ({
    x, z, halfW: 0.4, halfD: 0.4,
  })),
];

export { setJoystickDir } from './walker';

interface ArtworkData {
  id: string;
  title: string;
  artistName: string;
  imageUrl: string;
  type: 'flat' | 'sculpture';
}

interface ExhibitRoomProps {
  artworks: ArtworkData[];
  onArtworkClick: (artwork: ArtworkData) => void;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
}

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/** 이 거리 안으로 들어오면 작품명·작가명 이름표가 뜬다 (바닥 기준 거리) */
const LABEL_DISTANCE = 5;

// --------------- 벽면 (개선된 질감) ---------------
function Room() {
  const wallColor = '#FFF8F0';
  const floorColor = '#C9956B';
  const ceilingColor = '#FFFDF8';
  const accentColor = '#E8D5C0';
  const roomW = 16;
  const roomH = 5;
  const roomD = 16;
  const halfW = roomW * 0.5;
  const halfH = roomH * 0.5;
  const halfD = roomD * 0.5;

  return (
    <group>
      {/* 바닥 — 나무 느낌 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color={floorColor} roughness={0.7} />
      </mesh>
      {/* 바닥 격자 (나무판 느낌) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`fl-${i}`} rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.005, -halfD + i * 2 + 1]}>
          <planeGeometry args={[roomW, 0.03]} />
          <meshStandardMaterial color="#B8844A" />
        </mesh>
      ))}

      {/* 천장 */}
      <mesh rotation={[HALF_PI, 0, 0]} position={[0, roomH, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color={ceilingColor} />
      </mesh>

      {/* 뒷벽 */}
      <mesh position={[0, halfH, -halfD]} receiveShadow>
        <planeGeometry args={[roomW, roomH]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      {/* 뒷벽 하단 장식 */}
      <mesh position={[0, 0.4, -halfD + 0.01]}>
        <planeGeometry args={[roomW, 0.8]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* 왼쪽 벽 */}
      <mesh position={[-halfW, halfH, 0]} rotation={[0, HALF_PI, 0]} receiveShadow>
        <planeGeometry args={[roomD, roomH]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[-halfW + 0.01, 0.4, 0]} rotation={[0, HALF_PI, 0]}>
        <planeGeometry args={[roomD, 0.8]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* 오른쪽 벽 */}
      <mesh position={[halfW, halfH, 0]} rotation={[0, NEG_HALF_PI, 0]} receiveShadow>
        <planeGeometry args={[roomD, roomH]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[halfW - 0.01, 0.4, 0]} rotation={[0, NEG_HALF_PI, 0]}>
        <planeGeometry args={[roomD, 0.8]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>

      {/* 앞벽 양쪽 (입구) */}
      <mesh position={[-5, halfH, halfD]}>
        <planeGeometry args={[6, roomH]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[5, halfH, halfD]}>
        <planeGeometry args={[6, roomH]} />
        <meshStandardMaterial color={wallColor} side={THREE.DoubleSide} />
      </mesh>

      {/* 천장 조명 레일 */}
      {[-4, 0, 4].map((x) => (
        <mesh key={`rail-${x}`} position={[x, roomH - 0.1, 0]}>
          <boxGeometry args={[0.08, 0.08, roomD - 2]} />
          <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}

      {/* 걸레받이 (3면) */}
      <mesh position={[0, 0.06, -halfD + 0.02]}>
        <boxGeometry args={[roomW, 0.12, 0.04]} />
        <meshStandardMaterial color="#8B6544" />
      </mesh>
      <mesh position={[-halfW + 0.02, 0.06, 0]} rotation={[0, HALF_PI, 0]}>
        <boxGeometry args={[roomD, 0.12, 0.04]} />
        <meshStandardMaterial color="#8B6544" />
      </mesh>
      <mesh position={[halfW - 0.02, 0.06, 0]} rotation={[0, NEG_HALF_PI, 0]}>
        <boxGeometry args={[roomD, 0.12, 0.04]} />
        <meshStandardMaterial color="#8B6544" />
      </mesh>

      {/* 천장 몰딩 (3면) */}
      <mesh position={[0, roomH - 0.08, -halfD + 0.03]}>
        <boxGeometry args={[roomW, 0.16, 0.06]} />
        <meshStandardMaterial color="#F0E4D4" />
      </mesh>
      <mesh position={[-halfW + 0.03, roomH - 0.08, 0]} rotation={[0, HALF_PI, 0]}>
        <boxGeometry args={[roomD, 0.16, 0.06]} />
        <meshStandardMaterial color="#F0E4D4" />
      </mesh>
      <mesh position={[halfW - 0.03, roomH - 0.08, 0]} rotation={[0, NEG_HALF_PI, 0]}>
        <boxGeometry args={[roomD, 0.16, 0.06]} />
        <meshStandardMaterial color="#F0E4D4" />
      </mesh>

      {/* 중앙 카펫 러너 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.01, 1]}>
        <planeGeometry args={[3.2, 11]} />
        <meshStandardMaterial color="#7B4B94" roughness={0.95} />
      </mesh>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.012, 1]}>
        <planeGeometry args={[2.8, 10.6]} />
        <meshStandardMaterial color="#9B6BB4" roughness={0.95} />
      </mesh>

      {/* 관람 벤치 2개 */}
      {[-2.5, 2.5].map((x) => (
        <group key={`bench-${x}`} position={[x, 0, 2.5]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[1.6, 0.08, 0.5]} />
            <meshStandardMaterial color="#A0714A" roughness={0.5} />
          </mesh>
          {[-0.65, 0.65].map((lx) => (
            <mesh key={`leg-${lx}`} position={[lx, 0.19, 0]}>
              <boxGeometry args={[0.08, 0.38, 0.42]} />
              <meshStandardMaterial color="#7A5230" />
            </mesh>
          ))}
        </group>
      ))}

      {/* 코너 화분 4개 */}
      {([[-7, -7], [7, -7], [-7, 6.5], [7, 6.5]] as [number, number][]).map(([px, pz]) => (
        <group key={`plant-${px}-${pz}`} position={[px, 0, pz]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.35, 0.6, 12]} />
            <meshStandardMaterial color="#C96A4A" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.42, 12, 12]} />
            <meshStandardMaterial color="#3E8E4D" roughness={0.9} />
          </mesh>
          <mesh position={[0.22, 1.15, 0.1]}>
            <sphereGeometry args={[0.26, 10, 10]} />
            <meshStandardMaterial color="#4FA85E" roughness={0.9} />
          </mesh>
          <mesh position={[-0.2, 1.1, -0.12]}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshStandardMaterial color="#357A42" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* 입구 안내판 */}
      <group position={[0, 0, 7.4]}>
        <mesh position={[0, 0.75, 0]} rotation={[-0.18, 0, 0]} castShadow>
          <boxGeometry args={[1.1, 1.3, 0.06]} />
          <meshStandardMaterial color="#5B4A3B" />
        </mesh>
        <mesh position={[0, 0.78, 0.035]} rotation={[-0.18, 0, 0]}>
          <planeGeometry args={[0.94, 1.1]} />
          <meshStandardMaterial color="#FFF8E7" />
        </mesh>
      </group>

      {/* 만국기 — 운동회 느낌의 천장 깃발 2줄 */}
      {([[-6, 6, -3], [6, -6, 3]] as [number, number, number][]).map(([x1, x2, zOff], li) => (
        <group key={`bunting-${li}`}>
          {Array.from({ length: 13 }).map((_, i) => {
            const t = i * (1 * 0.0833);
            const x = x1 + (x2 - x1) * t;
            const sag = Math.sin(t * PI) * 0.55;
            const y = roomH - 0.35 - sag;
            const z = zOff * (1 - t) + -zOff * t;
            const colors = ['#E8493C', '#FFD93D', '#4FA8E8', '#8FD98A', '#FF9EAF', '#C3A6FF'];
            return (
              <mesh
                key={`flag-${li}-${i}`}
                position={[x, y, z]}
                rotation={[PI, 0, 0]}
                scale={[1, 1, 0.2]}
              >
                <coneGeometry args={[0.15, 0.34, 3]} />
                <meshStandardMaterial color={colors[i % 6]} side={THREE.DoubleSide} roughness={0.8} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

// --------------- 작품 이미지 텍스처 ---------------
function ArtworkImage({ url, width, height }: { url: string; width: number; height: number }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) return;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      },
      undefined,
      () => setTexture(null)
    );
  }, [url]);

  if (!texture) {
    return (
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#E8D5C4" />
      </mesh>
    );
  }

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// --------------- 벽면 작품 ---------------
function WallArtwork({
  artwork,
  position,
  rotation,
  onClick,
  avatarPos,
}: {
  artwork: ArtworkData;
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick: () => void;
  avatarPos: React.MutableRefObject<THREE.Vector3>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [near, setNear] = useState(false);
  const frameW = 1.8;
  const frameH = 1.35;

  useFrame(() => {
    if (!groupRef.current) return;
    // 작품이 벽 위쪽(y=2.5)에 걸려 있으므로 높이차는 빼고 바닥 기준 거리로 판단한다
    const dx = avatarPos.current.x - position[0];
    const dz = avatarPos.current.z - position[2];
    setNear(Math.sqrt(dx * dx + dz * dz) < LABEL_DISTANCE);
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation ? rotation : [0, 0, 0]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* 액자 외곽 — 원목 */}
      <mesh onClick={onClick} castShadow>
        <boxGeometry args={[frameW + 0.24, frameH + 0.24, 0.09]} />
        <meshStandardMaterial color={hovered ? '#B8894F' : '#9C7040'} roughness={0.4} />
      </mesh>

      {/* 금테 몰딩 */}
      <mesh position={[0, 0, 0.046]}>
        <boxGeometry args={[frameW + 0.14, frameH + 0.14, 0.015]} />
        <meshStandardMaterial color="#D9B45B" metalness={0.65} roughness={0.3} />
      </mesh>

      {/* 내부 매트 */}
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[frameW + 0.06, frameH + 0.06]} />
        <meshStandardMaterial color="#FFFDF6" />
      </mesh>

      {/* 이름 명패 */}
      <mesh position={[0, -(frameH * 0.5) - 0.24, 0.02]}>
        <boxGeometry args={[0.72, 0.16, 0.02]} />
        <meshStandardMaterial color="#C8A860" metalness={0.5} roughness={0.35} />
      </mesh>

      {/* 작품 이미지 */}
      <group position={[0, 0, 0.07]} onClick={onClick}>
        <ArtworkImage url={artwork.imageUrl} width={frameW - 0.1} height={frameH - 0.1} />
      </group>

      {/* 근접 시 "!" 큐 + 동숲식 이름표 */}
      {near && (
        <Html position={[0, (frameH * 0.5) + 0.5, 0.15]} center zIndexRange={[30, 0]}>
          <div className="ac-alert">!</div>
        </Html>
      )}
      {near && (
        <Html position={[0, -(frameH * 0.5) - 0.45, 0.15]} center zIndexRange={[30, 0]}>
          <div className="ac-tag" onClick={onClick}>
            <div className="ac-tag-title">🖼️ {artwork.title}</div>
            <div className="ac-tag-sub">{artwork.artistName} · 눌러서 감상하기</div>
          </div>
        </Html>
      )}

      {/* 스포트라이트 */}
      <spotLight
        position={[0, 2, 1.5]}
        angle={0.5}
        penumbra={0.6}
        intensity={near ? 2.5 : 1.2}
        color="#FFF8E7"
        castShadow
      />

      {/* 근접 시 빛나는 테두리 */}
      {near && (
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[frameW + 0.35, frameH + 0.35, 0.02]} />
          <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.3} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// --------------- 조형물 작품 ---------------
function SculptureArtwork({
  artwork,
  position,
  onClick,
  avatarPos,
}: {
  artwork: ArtworkData;
  position: [number, number, number];
  onClick: () => void;
  avatarPos: React.MutableRefObject<THREE.Vector3>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [near, setNear] = useState(false);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
    const dx = avatarPos.current.x - position[0];
    const dz = avatarPos.current.z - position[2];
    setNear(Math.sqrt(dx * dx + dz * dz) < LABEL_DISTANCE);
  });

  return (
    <group position={position}>
      {/* 좌대 */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.9, 1, 0.9]} />
        <meshStandardMaterial color="#F5F5F5" roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[1, 0.04, 1]} />
        <meshStandardMaterial color="#E0E0E0" />
      </mesh>

      {/* 작품 (회전하는 다면체) */}
      <mesh ref={meshRef} position={[0, 1.6, 0]} onClick={onClick} castShadow>
        <dodecahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color="#DDA0DD" metalness={0.15} roughness={0.5} />
      </mesh>

      {near && (
        <Html position={[0, 2.35, 0]} center zIndexRange={[30, 0]}>
          <div className="ac-alert">!</div>
        </Html>
      )}
      {near && (
        <Html position={[0, -0.25, 0.7]} center zIndexRange={[30, 0]}>
          <div className="ac-tag" onClick={onClick}>
            <div className="ac-tag-title">🏺 {artwork.title}</div>
            <div className="ac-tag-sub">{artwork.artistName} · 눌러서 감상하기</div>
          </div>
        </Html>
      )}

      <spotLight position={[0, 3.5, 0]} angle={0.35} penumbra={0.4} intensity={near ? 3 : 1.5} color="#FFF8E7" castShadow />
    </group>
  );
}

// --------------- 캔버스 크기 보정 ---------------
function CanvasResizer({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { gl, camera, set, size: storeSize } = useThree();
  const fixedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const applySize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      gl.setPixelRatio(dpr);
      gl.setSize(w, h, false);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w * Math.pow(h, -1);
        camera.updateProjectionMatrix();
      }
      set({ size: { width: w, height: h, top: 0, left: 0 } });
      fixedRef.current = true;
    };

    requestAnimationFrame(() => {
      applySize();
      requestAnimationFrame(applySize);
    });

    const obs = new ResizeObserver(applySize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [gl, camera, set, containerRef]);

  useFrame(() => {
    if (fixedRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    gl.setPixelRatio(dpr);
    gl.setSize(w, h, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = w * Math.pow(h, -1);
      camera.updateProjectionMatrix();
    }
    fixedRef.current = true;
  });

  return null;
}

// --------------- 전시실 내부 조명 ---------------
function GalleryLighting() {
  return (
    <>
      <ambientLight intensity={0.85} color="#FFF8E7" />
      <directionalLight position={[5, 8, 5]} intensity={0.5} color="#FFFAF0" castShadow />
      <pointLight position={[0, 4.5, 0]} intensity={0.7} color="#FFF5E6" distance={24} />
      <pointLight position={[-6, 4, -6]} intensity={0.35} color="#FFF5E6" distance={14} />
      <pointLight position={[6, 4, -6]} intensity={0.35} color="#FFF5E6" distance={14} />
    </>
  );
}

export default function ExhibitRoom({ artworks, onArtworkClick, avatarId, avatarCustom }: ExhibitRoomProps) {
  // 실제 승인된 작품만 전시한다 (가짜 작품으로 벽을 채우지 않음)
  const displayArtworks = artworks;
  const avatarPos = useRef(new THREE.Vector3(0, 0, 5));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf: number;
    const fix = () => {
      const canvas = el.querySelector('canvas');
      if (!canvas) { raf = requestAnimationFrame(fix); return; }
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0 && canvas.width !== w * 2 && canvas.width !== w) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    };
    raf = requestAnimationFrame(fix);
    const timer = setTimeout(fix, 100);
    const timer2 = setTimeout(fix, 500);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(timer2); };
  }, []);

  // 드래그 회전 + 핀치/휠 줌
  useEffect(() => {
    resetControls(0, 6, 0.3);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 3.5, maxDist: 13 });
  }, []);

  const flatArtworks = displayArtworks.filter((a) => a.type === 'flat');
  const sculptureArtworks = displayArtworks.filter((a) => a.type === 'sculpture');

  // 조형물 좌대도 장애물 (아래 배치 계산과 같은 식을 쓴다)
  const sculptureOffset = (sculptureArtworks.length - 1) * 0.5;
  const obstacles: Obstacle[] = [
    ...ROOM_OBSTACLES,
    ...sculptureArtworks.map((_, i) => ({
      x: (i - sculptureOffset) * 3,
      z: -2,
      halfW: 0.55,
      halfD: 0.55,
    })),
  ];

  type WallPlacement = { artwork: ArtworkData; pos: [number, number, number]; rot: [number, number, number] };
  const wallPlacements: WallPlacement[] = [];

  flatArtworks.forEach((artwork, i) => {
    const y = 2.5;
    if (i < 4) {
      const x = -4.5 + i * 3;
      wallPlacements.push({ artwork, pos: [x, y, -7.95], rot: [0, 0, 0] });
    } else if (i < 7) {
      const z = -5 + (i - 4) * 4;
      wallPlacements.push({ artwork, pos: [-7.95, y, z], rot: [0, HALF_PI, 0] });
    } else {
      const z = -5 + (i - 7) * 4;
      wallPlacements.push({ artwork, pos: [7.95, y, z], rot: [0, NEG_HALF_PI, 0] });
    }
  });

  return (
    <div
      ref={containerRef}
      id="exhibit-container"
      className="scene-3d"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 3.5, 11], fov: 60, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#1a1a2e' }}
        tabIndex={0}
        onCreated={({ gl, camera }) => {
          const el = containerRef.current;
          if (el) {
            const w = el.clientWidth;
            const h = el.clientHeight;
            const dpr = Math.min(window.devicePixelRatio, 2);
            gl.setPixelRatio(dpr);
            gl.setSize(w, h, false);
            if (camera instanceof THREE.PerspectiveCamera) {
              camera.aspect = w * Math.pow(h, -1);
              camera.updateProjectionMatrix();
            }
          }
          gl.domElement.focus();
        }}
      >
        <CanvasResizer containerRef={containerRef} />
        <GalleryLighting />
        <Room />

        {wallPlacements.map(({ artwork, pos, rot }) => (
          <WallArtwork
            key={artwork.id}
            artwork={artwork}
            position={pos}
            rotation={rot}
            onClick={() => onArtworkClick(artwork)}
            avatarPos={avatarPos}
          />
        ))}

        {sculptureArtworks.map((artwork, i) => {
          const offset = (sculptureArtworks.length - 1) * 0.5;
          const xPos = (i - offset) * 3;
          return (
            <SculptureArtwork
              key={artwork.id}
              artwork={artwork}
              position={[xPos, 0, -2]}
              onClick={() => onArtworkClick(artwork)}
              avatarPos={avatarPos}
            />
          );
        })}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -7, xMax: 7, zMin: -7, zMax: 7 }}
          start={[0, 0, 5]}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          obstacles={obstacles}
        />
        <DustPuffs />
        <FollowCamera
          avatarPos={avatarPos}
          lookHeight={1.3}
          introFrom={[0, 4.2, 14.5]}
          introLook={[0, 2.2, -6]}
          clamp={{ xMin: -7.6, xMax: 7.6, zMin: -7.6, zMax: 7.6, yMin: 1.4, yMax: 4.6 }}
        />
      </Canvas>
    </div>
  );
}
