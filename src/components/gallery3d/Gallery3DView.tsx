'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { wallSlots } from '@/lib/exhibit-layout';
import { WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls, type Obstacle, type AvatarCustom, type AvatarTint } from './walker';

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
  /** 액자에 거는 작은 판. 없으면 원본을 쓴다(옛 작품) */
  thumbnailUrl?: string;
  type: 'flat' | 'sculpture';
  /** 영상 작품이면 유튜브 번호. 액자에 ▶ 를 얹는 데 쓴다. */
  videoId?: string | null;
}

interface ExhibitRoomProps {
  artworks: ArtworkData[];
  onArtworkClick: (artwork: ArtworkData) => void;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  /** 전시실에서 교실로 돌아가기 */
  onExit?: () => void;
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
    if (!url) { setTexture(null); return; }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (tex) => {
        if (!alive) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      },
      undefined,
      () => { if (alive) setTexture(null); }
    );
    return () => { alive = false; };
  }, [url]);

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      {/*
        key 가 반드시 있어야 한다.
        예전에는 텍스처 유무로 <mesh> 를 각각 그렸는데, React 가 같은 자리의 mesh 를
        재사용하는 바람에 **이미 만들어진 재질에 나중에 map 이 붙었다.**
        three.js 는 그때 셰이더를 다시 컴파일하지 않아서 액자가 새까맣게 나온다.
        (CORS 를 고치기 전에는 텍스처가 아예 안 와서 베이지 판이 보였고,
         고치고 나니 이번엔 검은 판이 됐다 — 원인이 이것이었다)
        key 를 바꿔 텍스처가 도착한 시점에 재질을 새로 만들게 한다.
      */}
      <meshStandardMaterial
        key={texture ? 'with-map' : 'placeholder'}
        map={texture ?? undefined}
        color={texture ? '#FFFFFF' : '#E8D5C4'}
      />
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
        {/* 액자는 썸네일로 건다. 원본은 눌러서 상세를 볼 때만 받는다 —
            액자 12개를 원본으로 채우면 방 하나가 20MB를 넘는다 */}
        <ArtworkImage
          url={artwork.thumbnailUrl || artwork.imageUrl}
          width={frameW - 0.1}
          height={frameH - 0.1}
        />

        {/*
          영상 작품 표시.
          썸네일만 걸면 사진 작품과 구별이 안 돼서 아이가 눌러보기 전까지 모른다.
          액자 한가운데에 재생 단추를 얹어 **누르기 전에** 알려준다.
        */}
        {artwork.videoId && (
          <group position={[0, 0, 0.03]}>
            <mesh>
              <circleGeometry args={[Math.min(frameW, frameH) * 0.17, 24]} />
              <meshBasicMaterial color="#1A1A1A" transparent opacity={0.72} />
            </mesh>
            {/* 삼각형 — 원의 첫 꼭짓점이 +X 라 그대로 두면 오른쪽을 본다(우리가 원하는 방향) */}
            <mesh position={[Math.min(frameW, frameH) * 0.02, 0, 0.001]}>
              <circleGeometry args={[Math.min(frameW, frameH) * 0.085, 3]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
          </group>
        )}
      </group>

      {/*
        가까이 가면 이름표가 뜬다.

        예전에는 액자 **위에도** 노란 '!' 를 띄웠는데, 바로 아래 이름표가 이미
        '눌러서 감상하기' 라고 말하고 있어서 **같은 말을 두 번** 하는 것이었다.
        게다가 액자 중심에서 0.5 위에 떠 있어 액자와 떨어져 보였다 — 무엇을
        가리키는 표시인지 알 수 없는 표시는 없느니만 못하다.
      */}
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

export default function ExhibitRoom({ artworks, onArtworkClick, avatarId, avatarCustom, avatarTint, onExit }: ExhibitRoomProps) {
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

  /**
   * 벽 자리 만들기 — 계산은 `src/lib/exhibit-layout.ts` 가 한다.
   *
   * 한 반은 30명까지 잡아야 하는데, 전에는 두 줄에 20자리뿐이라 30명이면
   * 열 점이 아무 말 없이 안 걸렸다. 지금은 한 줄 16 · 두 줄 32 자리다.
   */
  const slots = wallSlots(flatArtworks.length);

  // 자리보다 작품이 많으면 뒤쪽은 걸지 않는다. 겹쳐 거는 것보다 낫다.
  const wallPlacements: WallPlacement[] = flatArtworks
    .slice(0, slots.length)
    .map((artwork, i) => ({ artwork, pos: slots[i].pos, rot: slots[i].rot }));


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

        {/* 나가는 문 — 상단 메뉴 말고 공간 안에서 돌아갈 수 있어야 게임처럼 읽힌다 */}
        {onExit && (
          <group position={[0, 0, 7.9]} rotation={[0, PI, 0]}>
            <mesh position={[0, 1.15, 0]}>
              <boxGeometry args={[1.9, 2.3, 0.12]} />
              <meshStandardMaterial color="#5A3E28" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.15, 0.07]}>
              <planeGeometry args={[1.6, 2.05]} />
              <meshStandardMaterial color="#7A5638" roughness={0.85} />
            </mesh>
            <mesh position={[0.55, 1.1, 0.12]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshStandardMaterial color="#E8C86B" metalness={0.6} roughness={0.3} />
            </mesh>
            <Html position={[0, 2.75, 0.1]} transform occlude="blending" scale={0.34} zIndexRange={[10, 0]}>
              <button
                onClick={onExit}
                style={{
                  background: '#FFF8E7', border: '4px solid #EFE3CB', borderRadius: '999px',
                  padding: '12px 28px', fontWeight: 800, fontSize: '26px', color: '#6B5B43',
                  fontFamily: 'Pretendard, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 5px 0 #E3D5B8, 0 10px 20px rgba(0,0,0,0.28)',
                }}
              >
                🚪 교실로 돌아가기
              </button>
            </Html>
          </group>
        )}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -7, xMax: 7, zMin: -7, zMax: 7 }}
          start={[0, 0, 5]}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
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
