'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

// ================= 공용 조작 상태 =================

// 키 입력 (e.code 기반 — 한글 자판에서도 WASD 동작)
export const keyState: Record<string, boolean> = {};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    keyState[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keyState[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(keyState).forEach((k) => { keyState[k] = false; }); });
}

// 모바일 조이스틱
let joystickDir = { x: 0, z: 0 };
export function setJoystickDir(x: number, z: number) {
  joystickDir = { x, z };
}

// 카메라 상태 (드래그 회전 + 핀치/휠 줌)
export const camControl = { yaw: 0, dist: 6 };

export function resetControls(yaw: number, dist: number) {
  camControl.yaw = yaw;
  camControl.dist = dist;
  joystickDir = { x: 0, z: 0 };
}

/**
 * 컨테이너에 카메라 조작 연결:
 * - 한 손가락/마우스 드래그 → 좌우 회전 (360도)
 * - 두 손가락 핀치 → 줌 인/아웃
 * - 마우스 휠 → 줌
 */
export function attachCameraControls(
  el: HTMLElement,
  opts: { minDist: number; maxDist: number }
): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartCamDist = 0;

  const getPinchDist = () => {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchStartDist = getPinchDist();
      pinchStartCamDist = camControl.dist;
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId)!;
    const dx = e.clientX - prev.x;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      // 핀치 줌
      const d = getPinchDist();
      if (pinchStartDist > 10 && d > 10) {
        const scale = pinchStartDist * Math.pow(d, -1);
        camControl.dist = Math.max(opts.minDist, Math.min(opts.maxDist, pinchStartCamDist * scale));
      }
    } else {
      // 드래그 회전
      camControl.yaw -= dx * 0.0065;
    }
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    camControl.dist = Math.max(opts.minDist, Math.min(opts.maxDist, camControl.dist + dir * 0.6));
  };

  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel', onWheel);
  };
}

// ================= 발밑 먼지 파티클 =================

const dustPool: { pos: THREE.Vector3; life: number }[] = Array.from({ length: 10 }, () => ({
  pos: new THREE.Vector3(0, -10, 0),
  life: 0,
}));
let dustSpawnTimer = 0;

export function DustPuffs() {
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

// ================= 걸어다니는 아바타 (동숲 비율 + 모멘텀) =================

export interface WalkerBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export function WalkerAvatar({
  avatarPos,
  bounds,
  start,
  maxSpeed = 4.2,
  scale = 1,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  bounds: WalkerBounds;
  start: [number, number, number];
  maxSpeed?: number;
  scale?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const legLRef = useRef<THREE.Mesh>(null);
  const legRRef = useRef<THREE.Mesh>(null);
  const bobPhase = useRef(0);
  const vel = useRef({ x: 0, z: 0 });
  const accel = 16;
  const decel = 11;

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
      const yaw = camControl.yaw;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const ndx = dx * inv;
      const ndz = dz * inv;
      tx = (ndx * cosY + ndz * sinY) * maxSpeed;
      tz = (-ndx * sinY + ndz * cosY) * maxSpeed;
    }

    const rate = inputLen > 0.1 ? accel : decel;
    vel.current.x += (tx - vel.current.x) * Math.min(1, rate * delta);
    vel.current.z += (tz - vel.current.z) * Math.min(1, rate * delta);

    const speedNow = Math.sqrt(vel.current.x * vel.current.x + vel.current.z * vel.current.z);
    const moving = speedNow > 0.35;

    const newX = groupRef.current.position.x + vel.current.x * delta;
    const newZ = groupRef.current.position.z + vel.current.z * delta;
    groupRef.current.position.x = Math.max(bounds.xMin, Math.min(bounds.xMax, newX));
    groupRef.current.position.z = Math.max(bounds.zMin, Math.min(bounds.zMax, newZ));

    if (moving) {
      const targetAngle = Math.atan2(vel.current.x, vel.current.z);
      const currentAngle = groupRef.current.rotation.y;
      let diff = targetAngle - currentAngle;
      while (diff > PI) diff -= PI * 2;
      while (diff < -PI) diff += PI * 2;
      groupRef.current.rotation.y += diff * 10 * delta;

      bobPhase.current += delta * (8 + speedNow * 2);

      dustSpawnTimer -= delta;
      if (dustSpawnTimer <= 0) {
        dustSpawnTimer = 0.16;
        const slot = dustPool.find((p) => p.life <= 0);
        if (slot) {
          slot.pos.set(
            groupRef.current.position.x + Math.sin(bobPhase.current) * 0.08,
            0.06,
            groupRef.current.position.z + 0.12
          );
          slot.life = 1;
        }
      }
    }

    const bob = moving ? Math.abs(Math.sin(bobPhase.current)) : 0;
    const squash = 1 - bob * 0.07;
    const stretch = 1 + bob * 0.05;
    groupRef.current.scale.set(squash * scale, stretch * scale, squash * scale);
    groupRef.current.position.y = bob * 0.09 * scale;

    const swing = moving ? Math.sin(bobPhase.current) * 0.65 : 0;
    if (armLRef.current) armLRef.current.rotation.x = swing;
    if (armRRef.current) armRRef.current.rotation.x = -swing;
    if (legLRef.current) legLRef.current.rotation.x = -swing * 0.8;
    if (legRRef.current) legRRef.current.rotation.x = swing * 0.8;

    avatarPos.current.copy(groupRef.current.position);
    avatarPos.current.y = 0;
  });

  return (
    <group ref={groupRef} position={start}>
      {/* 다리 */}
      <mesh ref={legLRef} position={[-0.09, 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.14, 6, 10]} />
        <meshStandardMaterial color="#3D6BB3" />
      </mesh>
      <mesh ref={legRRef} position={[0.09, 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.14, 6, 10]} />
        <meshStandardMaterial color="#3D6BB3" />
      </mesh>
      {/* 신발 */}
      <mesh position={[-0.09, 0.05, 0.03]}>
        <sphereGeometry args={[0.075, 10, 10]} />
        <meshStandardMaterial color="#7A4A2B" roughness={0.6} />
      </mesh>
      <mesh position={[0.09, 0.05, 0.03]}>
        <sphereGeometry args={[0.075, 10, 10]} />
        <meshStandardMaterial color="#7A4A2B" roughness={0.6} />
      </mesh>

      {/* 몸통 — 마리오 레드 셔츠 */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.22, 0.42, 14]} />
        <meshStandardMaterial color="#E8493C" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.5, 0.185]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#FFD93D" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.38, 0.205]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#FFD93D" metalness={0.2} roughness={0.4} />
      </mesh>

      {/* 팔 */}
      <group ref={armLRef} position={[-0.24, 0.62, 0]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.16, 6, 10]} />
          <meshStandardMaterial color="#E8493C" roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color="#FFDDB8" />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.24, 0.62, 0]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.16, 6, 10]} />
          <meshStandardMaterial color="#E8493C" roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color="#FFDDB8" />
        </mesh>
      </group>

      {/* 머리 */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.3, 20, 20]} />
        <meshStandardMaterial color="#FFDDB8" />
      </mesh>
      <mesh position={[0, 1.2, -0.02]}>
        <sphereGeometry args={[0.29, 20, 20, 0, PI * 2, 0, HALF_PI * 1.1]} />
        <meshStandardMaterial color="#6B4226" roughness={0.85} />
      </mesh>
      <mesh position={[-0.26, 1.05, 0]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshStandardMaterial color="#6B4226" roughness={0.85} />
      </mesh>
      <mesh position={[0.26, 1.05, 0]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshStandardMaterial color="#6B4226" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.28, 0.2]} rotation={[0.5, 0, 0]}>
        <coneGeometry args={[0.06, 0.12, 8]} />
        <meshStandardMaterial color="#6B4226" roughness={0.85} />
      </mesh>

      {/* 눈 + 하이라이트 */}
      <mesh position={[-0.1, 1.04, 0.25]} scale={[1, 1.5, 0.5]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#2B2016" />
      </mesh>
      <mesh position={[0.1, 1.04, 0.25]} scale={[1, 1.5, 0.5]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#2B2016" />
      </mesh>
      <mesh position={[-0.085, 1.08, 0.29]}>
        <sphereGeometry args={[0.016, 6, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0.115, 1.08, 0.29]}>
        <sphereGeometry args={[0.016, 6, 6]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>

      {/* 코/입/볼 */}
      <mesh position={[0, 0.97, 0.29]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshStandardMaterial color="#FFC89E" />
      </mesh>
      <mesh position={[0, 0.9, 0.27]} rotation={[0.35, 0, 0]} scale={[1.5, 0.7, 0.5]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshStandardMaterial color="#C0392B" />
      </mesh>
      <mesh position={[-0.18, 0.95, 0.21]} scale={[1.3, 0.9, 0.5]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#FF9EAF" transparent opacity={0.65} />
      </mesh>
      <mesh position={[0.18, 0.95, 0.21]} scale={[1.3, 0.9, 0.5]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#FF9EAF" transparent opacity={0.65} />
      </mesh>

      {/* 별 장식 */}
      <mesh position={[0.18, 1.32, 0.12]} rotation={[0.3, 0.4, 0.3]}>
        <octahedronGeometry args={[0.05, 0]} />
        <meshStandardMaterial color="#FFD93D" emissive="#FFD93D" emissiveIntensity={0.35} />
      </mesh>

      {/* 바닥 그림자 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.32, 18]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.14} />
      </mesh>
    </group>
  );
}

// ================= 3인칭 팔로우 카메라 =================

export function FollowCamera({
  avatarPos,
  height = 3.5,
  lookHeight = 1.2,
  introFrom,
  introLook,
  clamp,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  height?: number;
  lookHeight?: number;
  introFrom?: [number, number, number];
  introLook?: [number, number, number];
  clamp?: WalkerBounds & { yMin: number; yMax: number };
}) {
  const { camera } = useThree();
  const introT = useRef(introFrom ? 0 : 1);
  const introFromV = useRef(introFrom ? new THREE.Vector3(...introFrom) : new THREE.Vector3());
  const introLookV = useRef(introLook ? new THREE.Vector3(...introLook) : new THREE.Vector3());

  useFrame((_, delta) => {
    const yaw = camControl.yaw;
    const dist = camControl.dist;
    // 줌아웃할수록 카메라가 조금 더 높아지는 자연스러운 3인칭 궤도
    const camY = height * (0.4 + dist * 0.1);
    const followPos = avatarPos.current.clone().add(
      new THREE.Vector3(Math.sin(yaw) * dist, camY, Math.cos(yaw) * dist)
    );
    // 카메라가 방 밖(벽 뒤)으로 나가지 않게 클램프
    if (clamp) {
      followPos.x = Math.max(clamp.xMin, Math.min(clamp.xMax, followPos.x));
      followPos.z = Math.max(clamp.zMin, Math.min(clamp.zMax, followPos.z));
      followPos.y = Math.max(clamp.yMin, Math.min(clamp.yMax, followPos.y));
    }
    const followLook = avatarPos.current.clone().add(new THREE.Vector3(0, lookHeight, 0));

    if (introT.current < 1) {
      introT.current = Math.min(1, introT.current + delta * 0.45);
      const t = introT.current;
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(introFromV.current, followPos, ease);
      const look = introLookV.current.clone().lerp(followLook, ease);
      camera.lookAt(look);
      return;
    }

    camera.position.lerp(followPos, 4.5 * delta);
    camera.lookAt(followLook);
  });

  return null;
}
