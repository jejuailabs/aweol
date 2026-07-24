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

      {/*
        10점부터 1점까지, **바깥 큰 고리부터** 그린다(작은 게 위에 남는다).
        실제 양궁 색: 노랑(10·9) · 빨강(8·7) · 파랑(6·5) · 검정(4·3) · 흰색(2·1).
        가장 안쪽 10점은 노랑 안에 **한 겹 더** 있어야 눈에 띈다 —
        점수 칸이 열 개인데 색은 다섯 쌍이라, 같은 색 안의 안/바깥을 테두리로 가른다.
      */}
      {rings.map((ring, i) => {
        const r = (11 - ring) * (R3 / 10);
        const fill =
          ring >= 9 ? '#F6D65B' : ring >= 7 ? '#E8604C' : ring >= 5 ? '#6FA8DC' : ring >= 3 ? '#2B2B2B' : '#FBF7EE';
        return (
          <group key={ring}>
            {/* 얇은 테두리(살짝 큰 검은 원)로 칸을 가른다 */}
            <mesh position={[0, 0, i * 0.006]}>
              <circleGeometry args={[r + 0.015, 48]} />
              <meshStandardMaterial color="#3A3226" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, i * 0.006 + 0.001]}>
              <circleGeometry args={[r, 48]} />
              <meshStandardMaterial color={fill} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
      {/* 정중앙 10점 — 노랑 안의 작은 원. 여기 맞으면 만점이라는 걸 눈으로 안다. */}
      <mesh position={[0, 0, 0.09]}>
        <circleGeometry args={[R3 / 10 * 0.55, 32]} />
        <meshStandardMaterial color="#E8A33C" roughness={0.8} />
      </mesh>

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
 * 조준 십자선 — **지금 어디를 겨누는지**를 과녁 위에 보여준다.
 *
 * 이게 없으면 아이가 감으로만 쏘게 되어 요령이 안 생긴다. 십자선은
 * `aimAt`(중앙 0 을 기준으로 흔들린다)을 그대로 따라가므로, 아이는 그게
 * 한가운데로 올 때를 노리면 된다. 바람은 여기 안 더한다 — 겨눈 자리를 보고
 * 바람 반대쪽으로 살짝 옮겨 쏘는 게 이 게임의 요령이다.
 */
function Reticle({ setup, startedAt }: { setup: ShotSetup | null; startedAt: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current || !setup) return;
    const p = aimAt(setup, performance.now() - startedAt);
    g.current.position.x = p.x * K;
    g.current.position.y = -p.y * K;
  });
  if (!setup) return null;
  return (
    <group position={[0, TARGET_Y, -RANGE + 0.15]}>
      <group ref={g}>
        {/* 가로·세로 선 + 가운데 점 */}
        <mesh>
          <boxGeometry args={[0.7, 0.06, 0.02]} />
          <meshBasicMaterial color="#1F6FEB" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.06, 0.7, 0.02]} />
          <meshBasicMaterial color="#1F6FEB" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.16, 0.22, 20]} />
          <meshBasicMaterial color="#1F6FEB" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 두 점을 잇는 봉 하나(시위·스태빌라이저·화살 등).
 *
 * 실린더는 기본으로 Y축을 따라 서 있다. 원하는 방향으로 눕히려면 회전을 직접
 * 구해야 하는데, 부품마다 그 계산을 반복하면 지저분하다 — 여기서 한 번만 한다.
 */
function Strut({ a, b, r, color, metalness = 0.1, roughness = 0.6, seg = 10 }: {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  color: string;
  metalness?: number;
  roughness?: number;
  seg?: number;
}) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = new THREE.Vector3().subVectors(vb, va);
    const len = Math.max(dir.length(), 1e-5);
    const pos = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    return { pos: pos.toArray() as [number, number, number], quat: quat.toArray() as [number, number, number, number], len };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, seg]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

/**
 * 활 — **손에 든 것처럼 화면 왼쪽 아래 앞에** 둔다.
 *
 * 전에는 반달 토러스 하나라 굵은 갈색 활처럼 보였다. 실제 올림픽 리커브 활의
 * 구조를 그대로 세운다: **끝이 뒤로 말리는 상·하 림**(TubeGeometry 곡선),
 * 스웹된 리저(손잡이), 당겨진 **시위 V**, 앞으로 뻗은 **사이트 조준링**과
 * 긴 **스태빌라이저** 봉. 이 부품들이 한눈에 '양궁 활'로 읽힌다.
 *
 * 좌표계(로컬): +Y 위, +Z 나(당기는 쪽), -Z 과녁. 림은 위아래로 뻗으며
 * 과녁 쪽(-Z)으로 휘고, 끝에서 다시 살짝 말린다.
 *
 * 흔들림은 조준 십자선(`Reticle`)이 맡는다. 활은 그 흔들림에 맞춰 **아주 조금만**
 * 같이 움직여 손떨림처럼 보인다 — 활까지 크게 흔들면 과녁이 안 보인다.
 */
/**
 * 활을 든 손 높이·거리(앞쪽). 좌우 위치(x)는 화면 비율에 맞춰 **반응형으로** 정한다 —
 * 세로 화면(모바일)은 가로 시야각이 좁아, x 를 고정하면 활이 화면 밖으로 사라진다.
 */
const BOW_Y = 2.05;
const BOW_Z = 4.2;

function Bow({ setup, startedAt, shooting }: {
  setup: ShotSetup | null;
  startedAt: number;
  shooting: boolean;
}) {
  const g = useRef<THREE.Group>(null);

  // 림(휘는 날개)은 곡선이라야 활처럼 보인다 — 형상은 한 번만 만든다.
  const { upperLimb, lowerLimb, riser } = useMemo(() => {
    const curve = (pts: [number, number, number][]) =>
      new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    // 위 림: 리저 위에서 과녁 쪽(-Z)으로 휘어 나갔다가 끝에서 되말린다(recurve).
    const upperLimb = curve([
      [0, 0.46, 0.03],
      [0, 0.95, -0.05],
      [0, 1.5, -0.24],
      [0, 1.95, -0.4],
      [0, 2.16, -0.22],
    ]);
    const lowerLimb = curve([
      [0, -0.46, 0.03],
      [0, -0.95, -0.05],
      [0, -1.5, -0.24],
      [0, -1.95, -0.4],
      [0, -2.16, -0.22],
    ]);
    // 리저 — 가운데 손잡이. 살짝 S 로 스웹된 금속 몸통.
    const riser = curve([
      [0, -0.58, 0.04],
      [0, -0.26, 0.11],
      [0, 0.04, 0.09],
      [0, 0.34, 0.02],
      [0, 0.58, 0.04],
    ]);
    return { upperLimb, lowerLimb, riser };
  }, []);

  /**
   * 활의 좌우 위치 — 카메라 프러스텀의 **왼쪽 가장자리 기준**으로 잡는다.
   * 활 깊이에서의 화면 절반너비(halfW)를 구해, 그 왼쪽에서 안쪽으로 일정 비율만
   * 들어온 자리에 둔다. 가로·세로 어떤 비율에서도 활이 왼쪽 아래에 걸린다.
   */
  const { camera, size } = useThree();
  const baseX = useMemo(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const dz = cam.position.z - BOW_Z;
    const halfH = dz * Math.tan(((cam.fov ?? 46) * Math.PI) / 180 / 2);
    const halfW = halfH * (size.width / Math.max(1, size.height));
    return -Math.min(1.5, 0.5 * halfW);
  }, [camera, size.width, size.height]);

  useFrame(() => {
    if (!g.current || !setup) return;
    const p = aimAt(setup, performance.now() - startedAt);
    // 손떨림 정도로만. 십자선은 크게 돌아도 활은 살짝.
    g.current.position.x = baseX + p.x * K * 0.05;
    g.current.position.y = BOW_Y - p.y * K * 0.05;
  });

  if (!setup) return null;

  // 시위가 걸리는 림 끝(나 쪽 면)과, 당겨진 노크(오늬) 위치.
  const topNock: [number, number, number] = [0, 2.13, -0.15];
  const botNock: [number, number, number] = [0, -2.13, -0.15];
  // 쏜 직후엔 시위가 앞(-Z)으로 튕겨 나가고, 그 전엔 나(+Z) 쪽으로 당겨져 있다.
  const nock: [number, number, number] = [0, 0, shooting ? -0.12 : 0.6];

  return (
    <group ref={g} position={[baseX, BOW_Y, BOW_Z]} rotation={[0.02, 0.32, 0.13]} scale={0.55}>
      {/* 상·하 림 — 나뭇결 라미네이트. 끝(시위 거는 곳)엔 검은 끝동. */}
      {[upperLimb, lowerLimb].map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 44, 0.044, 12, false]} />
          <meshStandardMaterial color="#B57A3C" metalness={0.15} roughness={0.5} />
        </mesh>
      ))}
      {/* 림 끝동(검정) — 시위가 걸리는 자리 */}
      {[topNock, botNock].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#17181B" metalness={0.4} roughness={0.4} />
        </mesh>
      ))}

      {/* 리저 — 스웹된 금속 몸통(가늘게) */}
      <mesh>
        <tubeGeometry args={[riser, 24, 0.075, 14, false]} />
        <meshStandardMaterial color="#2C6BA8" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* 그립 — 손이 쥐는 곳, 가죽/고무 톤 */}
      <mesh position={[0.05, -0.14, 0.1]}>
        <boxGeometry args={[0.11, 0.4, 0.15]} />
        <meshStandardMaterial color="#3A2C22" roughness={0.85} />
      </mesh>
      {/* 화살받이(쉘프) — 화살이 얹히는 작은 턱 */}
      <mesh position={[-0.04, 0.14, 0.03]}>
        <boxGeometry args={[0.14, 0.045, 0.11]} />
        <meshStandardMaterial color="#20486E" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* 시위 V — 위/아래 림 끝에서 당겨진 노크로 모인다 */}
      <Strut a={topNock} b={nock} r={0.011} color="#EFE9DA" roughness={0.5} seg={6} />
      <Strut a={botNock} b={nock} r={0.011} color="#EFE9DA" roughness={0.5} seg={6} />

      {/* 스태빌라이저 — 리저에서 과녁 쪽으로 뻗은 봉. 끝에 댐퍼 무게추. 양궁의 상징. */}
      <Strut a={[0, -0.28, 0.02]} b={[0, -0.42, -1.5]} r={0.024} color="#15171A" metalness={0.5} roughness={0.5} />
      <mesh position={[0, -0.42, -1.5]}>
        <cylinderGeometry args={[0.045, 0.045, 0.14, 12]} />
        <meshStandardMaterial color="#D14B3C" metalness={0.3} roughness={0.5} />
      </mesh>

      {/* 메긴 화살 — 노크에서 과녁 쪽으로. 쏘는 중에는 감춘다. */}
      {!shooting && (
        <group>
          <Strut a={nock} b={[0, 0.14, -2.5]} r={0.02} color="#D9C27A" roughness={0.55} />
          {/* 화살촉 */}
          <mesh position={[0, 0.14, -2.5]} rotation={[PI * 0.5, 0, 0]}>
            <coneGeometry args={[0.035, 0.16, 10]} />
            <meshStandardMaterial color="#C6CDD4" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* 깃(fletching) — 노크 근처에 두 장 */}
          <mesh position={[0.05, 0, 0.52]} rotation={[0, 0, PI * 0.5]}>
            <boxGeometry args={[0.005, 0.16, 0.1]} />
            <meshStandardMaterial color="#E8604C" roughness={0.7} />
          </mesh>
          <mesh position={[-0.05, 0, 0.52]} rotation={[0, 0, PI * 0.5]}>
            <boxGeometry args={[0.005, 0.16, 0.1]} />
            <meshStandardMaterial color="#1F6FEB" roughness={0.7} />
          </mesh>
        </group>
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
  // 활이 있는 자리(왼쪽 아래 앞)에서 화살이 출발한다
  const from = useMemo(() => new THREE.Vector3(-1.15, 1.5, 5.6), []);
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
        {/* 날아가는 중에는 십자선을 감춘다 — 이미 쏜 뒤라 겨눌 게 없다 */}
        {!flight && <Reticle setup={setup} startedAt={startedAt} />}
        <Bow setup={setup} startedAt={startedAt} shooting={shooting} />
        {/* key 를 바꿔 새 화살을 만든다 — 진행도가 0 부터 다시 간다 */}
        {flight && <FlyingArrow key={`${flight.x},${flight.y}`} from={from} to={to} />}
      </Canvas>
    </div>
  );
}
