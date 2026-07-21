'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const PI = Math.PI;
/** 앉았을 때 엉덩이 높이 — 교실 의자 상판(0.36)에 맞춘 값 */
const SIT_HEIGHT = 0.3;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

// ================= 공용 조작 상태 =================

// 키 입력 (e.code 기반 — 한글 자판에서도 WASD 동작)
export const keyState: Record<string, boolean> = {};

const clearKeys = () => { Object.keys(keyState).forEach((k) => { keyState[k] = false; }); };

/**
 * 글자를 입력하는 중인가.
 * 이게 없으면 댓글·퀴즈 답·칠판 글씨를 칠 때마다 'w','a','s','d' 가 이동으로 먹혀
 * 화면이 제멋대로 돌아간다.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * 이동 잠금. 칠판에 그리는 동안처럼 아바타가 움직이면 안 되는 순간에 건다.
 * (그리는 중에 화면이 돌아가면 선이 엉뚱한 데 그어진다)
 */
let movementLocked = false;
export function setMovementLock(locked: boolean) {
  movementLocked = locked;
  if (locked) { clearKeys(); joystickDir = { x: 0, z: 0 }; }
}
export const isMovementLocked = () => movementLocked;

/**
 * 앉은 자리. 의자를 누르면 여기에 좌표가 들어가고, 아바타가 그 자리로 미끄러져 앉는다.
 * 이동 잠금과 따로 두는 이유: 잠금은 '못 움직임'이고 앉기는 '안 움직임'이라,
 * 앉은 채로 방향키를 누르면 그냥 일어나서 걸어가야 자연스럽다.
 */
let seat: { x: number; z: number; yaw: number } | null = null;
/** 앉고 일어설 때 화면 쪽(버튼 표시)에 알려준다 */
let onSeatChange: ((seated: boolean) => void) | null = null;

export function sitAt(x: number, z: number, yaw: number) {
  seat = { x, z, yaw };
  clearKeys();
  joystickDir = { x: 0, z: 0 };
  onSeatChange?.(true);
}
export function standUp() {
  if (!seat) return;
  seat = null;
  onSeatChange?.(false);
}
export const isSitting = () => seat !== null;
export function watchSeat(cb: ((seated: boolean) => void) | null) {
  onSeatChange = cb;
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    keyState[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keyState[e.code] = false; });
  window.addEventListener('blur', clearKeys);
  // 입력창으로 포커스가 옮겨가면 누르고 있던 키가 눌린 채로 남는다
  window.addEventListener('focusin', (e) => { if (isTyping(e.target)) clearKeys(); });
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

  // 두 손가락 제스처가 브라우저의 페이지 확대·축소로 새는 것을 막는다.
  // (touch-action만으로는 iOS 사파리에서 부족해서 이벤트도 함께 막아야 한다)
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length >= 2) e.preventDefault();
  };
  const onGesture = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('gesturestart', onGesture as EventListener);
  el.addEventListener('gesturechange', onGesture as EventListener);
  el.addEventListener('gestureend', onGesture as EventListener);

  return () => {
    el.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('gesturestart', onGesture as EventListener);
    el.removeEventListener('gesturechange', onGesture as EventListener);
    el.removeEventListener('gestureend', onGesture as EventListener);
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

// ================= 아바타 외형 프리셋 (lib/avatar-presets 의 16종과 1:1 대응) =================

type HairStyle = 'short' | 'long' | 'none';
type HatKind = 'none' | 'beret' | 'cap' | 'ribbon' | 'antenna' | 'crown';
type EarKind = 'none' | 'cat' | 'dog';
type HandItem = 'none' | 'brush' | 'palette' | 'magnifier';
/** 상점에서 산 장식 (모자 칸과 별개) */
type DecoKind = 'none' | 'glasses' | 'balloon' | 'star';

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
  deco: DecoKind;
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
  deco: 'none',
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
  // 곱슬머리 친구 — 짧은 머리에 진한 갈색
  avatar_09: { ...BASE_LOOK, skin: '#C68642', hair: '#2B1B12', shirt: '#F5A623', pants: '#3E5C76' },
  // 단발머리 친구
  avatar_10: { ...BASE_LOOK, hairStyle: 'long', skin: '#F3D2A8', hair: '#1F1410', shirt: '#7ED6C4', pants: '#4A5D8A' },
  // 야구모자 소녀 — 긴 머리 + 모자
  avatar_11: { ...BASE_LOOK, hairStyle: 'long', hair: '#5A3418', shirt: '#FF8FB1', pants: '#6B4C9A', hat: 'cap', hatColor: '#FF6B81' },
  // 리본 단발
  avatar_12: { ...BASE_LOOK, skin: '#FFE0BD', hair: '#8A5A2B', shirt: '#9AD4F5', pants: '#3E7CB1', hat: 'ribbon', hatColor: '#FFD93D' },
  // 토끼 — 긴 귀 대신 고양이 귀를 흰색으로 (파츠 재사용)
  avatar_13: { ...BASE_LOOK, skin: '#FFF3E6', hair: '#EFE3D0', hairStyle: 'none', shirt: '#FFB7C5', pants: '#E890A8', ears: 'cat', earColor: '#FFF3E6', muzzle: true },
  // 곰돌이
  avatar_14: { ...BASE_LOOK, skin: '#B98A5E', hair: '#8A6038', hairStyle: 'none', shirt: '#6FBF73', pants: '#4A7A4E', ears: 'dog', earColor: '#8A6038', muzzle: true },
  // 우주비행사 — 안테나 + 은빛
  avatar_15: { ...BASE_LOOK, skin: '#FFE0BD', hair: '#3A2A1A', shirt: '#D7DEE8', pants: '#8792A3', hat: 'antenna', hatColor: '#5BC8F5' },
  // 요리사 — 하양 상의
  avatar_16: { ...BASE_LOOK, skin: '#F3D2A8', hair: '#4A2C18', shirt: '#FFFFFF', pants: '#C0392B', item: 'palette' },
};

// 색 목록은 아바타 선택 화면과 같은 것을 써야 한다 (lib/avatar-presets)
export { SHIRT_COLORS, HAIR_COLORS } from '@/lib/avatar-presets';

/** 상점 아이템 id → 3D 파츠. 여기 없는 id 는 그려줄 게 없으니 무시한다. */
const SHOP_HAT: Record<string, HatKind> = {
  'hat-beret': 'beret',
  'hat-cap': 'cap',
  'hat-ribbon': 'ribbon',
  'hat-crown': 'crown',
};
const SHOP_DECO: Record<string, DecoKind> = {
  'acc-glasses': 'glasses',
  'acc-balloon': 'balloon',
  'acc-star': 'star',
};
const SHOP_ITEM: Record<string, HandItem> = {
  'acc-brush': 'brush',
};

export interface AvatarCustom {
  hat: string | null;
  accessory: string | null;
}

/** 프리셋 위에 덧입히는 색 */
export interface AvatarTint {
  shirt?: string | null;
  hair?: string | null;
}

/**
 * 프리셋 8종 위에 상점에서 산 아이템을 덮어쓴다.
 * 산 걸 껴도 안 보이면 아이 입장에서는 도장을 버린 셈이라, 이 경로가 끊기면 안 된다.
 */
export function getAvatarLook(
  avatarId?: string | null,
  custom?: AvatarCustom | null,
  tint?: AvatarTint | null
): AvatarLook {
  const base = (avatarId && AVATAR_LOOKS[avatarId]) || AVATAR_LOOKS.avatar_01;
  if (!custom && !tint) return base;

  const look = { ...base };

  // 색은 프리셋 위에 덧입힌다. 같은 캐릭터를 골라도 서로 구분되게.
  if (tint?.shirt) look.shirt = tint.shirt;
  if (tint?.hair) {
    look.hair = tint.hair;
    // 동물 캐릭터는 귀 색이 머리 색과 붙어 있어야 자연스럽다
    if (look.ears !== 'none') look.earColor = tint.hair;
  }
  if (!custom) return look;
  if (custom.hat && SHOP_HAT[custom.hat]) {
    look.hat = SHOP_HAT[custom.hat];
    // 왕관은 금색이 아니면 왕관으로 안 보인다
    if (look.hat === 'crown') look.hatColor = '#FFC93C';
  }
  if (custom.accessory) {
    if (SHOP_DECO[custom.accessory]) look.deco = SHOP_DECO[custom.accessory];
    if (SHOP_ITEM[custom.accessory]) look.item = SHOP_ITEM[custom.accessory];
  }
  return look;
}

// ================= 걸어다니는 아바타 (동숲 비율 + 모멘텀) =================

export interface WalkerBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

/** 통과할 수 없는 사각 장애물 (책상·벤치·좌대 등) */
export interface Obstacle {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

const AVATAR_RADIUS = 0.28;

function isBlocked(x: number, z: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    const overlapX = Math.abs(x - o.x) - (o.halfW + AVATAR_RADIUS);
    const overlapZ = Math.abs(z - o.z) - (o.halfD + AVATAR_RADIUS);
    if (overlapX < 0 && overlapZ < 0) return true;
  }
  return false;
}

export function WalkerAvatar({
  avatarPos,
  bounds,
  start,
  teleport,
  maxSpeed = 4.2,
  scale = 1,
  avatarId,
  avatarCustom,
  avatarTint,
  avatarYaw,
  obstacles = [],
}: {
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  bounds: WalkerBounds;
  start: [number, number, number];
  /**
   * 순간이동 — 값을 넣어두면 다음 프레임에 그 자리로 옮기고 비운다.
   *
   * `avatarPos` 에 직접 써도 소용없다. 저건 **결과를 받아 적는 쪽**이고
   * 진짜 위치는 `groupRef` 다(아래 useFrame 끝에서 복사한다).
   * 게다가 `position={start}` 가 렌더마다 다시 적용돼서, 밖에서 옮겨봤자
   * 다시 그려지는 순간 출발 자리로 튕긴다 — 마을 워프가 늘 같은 곳에
   * 떨어지던 이유가 이것이었다.
   */
  teleport?: React.MutableRefObject<THREE.Vector3 | null>;
  maxSpeed?: number;
  scale?: number;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  /**
   * 내가 보는 방향을 담아둘 곳.
   * 친구들에게 위치와 함께 보내야 남들 화면에서도 같은 쪽을 보고 서 있다.
   */
  avatarYaw?: React.MutableRefObject<number>;
  obstacles?: Obstacle[];
}) {
  const look = getAvatarLook(avatarId, avatarCustom, avatarTint);
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

    // 옮겨야 할 자리가 잡혀 있으면 먼저 옮기고 비운다
    if (teleport?.current) {
      groupRef.current.position.x = teleport.current.x;
      groupRef.current.position.z = teleport.current.z;
      vel.current.x = 0;
      vel.current.z = 0;
      teleport.current = null;
    }

    let dx = 0;
    let dz = 0;
    if (!movementLocked) {
      if (keyState['KeyW'] || keyState['ArrowUp']) dz = -1;
      if (keyState['KeyS'] || keyState['ArrowDown']) dz = 1;
      if (keyState['KeyA'] || keyState['ArrowLeft']) dx = -1;
      if (keyState['KeyD'] || keyState['ArrowRight']) dx = 1;

      dx += joystickDir.x;
      dz += joystickDir.z;
    }

    // 앉은 채로 움직이려 하면 알아서 일어난다. 일어나기 버튼을 못 찾아도 막히지 않게.
    if (seat && (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1)) standUp();

    if (seat) {
      const g = groupRef.current;
      const k = Math.min(1, delta * 8);
      g.position.x += (seat.x - g.position.x) * k;
      g.position.z += (seat.z - g.position.z) * k;
      g.position.y += (SIT_HEIGHT * scale - g.position.y) * k;

      let dyaw = seat.yaw - g.rotation.y;
      while (dyaw > PI) dyaw -= PI * 2;
      while (dyaw < -PI) dyaw += PI * 2;
      g.rotation.y += dyaw * Math.min(1, delta * 8);

      // 다리는 앞으로 접고 팔은 내린다
      const bend = (r: React.RefObject<THREE.Mesh | THREE.Group | null>, target: number) => {
        if (r.current) r.current.rotation.x += (target - r.current.rotation.x) * k;
      };
      bend(legLRef, -HALF_PI);
      bend(legRRef, -HALF_PI);
      bend(armLRef, 0);
      bend(armRRef, 0);

      g.scale.set(scale, scale, scale);
      vel.current.x = 0;
      vel.current.z = 0;
      avatarPos.current.copy(g.position);
      avatarPos.current.y = 0;
      if (avatarYaw) avatarYaw.current = g.rotation.y;
      return;
    }

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

    // 축별로 따로 판정해서 장애물에 부딪히면 벽을 타고 미끄러지듯 이동한다
    const curX = groupRef.current.position.x;
    const curZ = groupRef.current.position.z;

    /**
     * 이미 장애물 안에 서 있으면 잠시 통과시킨다.
     * 의자에 앉으면 아바타가 책상 장애물 안으로 들어가는데, 이 예외가 없으면
     * 일어난 뒤 모든 방향이 막혀서 영영 못 빠져나온다. (한 발짝만 나가면 다시 막힌다)
     */
    const stuck = isBlocked(curX, curZ, obstacles);

    const tryX = Math.max(bounds.xMin, Math.min(bounds.xMax, curX + vel.current.x * delta));
    if (stuck || !isBlocked(tryX, curZ, obstacles)) {
      groupRef.current.position.x = tryX;
    } else {
      vel.current.x = 0;
    }

    const tryZ = Math.max(bounds.zMin, Math.min(bounds.zMax, curZ + vel.current.z * delta));
    if (stuck || !isBlocked(groupRef.current.position.x, tryZ, obstacles)) {
      groupRef.current.position.z = tryZ;
    } else {
      vel.current.z = 0;
    }

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
    if (avatarYaw) avatarYaw.current = groupRef.current.rotation.y;
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
      {/* 왕관 — 띠 + 뾰족한 봉우리 5개 + 보석 */}
      {look.hat === 'crown' && (
        <group position={[0, 1.3, 0]}>
          <mesh>
            <cylinderGeometry args={[0.235, 0.235, 0.08, 16, 1, true]} />
            <meshStandardMaterial
              color={look.hatColor}
              metalness={0.75}
              roughness={0.25}
              side={THREE.DoubleSide}
            />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * PI * 2;
            return (
              <mesh key={`sp-${i}`} position={[Math.sin(a) * 0.2, 0.09, Math.cos(a) * 0.2]}>
                <coneGeometry args={[0.055, 0.13, 4]} />
                <meshStandardMaterial color={look.hatColor} metalness={0.75} roughness={0.25} />
              </mesh>
            );
          })}
          <mesh position={[0, 0.02, 0.235]}>
            <octahedronGeometry args={[0.045, 0]} />
            <meshStandardMaterial color="#E8493C" emissive="#E8493C" emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}

      {/* 상점 장식 */}
      {look.deco === 'glasses' && (
        <group position={[0, 1.05, 0.235]}>
          {[-0.09, 0.09].map((x) => (
            <mesh key={`lens-${x}`} position={[x, 0, 0]} rotation={[HALF_PI, 0, 0]}>
              <torusGeometry args={[0.062, 0.014, 8, 16]} />
              <meshStandardMaterial color="#3A3226" roughness={0.5} />
            </mesh>
          ))}
          <mesh rotation={[0, 0, HALF_PI]}>
            <cylinderGeometry args={[0.009, 0.009, 0.06, 6]} />
            <meshStandardMaterial color="#3A3226" roughness={0.5} />
          </mesh>
        </group>
      )}
      {look.deco === 'star' && (
        <mesh position={[0.19, 1.38, 0.08]} rotation={[0.3, 0.4, 0.3]}>
          <octahedronGeometry args={[0.075, 0]} />
          <meshStandardMaterial color="#FFD93D" emissive="#FFD93D" emissiveIntensity={0.7} />
        </mesh>
      )}
      {look.deco === 'balloon' && (
        <group position={[0.34, 1.02, 0]}>
          {/* 실 — 손에서 위로 */}
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.6, 4]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.72, 0]} scale={[1, 1.2, 1]}>
            <sphereGeometry args={[0.16, 14, 14]} />
            <meshStandardMaterial color="#FF6B81" roughness={0.35} />
          </mesh>
          {/* 묶은 매듭 */}
          <mesh position={[0, 0.585, 0]}>
            <coneGeometry args={[0.03, 0.05, 6]} />
            <meshStandardMaterial color="#FF6B81" roughness={0.35} />
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

      {/* 기본 별 장식 (모자·귀가 없고, 상점 장식도 안 낀 맨머리일 때만) */}
      {look.hat === 'none' && look.ears === 'none' && look.deco === 'none' && (
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
