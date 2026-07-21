'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TARGET_R, aimAt, type ShotSetup } from '@/lib/archery';

/**
 * 양궁 경기장.
 *
 * **점수는 여기서 안 낸다.** 화면은 보여주기만 하고 점수는 서버가 낸다.
 * 그래서 화살이 꽂히는 자리는 반드시 `landing()` 이 준 값을 그대로 쓴다 —
 * 눈에 보이는 자리와 점수가 어긋나면 아이가 속았다고 느낀다.
 */

const PI = Math.PI;

/**
 * 과녁까지 거리(3D 단위).
 *
 * 처음에 34 로 뒀더니 휴대폰에서 과녁이 점처럼 작았다. 멀어 보이는 것보다
 * **과녁이 읽히는 게** 먼저다 — 어디를 맞혔는지 안 보이면 게임이 아니다.
 */
const RANGE = 21;
/** 과녁 반지름(3D 단위) — 계산 단위(TARGET_R)와 나눠 둔다 */
const R3 = 3.0;
const K = R3 / TARGET_R;

/** 과녁 — 10점부터 1점까지. 큰 고리부터 그려야 작은 게 위에 남는다. */
/** 과녁 중심 높이 — 카메라가 여기를 본다 */
const TARGET_Y = 3.2;

function Target({ hits }: { hits: { x: number; y: number }[] }) {
  const rings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <group position={[0, TARGET_Y, -RANGE]}>
      {/* 받침대 */}
      <mesh position={[0, -TARGET_Y, -0.1]}>
        <boxGeometry args={[0.35, TARGET_Y, 0.35]} />
        <meshStandardMaterial color="#8A5A3B" roughness={0.9} />
      </mesh>

      {rings.map((ring, i) => {
        const r = (11 - ring) * (R3 / 10);
        const fill =
          ring >= 9 ? '#F6D65B' : ring >= 7 ? '#E8604C' : ring >= 5 ? '#6FA8DC' : ring >= 3 ? '#3A3226' : '#FBF7EE';
        return (
          <mesh key={ring} position={[0, 0, i * 0.004]}>
            <circleGeometry args={[r, 48]} />
            <meshStandardMaterial color={fill} roughness={0.85} />
          </mesh>
        );
      })}

      {/* 꽂힌 화살 — 계산이 준 자리 그대로 */}
      {hits.map((h, i) => (
        <group key={i} position={[h.x * K, -h.y * K, 0.1]}>
          <mesh rotation={[PI * 0.5, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.9, 8]} />
            <meshStandardMaterial color="#C8A860" />
          </mesh>
          <mesh position={[0, 0, 0.5]}>
            <coneGeometry args={[0.11, 0.28, 8]} />
            <meshStandardMaterial color="#E8604C" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 활과 시위.
 *
 * 겨누는 동안 시위가 당겨진 채로 있고, 조준점을 따라 활 전체가 흔들린다.
 * 쏘면 시위가 튕겨 돌아간다 — 그 순간이 있어야 '쐈다' 는 느낌이 난다.
 */
function Bow({ setup, startedAt, shooting }: {
  setup: ShotSetup | null;
  startedAt: number;
  shooting: boolean;
}) {
  const g = useRef<THREE.Group>(null);
  const string = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!g.current || !setup) return;
    const p = aimAt(setup, performance.now() - startedAt);
    // 조준점이 움직이는 만큼 활이 흔들린다. 화면 앞쪽이라 조금만 움직여도 크게 보인다.
    g.current.position.x = p.x * K * 0.42;
    g.current.position.y = 1.9 - p.y * K * 0.42;
    if (string.current) {
      // 쏜 직후에는 시위가 앞으로 튕긴다
      string.current.position.z = shooting ? 0.06 : -0.34;
    }
  });

  return (
    <group ref={g} position={[0, 1.9, 3.6]}>
      {/* 활채 */}
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[0.62, 0.045, 8, 24, PI * 1.15]} />
        <meshStandardMaterial color="#8A5A3B" roughness={0.7} />
      </mesh>
      {/* 시위 */}
      <mesh ref={string} position={[0, 0, -0.34]} rotation={[PI * 0.5, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.2, 6]} />
        <meshStandardMaterial color="#FBF7EE" />
      </mesh>
      {/* 메긴 화살 — 쏘는 중에는 감춘다 */}
      {!shooting && (
        <mesh position={[0, 0, -0.1]} rotation={[PI * 0.5, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 1.1, 8]} />
          <meshStandardMaterial color="#C8A860" />
        </mesh>
      )}
    </group>
  );
}

/**
 * 카메라를 과녁 쪽으로 **명시적으로** 돌린다.
 *
 * `<Canvas camera>` 는 자리만 정하고 방향은 안 정한다(기본은 -Z 를 향해 수평).
 * 그래서 과녁이 화면 밖으로 밀려 **잔디만 보였다.** 자리를 조금만 옮겨도
 * 다시 틀어지므로, 여기서 한 번 과녁을 바라보게 맞춘다.
 */
function AimCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 2.6, 7.2);
    camera.lookAt(0, TARGET_Y, -RANGE);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/**
 * 날아가는 화살 한 대.
 *
 * 진행도를 **스스로** 가진다. 부모가 ref 를 넘겨주고 렌더 중에 되돌리면
 * '렌더 중 ref 수정' 이라 안전하지 않다. 대신 부모가 `key` 를 바꿔 새로 만든다.
 */
function FlyingArrow({ from, to }: {
  from: THREE.Vector3;
  to: THREE.Vector3;
}) {
  const m = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    if (!m.current) return;
    /*
      한 바퀴가 페이지의 FLIGHT_MS(620ms)와 맞아야 한다.
      화살이 먼저 도착해 멈춰 있거나, 꽂히는 소리가 먼저 나면 어색하다.
      1 / 0.62초 ≒ 1.7
    */
    t.current = Math.min(1, t.current + delta * 1.7);
    const k = t.current;
    m.current.position.lerpVectors(from, to, k);
    // 살짝 포물선 — 똑바로 날면 장난감처럼 보인다
    m.current.position.y += Math.sin(k * PI) * 0.9;
  });
  return (
    <group ref={m}>
      <mesh rotation={[PI * 0.5, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1, 8]} />
        <meshStandardMaterial color="#C8A860" />
      </mesh>
    </group>
  );
}

export default function ArcheryScene({
  setup, startedAt, shooting, flight, hits,
}: {
  setup: ShotSetup | null;
  /** 이 화살을 겨누기 시작한 시각 (performance.now) */
  startedAt: number;
  shooting: boolean;
  /** 날아가는 화살이 있으면 도착 지점(계산 단위) */
  flight: { x: number; y: number } | null;
  hits: { x: number; y: number }[];
}) {
  const from = useMemo(() => new THREE.Vector3(0, 1.9, 3.6), []);
  const to = useMemo(
    () => (flight ? new THREE.Vector3(flight.x * K, TARGET_Y - flight.y * K, -RANGE) : new THREE.Vector3()),
    [flight]
  );
  return (
    <div className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ fov: 46, near: 0.1, far: 300 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(#BFE8F5, #DDF0FB)' }}
      >
        <AimCamera />
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 16, 6]} intensity={1.05} color="#FFF4DC" castShadow />

        {/* 잔디 — 지평선까지 넉넉히 */}
        <mesh rotation={[-PI * 0.5, 0, 0]} position={[0, 0, -RANGE]} receiveShadow>
          <planeGeometry args={[120, 200]} />
          <meshStandardMaterial color="#8FD98A" roughness={0.95} />
        </mesh>

        {/* 사대(발판) — 내가 선 자리 */}
        <mesh rotation={[-PI * 0.5, 0, 0]} position={[0, 0.02, 4]}>
          <planeGeometry args={[6, 3]} />
          <meshStandardMaterial color="#D9C9A8" roughness={0.95} />
        </mesh>

        {/* 거리 표시 — 멀다는 게 느껴져야 한다 */}
        {[7, 14].map((d) => (
          <mesh key={d} rotation={[-PI * 0.5, 0, 0]} position={[0, 0.01, -d + 3]}>
            <planeGeometry args={[10, 0.14]} />
            <meshStandardMaterial color="#FBF7EE" />
          </mesh>
        ))}

        {/* 멀리 나무 몇 그루 — 허허벌판이면 거리감이 안 산다 */}
        {([[-14, -30], [15, -34], [-22, -12], [21, -16]] as const).map(([x, z]) => (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <mesh position={[0, 1.1, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.32, 2.2, 8]} />
              <meshStandardMaterial color="#8A5A3B" />
            </mesh>
            <mesh position={[0, 3, 0]} castShadow>
              <sphereGeometry args={[1.6, 12, 12]} />
              <meshStandardMaterial color="#5FA85C" roughness={0.95} />
            </mesh>
          </group>
        ))}

        <Target hits={hits} />
        <Bow setup={setup} startedAt={startedAt} shooting={shooting} />
        {/* key 를 바꿔 새 화살을 만든다 — 진행도가 0 부터 다시 간다 */}
        {flight && <FlyingArrow key={`${flight.x},${flight.y}`} from={from} to={to} />}
      </Canvas>
    </div>
  );
}
