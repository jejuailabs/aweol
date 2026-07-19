'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

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
}

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

// --------------- 키 입력 상태 (e.code 기반 — 한글 자판 상태에서도 WASD 동작) ---------------
const keyState: Record<string, boolean> = {};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    keyState[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keyState[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(keyState).forEach((k) => { keyState[k] = false; }); });
}

// --------------- 카메라 회전 상태 (마우스/터치 드래그) ---------------
const camControl = { yaw: 0 };

// --------------- 조이스틱 상태 (모바일) ---------------
let joystickDir = { x: 0, z: 0 };
export function setJoystickDir(x: number, z: number) {
  joystickDir = { x, z };
}

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
    const dist = avatarPos.current.distanceTo(new THREE.Vector3(...position));
    setNear(dist < 3.5);
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
    const dist = avatarPos.current.distanceTo(new THREE.Vector3(...position));
    setNear(dist < 3.5);
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

// --------------- 발밑 먼지 파티클 (동숲식 걸음 연출) ---------------
const dustPool: { pos: THREE.Vector3; life: number }[] = Array.from({ length: 10 }, () => ({
  pos: new THREE.Vector3(0, -10, 0),
  life: 0,
}));
let dustSpawnTimer = 0;
let avatarIsMoving = false;

function DustPuffs() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((_, delta) => {
    dustPool.forEach((p, i) => {
      const m = meshRefs.current[i];
      if (!m) return;
      if (p.life > 0) {
        p.life = Math.max(0, p.life - delta * 2.2);
        m.position.set(p.pos.x, p.pos.y + (1 - p.life) * 0.25, p.pos.z);
        const s = 0.55 + (1 - p.life) * 0.7;
        m.scale.set(s, s, s);
        (m.material as THREE.MeshBasicMaterial).opacity = p.life * 0.4;
        m.visible = true;
      } else {
        m.visible = false;
      }
    });
  });

  return (
    <group>
      {dustPool.map((_, i) => (
        <mesh
          key={`dust-${i}`}
          ref={(el) => { meshRefs.current[i] = el; }}
          visible={false}
        >
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshBasicMaterial color="#EADFC8" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// --------------- 아바타 캐릭터 (동숲식 모멘텀 걷기) ---------------
function WalkingAvatar({ avatarPos }: { avatarPos: React.MutableRefObject<THREE.Vector3> }) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const bobPhase = useRef(0);
  const vel = useRef({ x: 0, z: 0 });
  const maxSpeed = 4.2;
  const accel = 16;   // 출발 가속 (동숲처럼 살짝 미끄러지듯)
  const decel = 11;   // 정지 감속
  const roomBound = 7;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    let dx = 0;
    let dz = 0;
    if (keyState['KeyW'] || keyState['ArrowUp']) dz = -1;
    if (keyState['KeyS'] || keyState['ArrowDown']) dz = 1;
    if (keyState['KeyA'] || keyState['ArrowLeft']) dx = -1;
    if (keyState['KeyD'] || keyState['ArrowRight']) dx = 1;

    dx += joystickDir.x;
    dz += joystickDir.z;

    const inputLen = Math.sqrt(dx * dx + dz * dz);
    let tx = 0;
    let tz = 0;
    if (inputLen > 0.1) {
      const inv = Math.pow(inputLen, -1);
      // 카메라 방향 기준 이동 (드래그로 회전한 시점에 맞춰 W = 앞으로)
      const yaw = camControl.yaw;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const ndx = dx * inv;
      const ndz = dz * inv;
      tx = (ndx * cosY + ndz * sinY) * maxSpeed;
      tz = (-ndx * sinY + ndz * cosY) * maxSpeed;
    }

    // 모멘텀: 목표 속도로 부드럽게 가속/감속
    const rate = inputLen > 0.1 ? accel : decel;
    vel.current.x += (tx - vel.current.x) * Math.min(1, rate * delta);
    vel.current.z += (tz - vel.current.z) * Math.min(1, rate * delta);

    const speedNow = Math.sqrt(vel.current.x * vel.current.x + vel.current.z * vel.current.z);
    const moving = speedNow > 0.35;
    avatarIsMoving = moving;

    const newX = groupRef.current.position.x + vel.current.x * delta;
    const newZ = groupRef.current.position.z + vel.current.z * delta;
    groupRef.current.position.x = Math.max(-roomBound, Math.min(roomBound, newX));
    groupRef.current.position.z = Math.max(-roomBound, Math.min(roomBound, newZ));

    if (moving) {
      const targetAngle = Math.atan2(vel.current.x, vel.current.z);
      const currentAngle = groupRef.current.rotation.y;
      let diff = targetAngle - currentAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      groupRef.current.rotation.y += diff * 10 * delta;

      bobPhase.current += delta * (8 + speedNow * 2);

      // 발밑 먼지 스폰
      dustSpawnTimer -= delta;
      if (dustSpawnTimer <= 0) {
        dustSpawnTimer = 0.16;
        const slot = dustPool.find((p) => p.life <= 0);
        if (slot) {
          slot.pos.set(
            groupRef.current.position.x + (Math.sin(bobPhase.current) * 0.08),
            0.06,
            groupRef.current.position.z + 0.12
          );
          slot.life = 1;
        }
      }
    }

    // 스쿼시 & 스트레치: 걸을 때 통통 튀는 느낌
    const bob = moving ? Math.abs(Math.sin(bobPhase.current)) : 0;
    const squash = 1 - bob * 0.07;
    const stretch = 1 + bob * 0.05;
    groupRef.current.scale.set(squash, stretch, squash);
    groupRef.current.position.y = bob * 0.09;

    if (bodyRef.current) {
      bodyRef.current.position.y = 0.55;
    }

    avatarPos.current.copy(groupRef.current.position);
    avatarPos.current.y = 0;
  });

  return (
    <group ref={groupRef} position={[0, 0, 5]}>
      {/* 몸통 */}
      <mesh ref={bodyRef} position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.35, 8, 16]} />
        <meshStandardMaterial color="#4ECDC4" />
      </mesh>
      {/* 머리 */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#FFE0BD" />
      </mesh>
      {/* 머리카락 */}
      <mesh position={[0, 1.18, -0.02]}>
        <sphereGeometry args={[0.19, 16, 16, 0, Math.PI * 2, 0, HALF_PI]} />
        <meshStandardMaterial color="#5B3A29" />
      </mesh>
      {/* 눈 */}
      <mesh position={[-0.07, 1.08, 0.16]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#2B2B2B" />
      </mesh>
      <mesh position={[0.07, 1.08, 0.16]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#2B2B2B" />
      </mesh>
      {/* 볼 블러셔 */}
      <mesh position={[-0.12, 1.02, 0.14]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#FFB6C1" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0.12, 1.02, 0.14]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#FFB6C1" transparent opacity={0.5} />
      </mesh>
      {/* 바닥 그림자 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

// --------------- 카메라 팔로우 (입장 연출 포함) ---------------
function CameraFollower({ avatarPos }: { avatarPos: React.MutableRefObject<THREE.Vector3> }) {
  const { camera } = useThree();
  const lookOffset = useMemo(() => new THREE.Vector3(0, 1.2, 0), []);
  const introT = useRef(0);
  const introFrom = useMemo(() => new THREE.Vector3(0, 4.2, 14.5), []);
  const introLookFrom = useMemo(() => new THREE.Vector3(0, 2.2, -6), []);

  useFrame((_, delta) => {
    const yaw = camControl.yaw;
    const dist = 6;
    const followPos = avatarPos.current.clone().add(
      new THREE.Vector3(Math.sin(yaw) * dist, 3.5, Math.cos(yaw) * dist)
    );
    const followLook = avatarPos.current.clone().add(lookOffset);

    if (introT.current < 1) {
      introT.current = Math.min(1, introT.current + delta * 0.45);
      const t = introT.current;
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(introFrom, followPos, ease);
      const look = introLookFrom.clone().lerp(followLook, ease);
      camera.lookAt(look);
      return;
    }

    camera.position.lerp(followPos, 4 * delta);
    camera.lookAt(followLook);
  });

  return null;
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
      <ambientLight intensity={0.35} color="#FFF8E7" />
      <directionalLight position={[5, 8, 5]} intensity={0.25} color="#FFFAF0" castShadow />
      <pointLight position={[0, 4.5, 0]} intensity={0.4} color="#FFF5E6" distance={20} />
      <pointLight position={[-6, 4, -6]} intensity={0.2} color="#FFF5E6" distance={12} />
      <pointLight position={[6, 4, -6]} intensity={0.2} color="#FFF5E6" distance={12} />
    </>
  );
}

// --------------- 데모 작품 ---------------
const DEMO_ARTWORKS: ArtworkData[] = [
  { id: '1', title: '봄날의 꽃밭', artistName: '김하늘', imageUrl: '', type: 'flat' },
  { id: '2', title: '우리집 강아지', artistName: '이서준', imageUrl: '', type: 'flat' },
  { id: '3', title: '바다 풍경', artistName: '박지우', imageUrl: '', type: 'flat' },
  { id: '4', title: '나의 보물상자', artistName: '최민서', imageUrl: '', type: 'sculpture' },
  { id: '5', title: '가을 단풍', artistName: '정서윤', imageUrl: '', type: 'flat' },
  { id: '6', title: '꿈속의 세계', artistName: '윤도현', imageUrl: '', type: 'flat' },
  { id: '7', title: '무지개 마을', artistName: '한소율', imageUrl: '', type: 'flat' },
  { id: '8', title: '우주 탐험', artistName: '강예린', imageUrl: '', type: 'flat' },
  { id: '9', title: '엄마 아빠', artistName: '오시우', imageUrl: '', type: 'flat' },
  { id: '10', title: '나비 정원', artistName: '신지호', imageUrl: '', type: 'sculpture' },
];

export default function ExhibitRoom({ artworks, onArtworkClick }: ExhibitRoomProps) {
  const displayArtworks = artworks.length > 0 ? artworks : DEMO_ARTWORKS;
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

  // 마우스/터치 드래그로 카메라 좌우 회전
  useEffect(() => {
    camControl.yaw = 0;
    const el = containerRef.current;
    if (!el) return;
    let dragging = false;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      // 조이스틱/버튼 위에서는 드래그 시작 안 함
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = e.clientX - lastX;
      lastX = e.clientX;
      camControl.yaw -= delta * 0.0065;
    };
    const onUp = () => { dragging = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const flatArtworks = displayArtworks.filter((a) => a.type === 'flat');
  const sculptureArtworks = displayArtworks.filter((a) => a.type === 'sculpture');

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
    <div ref={containerRef} id="exhibit-container" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 3.5, 11], fov: 55, near: 0.1, far: 100 }}
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

        <WalkingAvatar avatarPos={avatarPos} />
        <DustPuffs />
        <CameraFollower avatarPos={avatarPos} />
      </Canvas>
    </div>
  );
}
