'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PetKind } from '@/lib/firestore-schema';
import {
  BLOCK_SECONDS, BUMP_DIST, NEAR_DIST, encounterLine, type PetEncounter,
} from '@/lib/school-pet';

const PI = Math.PI;

interface PetSkin {
  body: string;
  belly: string;
  ear: 'flop' | 'point' | 'long';
  tail: 'wag' | 'up' | 'puff';
}

const SKINS: Record<PetKind, PetSkin> = {
  dog: { body: '#C89A6B', belly: '#F0DCC0', ear: 'flop', tail: 'wag' },
  cat: { body: '#8A8F98', belly: '#E4E7EB', ear: 'point', tail: 'up' },
  rabbit: { body: '#F5EFE6', belly: '#FFFFFF', ear: 'long', tail: 'puff' },
};

/**
 * 운동장을 어슬렁거리는 학교 동물.
 *
 * 아바타처럼 조작하는 게 아니라 **혼자 돌아다닌다.** 목표 지점을 하나 정해 걸어가고,
 * 닿으면 잠깐 쉬었다가 다음 지점을 정한다. 아이는 다가가서 누르기만 하면 된다.
 *
 * 상태(배고픔 등)는 서버에서 오지만 **움직임은 여기서만 산다.** 위치를 저장하면
 * 아이가 화면을 볼 때마다 쓰기가 발생한다 — 학교당 하루 수천 번이 된다.
 */
export default function SchoolPet({
  kind,
  name,
  needEmoji,
  home = [7, 0, 8],
  roam = 3.2,
  avatarPos,
  onClick,
}: {
  kind: PetKind;
  name: string;
  /** 머리 위에 띄울 기분 이모지. 급한 게 없으면 빈 문자열 */
  needEmoji: string;
  /** 어슬렁거릴 중심 */
  home?: [number, number, number];
  /** 중심에서 얼마나 멀리까지 */
  roam?: number;
  /** 아바타 위치. 주면 피하기도 하고 말도 건다 */
  avatarPos?: React.MutableRefObject<THREE.Vector3>;
  onClick?: () => void;
}) {
  const skin = SKINS[kind] ?? SKINS.dog;
  const group = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const [hot, setHot] = useState(false);

  // 목표 지점과 쉬는 시간. ref 라서 다시 그려도 안 흔들린다.
  const target = useRef(new THREE.Vector2(home[0], home[2]));
  const rest = useRef(1.2);
  const bob = useRef(0);

  /** 아바타와 마주친 상태 */
  const [say, setSay] = useState('');
  const blockedFor = useRef(0);   // 앞이 막힌 채로 흐른 시간
  const nearFor = useRef(0);      // 가까이 있은 시간
  const grumble = useRef(0);      // 몇 번째 투덜거림인가
  const sayUntil = useRef(0);     // 말풍선을 언제까지 띄우나
  const lastBump = useRef(0);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;

    const now = state.clock.elapsedTime;

    /**
     * 아바타와의 관계.
     *
     * 가만히 앞을 막고 있으면 잠깐 기다렸다가 **옆으로 돌아간다.**
     * 말만 하고 계속 막혀 있으면 놀이가 아니라 답답한 일이 된다.
     */
    let avoid: { x: number; z: number } | null = null;
    if (avatarPos) {
      const ax = avatarPos.current.x - g.position.x;
      const az = avatarPos.current.z - g.position.z;
      const adist = Math.sqrt(ax * ax + az * az);

      const talk = (kind: PetEncounter, turn: number, secs = 2.4) => {
        if (now < sayUntil.current) return;
        setSay(encounterLine(kind, turn));
        sayUntil.current = now + secs;
      };

      if (adist < BUMP_DIST) {
        // 부딪혔다 — 살짝 밀려난다
        if (now - lastBump.current > 1.2) { talk('nudged', Math.floor(now) % 3); lastBump.current = now; }
        const inv = 1 / Math.max(0.001, adist);
        g.position.x -= ax * inv * delta * 1.4;
        g.position.z -= az * inv * delta * 1.4;
      }

      if (adist < NEAR_DIST) {
        nearFor.current += delta;
        // 내가 가려는 쪽에 아바타가 서 있나 (앞을 막았나)
        const tx = target.current.x - g.position.x;
        const tz = target.current.y - g.position.z;
        const tlen = Math.sqrt(tx * tx + tz * tz);
        const facing = tlen > 0.01 ? (ax * tx + az * tz) / (adist * tlen) : 0;

        if (facing > 0.5) {
          blockedFor.current += delta;
          if (blockedFor.current > BLOCK_SECONDS) {
            talk('blocked', grumble.current);
            grumble.current += 1;
            blockedFor.current = 0;
            // 옆으로 돌아간다. 아바타 방향의 수직으로 목표를 틀어준다.
            const inv = 1 / Math.max(0.001, adist);
            target.current.set(
              g.position.x - az * inv * 2.4,
              g.position.z + ax * inv * 2.4
            );
            rest.current = 0;
          }
          // 막힌 동안은 옆으로 비켜선다
          const inv = 1 / Math.max(0.001, adist);
          avoid = { x: -az * inv, z: ax * inv };
        } else {
          blockedFor.current = 0;
        }

        if (nearFor.current > 9) { talk('followed', Math.floor(now / 7) % 3); nearFor.current = 3; }
        else if (nearFor.current < delta * 2) talk('greet', Math.floor(now / 5) % 3);
      } else {
        nearFor.current = 0;
        blockedFor.current = 0;
        // 멀어지면 투덜거림도 처음으로 (다시 만나면 새 마음)
        if (adist > NEAR_DIST * 2.5) grumble.current = 0;
      }
    }

    if (say && now > sayUntil.current) setSay('');

    const dx = target.current.x - g.position.x;
    const dz = target.current.y - g.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.25) {
      // 도착했으면 잠깐 쉰다
      rest.current -= delta;
      if (rest.current <= 0) {
        // 다음 지점을 고른다. 시계를 씨앗으로 써서 매번 다른 곳이 나온다.
        const t = state.clock.elapsedTime;
        const ang = (Math.sin(t * 12.9898) * 43758.5453) % (PI * 2);
        const rad = (Math.abs(Math.cos(t * 78.233) * 43758.5453) % 1) * roam;
        target.current.set(home[0] + Math.cos(ang) * rad, home[2] + Math.sin(ang) * rad);
        rest.current = 1 + (Math.abs(Math.sin(t * 4.1)) * 2.5);
      }
    } else {
      const speed = 1.1;
      // avoid 가 있으면 옆걸음을 섞는다 — 정면으로 밀고 들어가지 않는다
      const sx = avoid ? avoid.x * 0.9 : 0;
      const sz = avoid ? avoid.z * 0.9 : 0;
      g.position.x += ((dx / dist) + sx) * speed * delta;
      g.position.z += ((dz / dist) + sz) * speed * delta;

      // 가는 방향을 본다
      const want = Math.atan2(dx, dz);
      let diff = want - g.rotation.y;
      while (diff > PI) diff -= PI * 2;
      while (diff < -PI) diff += PI * 2;
      g.rotation.y += diff * 6 * delta;

      bob.current += delta * 9;
    }

    // 걸을 때만 통통 튄다
    const moving = dist >= 0.25;
    g.position.y = moving ? Math.abs(Math.sin(bob.current)) * 0.07 : 0;

    if (tail.current) {
      tail.current.rotation.z = Math.sin(state.clock.elapsedTime * (hot ? 14 : 6)) * 0.5;
    }
  });

  const earColor = skin.body;

  return (
    <group
      ref={group}
      position={home}
      scale={hot ? 1.08 : 1}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
    >
      {/* 몸통 */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <capsuleGeometry args={[0.21, 0.24, 6, 12]} />
        <meshStandardMaterial color={skin.body} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.26, 0.14]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color={skin.belly} roughness={0.9} />
      </mesh>

      {/* 다리 넷 */}
      {([[-0.13, 0.13], [0.13, 0.13], [-0.13, -0.13], [0.13, -0.13]] as [number, number][]).map(([lx, lz]) => (
        <mesh key={`leg-${lx}-${lz}`} position={[lx, 0.09, lz]}>
          <cylinderGeometry args={[0.045, 0.05, 0.18, 8]} />
          <meshStandardMaterial color={skin.body} roughness={0.85} />
        </mesh>
      ))}

      {/* 머리 */}
      <group position={[0, 0.6, 0.16]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={skin.body} roughness={0.85} />
        </mesh>
        {/* 주둥이 */}
        <mesh position={[0, -0.05, 0.16]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={skin.belly} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.03, 0.25]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#3A2A2A" roughness={0.4} />
        </mesh>
        {/* 눈 */}
        {([-0.08, 0.08]).map((ex) => (
          <mesh key={`eye-${ex}`} position={[ex, 0.04, 0.17]}>
            <sphereGeometry args={[0.032, 8, 8]} />
            <meshStandardMaterial color="#2A211A" />
          </mesh>
        ))}
        {/* 귀 — 종류마다 다르게 */}
        {skin.ear === 'flop' && ([-0.17, 0.17]).map((ex) => (
          <mesh key={`ear-${ex}`} position={[ex, 0.02, 0]} rotation={[0, 0, ex > 0 ? -0.3 : 0.3]}>
            <capsuleGeometry args={[0.055, 0.12, 4, 8]} />
            <meshStandardMaterial color={earColor} roughness={0.9} />
          </mesh>
        ))}
        {skin.ear === 'point' && ([-0.12, 0.12]).map((ex) => (
          <mesh key={`ear-${ex}`} position={[ex, 0.19, 0]} rotation={[0, 0, ex > 0 ? -0.25 : 0.25]}>
            <coneGeometry args={[0.075, 0.17, 4]} />
            <meshStandardMaterial color={earColor} roughness={0.9} />
          </mesh>
        ))}
        {skin.ear === 'long' && ([-0.08, 0.08]).map((ex) => (
          <mesh key={`ear-${ex}`} position={[ex, 0.26, -0.02]} rotation={[0, 0, ex > 0 ? -0.16 : 0.16]}>
            <capsuleGeometry args={[0.05, 0.26, 4, 8]} />
            <meshStandardMaterial color={earColor} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* 꼬리 */}
      <mesh ref={tail} position={[0, 0.42, -0.22]} rotation={[0.5, 0, 0]}>
        {skin.tail === 'puff'
          ? <sphereGeometry args={[0.09, 10, 10]} />
          : <capsuleGeometry args={[0.04, skin.tail === 'up' ? 0.24 : 0.16, 4, 8]} />}
        <meshStandardMaterial color={skin.belly} roughness={0.9} />
      </mesh>

      {/* 이름표와 기분 — 가리키거나 뭔가 필요할 때만 띄운다 */}
      {say && (
        <Html position={[0, 1.28, 0]} center pointerEvents="none" zIndexRange={[7, 0]}>
          <div
            style={{
              background: 'white', color: '#3A3226', fontWeight: 800, fontSize: '16px',
              padding: '7px 14px', borderRadius: '14px', whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif', border: '2px solid #E8D9BE',
              boxShadow: '0 4px 10px rgba(0,0,0,0.22)',
            }}
          >
            {say}
          </div>
        </Html>
      )}

      {(hot || needEmoji) && !say && (
        <Html position={[0, 1.05, 0]} center pointerEvents="none" zIndexRange={[6, 0]}>
          <div
            style={{
              background: '#FFF8E7', color: '#6B5B43', fontWeight: 800, fontSize: '15px',
              padding: '5px 12px', borderRadius: '999px', whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif', border: '2px solid #EFE3CB',
              boxShadow: '0 3px 8px rgba(0,0,0,0.22)',
            }}
          >
            {needEmoji} {name}
          </div>
        </Html>
      )}
    </group>
  );
}
