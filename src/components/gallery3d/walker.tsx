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
// pitch: 시선 높이 각도(라디안). 양수면 위에서 내려다보고, 음수면 아래에서 올려다본다.
export const camControl = { yaw: 0, dist: 6, pitch: 0.34 };

const PITCH_MIN = -0.5; // 올려다보기 (하늘·무지개가 보이는 각도)
const PITCH_MAX = 1.15; // 내려다보기 (거의 위에서 보는 각도)

export function resetControls(yaw: number, dist: number, pitch = 0.34) {
  camControl.yaw = yaw;
  camControl.dist = dist;
  camControl.pitch = pitch;
  joystickDir = { x: 0, z: 0 };
}

/**
 * 컨테이너에 카메라 조작 연결:
 * - 한 손가락/마우스 드래그 → 좌우 360도 회전 + 상하 시점(피치)
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
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      // 핀치 줌
      const d = getPinchDist();
      if (pinchStartDist > 10 && d > 10) {
        const scale = pinchStartDist * Math.pow(d, -1);
        camControl.dist = Math.max(opts.minDist, Math.min(opts.maxDist, pinchStartCamDist * scale));
      }
    } else {
      // 드래그: 좌우 = 회전, 위아래 = 시점 각도
      // 위로 끌면 올려다보도록(피치 감소) 방향을 맞춘다
      camControl.yaw -= dx * 0.0065;
      camControl.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camControl.pitch + dy * 0.005));
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

// ================= 아바타 외형 프리셋 (avatar-select의 8종과 1:1 대응) =================

type HairStyle = 'short' | 'long' | 'none';
type HatKind = 'none' | 'beret' | 'cap' | 'ribbon' | 'antenna';
type EarKind = 'none' | 'cat' | 'dog';
type HandItem = 'none' | 'brush' | 'palette' | 'magnifier';

interface AvatarLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
  shoe: string;
  hat: HatKind;
  hatColor: string;
  ears: EarKind;
  earColor: string;
  item: HandItem;
  cheek: boolean;
  muzzle: boolean;
}

const BASE_LOOK: AvatarLook = {
  skin: '#FFDDB8',
  hair: '#6B4226',
  hairStyle: 'short',
  shirt: '#E8493C',
  pants: '#3D6BB3',
  shoe: '#7A4A2B',
  hat: 'none',
  hatColor: '#E8493C',
  ears: 'none',
  earColor: '#F0C48A',
  item: 'none',
  cheek: true,
  muzzle: false,
};

export const AVATAR_LOOKS: Record<string, AvatarLook> = {
  // 교복 소년 — 기본형
  avatar_01: { ...BASE_LOOK },
  // 교복 소녀 — 긴 머리 + 리본
  avatar_02: { ...BASE_LOOK, hairStyle: 'long', hair: '#4A2C18', shirt: '#F06AA0', pants: '#7B4B94', hat: 'ribbon', hatColor: '#FF6B81' },
  // 화가 소년 — 베레모 + 붓
  avatar_03: { ...BASE_LOOK, shirt: '#4FA8E8', pants: '#2E5B8A', hat: 'beret', hatColor: '#E8493C', item: 'brush' },
  // 화가 소녀 — 긴 머리 + 팔레트
  avatar_04: { ...BASE_LOOK, hairStyle: 'long', hair: '#8A5A2B', shirt: '#FFD93D', pants: '#3BAF9F', item: 'palette', hat: 'ribbon', hatColor: '#8FD98A' },
  // 탐험가 — 야구모자 + 돋보기
  avatar_05: { ...BASE_LOOK, hair: '#3A2A1A', shirt: '#8FD98A', pants: '#6B5B43', hat: 'cap', hatColor: '#E8A33C', item: 'magnifier' },
  // 로봇 친구 — 금속 피부 + 안테나, 머리카락 없음
  avatar_06: { ...BASE_LOOK, skin: '#C7D2DC', hair: '#8FA0B0', hairStyle: 'none', shirt: '#7B8794', pants: '#5A6570', shoe: '#4A535C', hat: 'antenna', hatColor: '#FF6B81', cheek: false },
  // 고양이 — 고양이 귀 + 주둥이
  avatar_07: { ...BASE_LOOK, skin: '#F5C77E', hair: '#E0A94F', hairStyle: 'none', shirt: '#FFD93D', pants: '#E8A33C', ears: 'cat', earColor: '#F5C77E', muzzle: true },
  // 강아지 — 처진 귀 + 주둥이
  avatar_08: { ...BASE_LOOK, skin: '#F0DCC0', hair: '#C89A6B', hairStyle: 'none', shirt: '#4FA8E8', pants: '#8A6A4A', ears: 'dog', earColor: '#C89A6B', muzzle: true },
};

export function getAvatarLook(avatarId?: string | null): AvatarLook {
  return (avatarId && AVATAR_LOOKS[avatarId]) || AVATAR_LOOKS.avatar_01;
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
  avatarId,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  bounds: WalkerBounds;
  start: [number, number, number];
  maxSpeed?: number;
  scale?: number;
  avatarId?: string | null;
}) {
  const look = getAvatarLook(avatarId);
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
        <meshStandardMaterial color={look.pants} />
      </mesh>
      <mesh ref={legRRef} position={[0.09, 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.055, 0.14, 6, 10]} />
        <meshStandardMaterial color={look.pants} />
      </mesh>
      {/* 신발 */}
      <mesh position={[-0.09, 0.05, 0.03]}>
        <sphereGeometry args={[0.075, 10, 10]} />
        <meshStandardMaterial color={look.shoe} roughness={0.6} />
      </mesh>
      <mesh position={[0.09, 0.05, 0.03]}>
        <sphereGeometry args={[0.075, 10, 10]} />
        <meshStandardMaterial color={look.shoe} roughness={0.6} />
      </mesh>

      {/* 몸통 */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.22, 0.42, 14]} />
        <meshStandardMaterial color={look.shirt} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.5, 0.185]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#FFD93D" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.38, 0.205]}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshStandardMaterial color="#FFD93D" metalness={0.2} roughness={0.4} />
      </mesh>

      {/* 팔 (왼쪽) */}
      <group ref={armLRef} position={[-0.24, 0.62, 0]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.16, 6, 10]} />
          <meshStandardMaterial color={look.shirt} roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>
        {/* 왼손 소지품 — 팔레트 */}
        {look.item === 'palette' && (
          <group position={[-0.02, -0.3, 0.06]} rotation={[HALF_PI * 0.8, 0, 0.3]}>
            <mesh>
              <cylinderGeometry args={[0.13, 0.13, 0.018, 16]} />
              <meshStandardMaterial color="#D9A066" />
            </mesh>
            {[['#E8493C', -0.05, 0.05], ['#4FA8E8', 0.05, 0.05], ['#FFD93D', -0.05, -0.04], ['#8FD98A', 0.05, -0.04]].map(
              ([c, px, pz], i) => (
                <mesh key={i} position={[px as number, 0.014, pz as number]}>
                  <cylinderGeometry args={[0.028, 0.028, 0.008, 10]} />
                  <meshStandardMaterial color={c as string} />
                </mesh>
              )
            )}
          </group>
        )}
      </group>

      {/* 팔 (오른쪽) */}
      <group ref={armRRef} position={[0.24, 0.62, 0]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.16, 6, 10]} />
          <meshStandardMaterial color={look.shirt} roughness={0.65} />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>
        {/* 오른손 소지품 — 붓 */}
        {look.item === 'brush' && (
          <group position={[0.02, -0.32, 0.05]} rotation={[0, 0, -0.35]}>
            <mesh position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.26, 8]} />
              <meshStandardMaterial color="#C9954F" />
            </mesh>
            <mesh position={[0, -0.07, 0]}>
              <coneGeometry args={[0.032, 0.09, 8]} />
              <meshStandardMaterial color="#E8493C" />
            </mesh>
          </group>
        )}
        {/* 오른손 소지품 — 돋보기 */}
        {look.item === 'magnifier' && (
          <group position={[0.02, -0.32, 0.06]} rotation={[0, 0, -0.3]}>
            <mesh position={[0, 0.06, 0]}>
              <cylinderGeometry args={[0.014, 0.014, 0.16, 8]} />
              <meshStandardMaterial color="#7A4A2B" />
            </mesh>
            <mesh position={[0, -0.06, 0]} rotation={[HALF_PI, 0, 0]}>
              <torusGeometry args={[0.075, 0.016, 8, 20]} />
              <meshStandardMaterial color="#C0C6CC" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.06, 0]} rotation={[HALF_PI, 0, 0]}>
              <circleGeometry args={[0.07, 20]} />
              <meshStandardMaterial color="#BFE6F5" transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* 머리 */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.3, 20, 20]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>

      {/* 머리카락 */}
      {look.hairStyle !== 'none' && (
        <>
          <mesh position={[0, 1.2, -0.02]}>
            <sphereGeometry args={[0.29, 20, 20, 0, PI * 2, 0, HALF_PI * 1.1]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
          <mesh position={[-0.26, 1.05, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
          <mesh position={[0.26, 1.05, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.28, 0.2]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.06, 0.12, 8]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
        </>
      )}
      {/* 긴 머리 — 뒤로 늘어뜨린 볼륨 */}
      {look.hairStyle === 'long' && (
        <>
          <mesh position={[0, 0.9, -0.2]} scale={[1, 1.35, 0.75]}>
            <sphereGeometry args={[0.24, 14, 14]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
          <mesh position={[-0.24, 0.82, -0.1]} scale={[0.7, 1.5, 0.7]}>
            <sphereGeometry args={[0.12, 10, 10]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
          <mesh position={[0.24, 0.82, -0.1]} scale={[0.7, 1.5, 0.7]}>
            <sphereGeometry args={[0.12, 10, 10]} />
            <meshStandardMaterial color={look.hair} roughness={0.85} />
          </mesh>
        </>
      )}

      {/* 모자 / 머리 장식 */}
      {look.hat === 'beret' && (
        <group position={[0, 1.3, -0.02]} rotation={[0, 0, 0.18]}>
          <mesh scale={[1, 0.45, 1]}>
            <sphereGeometry args={[0.27, 16, 16]} />
            <meshStandardMaterial color={look.hatColor} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color={look.hatColor} roughness={0.8} />
          </mesh>
        </group>
      )}
      {look.hat === 'cap' && (
        <group position={[0, 1.24, 0]}>
          <mesh scale={[1, 0.62, 1]}>
            <sphereGeometry args={[0.3, 16, 16, 0, PI * 2, 0, HALF_PI]} />
            <meshStandardMaterial color={look.hatColor} roughness={0.75} />
          </mesh>
          {/* 챙 */}
          <mesh position={[0, -0.01, 0.24]} rotation={[NEG_HALF_PI * 0.92, 0, 0]}>
            <circleGeometry args={[0.19, 16, 0, PI]} />
            <meshStandardMaterial color={look.hatColor} roughness={0.75} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {look.hat === 'ribbon' && (
        <group position={[0.2, 1.26, 0.06]} rotation={[0, 0, -0.3]}>
          <mesh position={[-0.05, 0, 0]} scale={[1, 0.7, 0.5]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshStandardMaterial color={look.hatColor} />
          </mesh>
          <mesh position={[0.05, 0, 0]} scale={[1, 0.7, 0.5]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshStandardMaterial color={look.hatColor} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.032, 8, 8]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        </group>
      )}
      {look.hat === 'antenna' && (
        <group position={[0, 1.3, 0]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
            <meshStandardMaterial color="#8FA0B0" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color={look.hatColor} emissive={look.hatColor} emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}

      {/* 동물 귀 */}
      {look.ears === 'cat' && (
        <>
          {[-0.16, 0.16].map((x) => (
            <group key={`ear-${x}`} position={[x, 1.26, 0]} rotation={[0, 0, x < 0 ? 0.25 : -0.25]}>
              <mesh>
                <coneGeometry args={[0.09, 0.18, 4]} />
                <meshStandardMaterial color={look.earColor} roughness={0.85} />
              </mesh>
              <mesh position={[0, -0.01, 0.03]} scale={[0.6, 0.6, 0.6]}>
                <coneGeometry args={[0.09, 0.18, 4]} />
                <meshStandardMaterial color="#FF9EAF" roughness={0.85} />
              </mesh>
            </group>
          ))}
        </>
      )}
      {look.ears === 'dog' && (
        <>
          {[-0.26, 0.26].map((x) => (
            <mesh
              key={`dear-${x}`}
              position={[x, 1.1, 0]}
              rotation={[0, 0, x < 0 ? 0.35 : -0.35]}
              scale={[0.65, 1.5, 0.6]}
            >
              <sphereGeometry args={[0.1, 10, 10]} />
              <meshStandardMaterial color={look.earColor} roughness={0.9} />
            </mesh>
          ))}
        </>
      )}

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

      {/* 동물 주둥이 */}
      {look.muzzle && (
        <mesh position={[0, 0.93, 0.26]} scale={[1.5, 1, 0.9]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#FFF3E0" />
        </mesh>
      )}

      {/* 코 */}
      <mesh position={[0, look.muzzle ? 0.96 : 0.97, look.muzzle ? 0.35 : 0.29]}>
        <sphereGeometry args={[look.muzzle ? 0.04 : 0.035, 10, 10]} />
        <meshStandardMaterial color={look.muzzle ? '#4A3A2A' : '#FFC89E'} />
      </mesh>

      {/* 입 */}
      <mesh
        position={[0, look.muzzle ? 0.89 : 0.9, look.muzzle ? 0.33 : 0.27]}
        rotation={[0.35, 0, 0]}
        scale={[1.5, 0.7, 0.5]}
      >
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshStandardMaterial color="#C0392B" />
      </mesh>

      {/* 볼터치 */}
      {look.cheek && (
        <>
          <mesh position={[-0.18, 0.95, 0.21]} scale={[1.3, 0.9, 0.5]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#FF9EAF" transparent opacity={0.65} />
          </mesh>
          <mesh position={[0.18, 0.95, 0.21]} scale={[1.3, 0.9, 0.5]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#FF9EAF" transparent opacity={0.65} />
          </mesh>
        </>
      )}

      {/* 별 장식 (모자·귀가 없을 때만) */}
      {look.hat === 'none' && look.ears === 'none' && (
        <mesh position={[0.18, 1.32, 0.12]} rotation={[0.3, 0.4, 0.3]}>
          <octahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial color="#FFD93D" emissive="#FFD93D" emissiveIntensity={0.35} />
        </mesh>
      )}

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
  lookHeight = 1.2,
  introFrom,
  introLook,
  clamp,
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
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
    const pitch = camControl.pitch;

    // 시선점을 중심으로 한 구면 궤도.
    // pitch가 음수면 카메라가 시선점보다 낮아져 하늘(무지개 등)을 올려다보게 된다.
    const horiz = dist * Math.cos(pitch);
    const vert = dist * Math.sin(pitch);
    const followLook = avatarPos.current.clone().add(new THREE.Vector3(0, lookHeight, 0));
    const followPos = new THREE.Vector3(
      followLook.x + Math.sin(yaw) * horiz,
      followLook.y + vert,
      followLook.z + Math.cos(yaw) * horiz
    );

    // 카메라가 바닥을 뚫고 내려가지 않게
    followPos.y = Math.max(0.45, followPos.y);

    // 실내에서는 벽 밖으로 나가지 않게 클램프
    if (clamp) {
      followPos.x = Math.max(clamp.xMin, Math.min(clamp.xMax, followPos.x));
      followPos.z = Math.max(clamp.zMin, Math.min(clamp.zMax, followPos.z));
      followPos.y = Math.max(clamp.yMin, Math.min(clamp.yMax, followPos.y));
    }

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
