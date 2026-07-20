'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getAvatarLook } from './walker';
import { joinRoom, type Peer, type PeerLook } from '@/lib/presence';

const PI = Math.PI;

/**
 * 같은 공간에 있는 다른 아이 하나.
 *
 * **받은 좌표로 곧장 옮기지 않는다.** 초당 5번만 오기 때문에 그대로 쓰면
 * 뚝뚝 끊겨 보인다. 마지막으로 받은 자리를 향해 부드럽게 따라가게 해서
 * 그 사이를 메운다(보간). 이게 5Hz 를 눈에 안 띄게 만드는 핵심이다.
 */
function PeerAvatar({ peer }: { peer: Peer }) {
  const group = useRef<THREE.Group>(null);
  const look = getAvatarLook(peer.avatarId, null, { shirt: peer.shirt, hair: peer.hair });
  const bob = useRef(0);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    const dx = peer.x - g.position.x;
    const dz = peer.z - g.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // 너무 멀면(방금 들어왔거나 순간이동) 그냥 붙인다. 먼 거리를 걸어가면 이상하다.
    if (dist > 6) {
      g.position.set(peer.x, 0, peer.z);
      g.rotation.y = peer.ry;
      return;
    }

    const k = Math.min(1, delta * 9);
    g.position.x += dx * k;
    g.position.z += dz * k;

    let dry = peer.ry - g.rotation.y;
    while (dry > PI) dry -= PI * 2;
    while (dry < -PI) dry += PI * 2;
    g.rotation.y += dry * Math.min(1, delta * 9);

    // 움직이는 중이면 통통 튄다
    const moving = dist > 0.06;
    if (moving) bob.current += delta * 9;
    g.position.y = moving ? Math.abs(Math.sin(bob.current)) * 0.06 : 0;
  });

  return (
    <group ref={group} position={[peer.x, 0, peer.z]}>
      {/* 몸 — 아바타와 같은 파츠를 쓰되 간단하게 (여러 명이 동시에 뜬다) */}
      <mesh position={[0, 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.16, 6, 10]} />
        <meshStandardMaterial color={look.pants} />
      </mesh>
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.22, 0.42, 14]} />
        <meshStandardMaterial color={look.shirt} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.82, 0]} castShadow>
        <sphereGeometry args={[0.21, 16, 16]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      {look.hairStyle !== 'none' && (
        <mesh position={[0, 0.92, 0]}>
          <sphereGeometry args={[0.215, 16, 16, 0, PI * 2, 0, PI * 0.55]} />
          <meshStandardMaterial color={look.hair} />
        </mesh>
      )}
      {/* 눈 */}
      {([-0.08, 0.08]).map((ex) => (
        <mesh key={ex} position={[ex, 0.85, 0.185]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshStandardMaterial color="#2A211A" />
        </mesh>
      ))}

      {/* 이름표 — 누가 누군지 알아야 같이 노는 맛이 난다 */}
      <Html position={[0, 1.3, 0]} center pointerEvents="none" zIndexRange={[4, 0]}>
        <div
          style={{
            background: 'rgba(255,248,231,0.92)', color: '#6B5B43',
            fontWeight: 800, fontSize: '11px', padding: '3px 9px',
            borderRadius: '999px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
          }}
        >
          {peer.name}
        </div>
      </Html>
    </group>
  );
}

/**
 * 방에 들어가서 친구들을 그린다.
 *
 * 씬 안에 이것 하나만 넣으면 된다. 내 위치는 `avatarPos` 에서 읽어 알아서 보낸다 —
 * 씬마다 보내는 코드를 또 쓰면 초당 몇 번 보내는지가 화면마다 달라진다.
 */
export default function Peers({
  schoolId, roomKey, uid, look, avatarPos, avatarYaw,
}: {
  schoolId: string;
  /** 공간 하나를 가리키는 값 — 'school' / 'class-3-1' / 'lobby' */
  roomKey: string;
  /** 로그인 안 했으면 null — 그때는 아무것도 안 한다 */
  uid: string | null;
  look: PeerLook;
  avatarPos: React.MutableRefObject<THREE.Vector3>;
  /** 아바타가 보는 방향. 없으면 0 */
  avatarYaw?: React.MutableRefObject<number>;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const handle = useRef<ReturnType<typeof joinRoom> | null>(null);

  useEffect(() => {
    if (!uid) return;
    handle.current = joinRoom(schoolId, roomKey, uid, look, setPeers);
    return () => {
      handle.current?.leave();
      handle.current = null;
      setPeers([]);
    };
    // look 이 바뀌었다고 방을 다시 잡을 이유는 없다 (이름·색은 다음 틱에 실려 나간다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, roomKey, uid]);

  useFrame(() => {
    if (!handle.current) return;
    handle.current.push(avatarPos.current.x, avatarPos.current.z, avatarYaw?.current ?? 0);
  });

  return (
    <group>
      {peers.map((p) => (
        <PeerAvatar key={p.uid} peer={p} />
      ))}
    </group>
  );
}
