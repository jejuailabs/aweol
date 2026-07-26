'use client';

import * as THREE from 'three';

/**
 * 몹의 생김새 — **사물을 몹으로 만든다.**
 *
 * 처음에는 색깔 공에 이모지를 얹어 뒀는데, 그건 몹이 아니라 **떠 있는 구슬**이었다.
 * 폐그물인지 페트병인지도 이모지를 읽어야 알 수 있었다.
 *
 * ---
 *
 * **눈이 전부다.**
 *
 * 무엇이든 **큰 눈 두 개**를 붙이면 살아 있는 것으로 보인다. 흰자를 크게 하고
 * 눈동자를 아래쪽에 붙이면 귀엽고, 위쪽에 붙이면 사납다. 졸개는 귀엽게,
 * 우두머리는 눈썹을 붙여 사납게 만든다.
 *
 * 몸통은 **그 물건의 실루엣**을 그대로 쓴다 — 페트병은 병 모양, 캔은 원통,
 * 비닐봉지는 손잡이가 달린 자루. 그래야 "저건 페트병이구나" 가 바로 온다.
 * 실루엣(무엇인가) + 눈(살아 있다) = 의인화다.
 */

/** 눈 한 쌍. `angry` 면 눈썹이 붙는다. */
function Eyes({
  y = 0.16, spread = 0.3, size = 0.19, angry = false, look = 0.045,
}: {
  y?: number; spread?: number; size?: number; angry?: boolean; look?: number;
}) {
  return (
    <group position={[0, y, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[spread * s, 0, 0.58]}>
          {/* 흰자 */}
          <mesh>
            <sphereGeometry args={[size, 12, 10]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.35} />
          </mesh>
          {/* 눈동자 — 살짝 아래로 내리면 순해 보인다 */}
          <mesh position={[0, angry ? look : -look * 0.6, size * 0.62]}>
            <sphereGeometry args={[size * 0.5, 10, 8]} />
            <meshStandardMaterial color="#1A1A20" roughness={0.25} />
          </mesh>
          {/* 반짝 — 이거 하나로 눈이 촉촉해진다 */}
          <mesh position={[size * 0.16, size * 0.2, size * 0.78]}>
            <sphereGeometry args={[size * 0.17, 6, 6]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          {angry && (
            <mesh position={[0, size * 1.05, size * 0.5]} rotation={[0, 0, s * 0.42]}>
              <boxGeometry args={[size * 1.5, size * 0.28, size * 0.2]} />
              <meshStandardMaterial color="#241E22" roughness={0.7} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/** 입 — 작은 호. 벌리면 사납다. */
function Mouth({ y = -0.2, w = 0.26, open = false }: { y?: number; w?: number; open?: boolean }) {
  return (
    <mesh position={[0, y, 0.66]} rotation={[open ? 0 : Math.PI, 0, 0]}>
      {open
        ? <sphereGeometry args={[w * 0.6, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        : <torusGeometry args={[w, w * 0.16, 6, 12, Math.PI]} />}
      <meshStandardMaterial color="#3A2630" roughness={0.6} />
    </mesh>
  );
}

/** 흔들리는 팔·다리·촉수 대신 쓰는 짧은 가닥 */
function Strand({
  pos, len, rot, color, thick = 0.05,
}: {
  pos: [number, number, number]; len: number; rot: [number, number, number]; color: string; thick?: number;
}) {
  return (
    <mesh position={pos} rotation={rot}>
      <cylinderGeometry args={[thick, thick * 0.7, len, 5]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

/**
 * 종류별 몸통.
 *
 * `flash` 는 맞았을 때 하얗게 번쩍이는 값이라 **재질을 직접 만진다**(useFrame 에서).
 * 그래서 몸통 재질에는 `emissive` 를 흰색으로 깔아 둔다 — 안 깔면 만져도 안 밝아진다.
 */
export default function MobBody({ kindId, color }: { kindId: string; color: string }) {
  const skin = (roughness = 0.85) => (
    <meshStandardMaterial color={color} roughness={roughness} emissive="#FFFFFF" emissiveIntensity={0} />
  );

  switch (kindId) {
    /* 버려진 그물 — 엉킨 덩어리에 가닥이 늘어진다 */
    case 'net':
      return (
        <group>
          <mesh scale={[1, 0.86, 1]}>
            <icosahedronGeometry args={[0.76, 1]} />
            {skin(0.95)}
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[i * 0.9, i * 1.3, i * 0.5]}>
              <torusGeometry args={[0.72, 0.055, 5, 14]} />
              <meshStandardMaterial color="#46604F" roughness={0.95} />
            </mesh>
          ))}
          {[-0.45, 0, 0.45].map((x, i) => (
            <Strand key={i} pos={[x, -0.85, 0.15]} len={0.5 + i * 0.14} rot={[0.25, 0, x * 0.5]} color="#46604F" />
          ))}
          <Eyes y={0.2} spread={0.26} size={0.17} />
          <Mouth y={-0.16} w={0.2} />
        </group>
      );

    /* 부서진 부표 — 동그란 몸에 띠, 한쪽이 깨졌다 */
    case 'buoy':
      return (
        <group>
          <mesh><sphereGeometry args={[0.78, 14, 12]} />{skin(0.7)}</mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.79, 0.09, 8, 20]} />
            <meshStandardMaterial color="#C9603F" roughness={0.6} />
          </mesh>
          {/* 깨진 자국 */}
          <mesh position={[-0.42, 0.34, 0.5]} rotation={[0.3, -0.5, 0.7]}>
            <boxGeometry args={[0.3, 0.26, 0.1]} />
            <meshStandardMaterial color="#9C9689" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.2, 6]} />
            <meshStandardMaterial color="#7E7466" roughness={0.8} />
          </mesh>
          <Eyes y={0.1} spread={0.28} size={0.2} />
          <Mouth y={-0.28} w={0.22} />
        </group>
      );

    /* 떠밀려온 페트병 — 병 실루엣 그대로 */
    case 'bottle':
      return (
        <group>
          <mesh position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.44, 0.48, 1.0, 14]} />
            {skin(0.28)}
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.19, 0.42, 0.34, 14]} />
            {skin(0.28)}
          </mesh>
          <mesh position={[0, 0.74, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.18, 12]} />
            <meshStandardMaterial color="#4C86B8" roughness={0.5} />
          </mesh>
          {/* 병에 감긴 라벨 */}
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.465, 0.49, 0.36, 14]} />
            <meshStandardMaterial color="#E8E2D4" roughness={0.85} />
          </mesh>
          <Eyes y={0.16} spread={0.2} size={0.15} look={0.04} />
          <Mouth y={-0.02} w={0.15} />
        </group>
      );

    /* 비닐봉지 뭉치 — 손잡이 두 개가 귀처럼 선다 */
    case 'bag':
      return (
        <group>
          <mesh scale={[1, 0.94, 0.82]}>
            <sphereGeometry args={[0.72, 14, 12]} />
            {skin(0.55)}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0.34 * s, 0.68, 0]} rotation={[0, 0, -s * 0.35]}>
              <torusGeometry args={[0.22, 0.055, 6, 14, Math.PI * 1.25]} />
              {skin(0.55)}
            </mesh>
          ))}
          <Eyes y={0.12} spread={0.27} size={0.19} />
          <Mouth y={-0.24} w={0.24} />
        </group>
      );

    /* 찌그러진 캔 — 가운데가 눌렸다 */
    case 'can':
      return (
        <group>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.44, 0.42, 0.5, 14]} />{skin(0.4)}</mesh>
          <mesh position={[0.05, 0.02, 0]} scale={[0.82, 1, 0.9]}>
            <cylinderGeometry args={[0.36, 0.4, 0.24, 14]} />
            {skin(0.4)}
          </mesh>
          <mesh position={[0, -0.32, 0]}><cylinderGeometry args={[0.42, 0.44, 0.44, 14]} />{skin(0.4)}</mesh>
          {[0.56, -0.55].map((y, i) => (
            <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.42, 0.05, 6, 16]} />
              <meshStandardMaterial color="#8E8272" roughness={0.5} />
            </mesh>
          ))}
          <Eyes y={0.3} spread={0.2} size={0.15} />
          <Mouth y={0.08} w={0.16} />
        </group>
      );

    /* 담배꽁초 더미 — 작은 것 여럿이 뭉쳤다 */
    case 'butt':
      return (
        <group>
          {[[0, 0, 0, 0], [0.3, -0.1, 0.2, 1.1], [-0.28, -0.05, -0.15, -0.8]].map(([x, y, z, r], i) => (
            <group key={i} position={[x, y, z]} rotation={[0.3, r, 0.5]}>
              <mesh><cylinderGeometry args={[0.15, 0.15, 0.5, 10]} />{skin(0.9)}</mesh>
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 0.14, 10]} />
                <meshStandardMaterial color="#E8DFC8" roughness={0.95} />
              </mesh>
            </group>
          ))}
          <Eyes y={0.24} spread={0.22} size={0.16} />
          <Mouth y={0.0} w={0.16} />
        </group>
      );

    /* 몰래 버린 쓰레기 — 자루 더미. 위가 묶여 있다. */
    case 'dump':
      return (
        <group>
          <mesh position={[0, -0.16, 0]} scale={[1.1, 0.86, 1]}>
            <sphereGeometry args={[0.7, 14, 12]} />
            {skin(0.9)}
          </mesh>
          <mesh position={[-0.42, 0.2, 0.2]} scale={[0.7, 0.66, 0.7]}>
            <sphereGeometry args={[0.5, 12, 10]} />
            {skin(0.9)}
          </mesh>
          <mesh position={[0.44, 0.16, -0.1]} scale={[0.62, 0.6, 0.62]}>
            <sphereGeometry args={[0.5, 12, 10]} />
            {skin(0.9)}
          </mesh>
          {/* 묶은 매듭 */}
          <mesh position={[0, 0.56, 0]} rotation={[0, 0, 0.4]}>
            <coneGeometry args={[0.2, 0.36, 6]} />
            {skin(0.9)}
          </mesh>
          <Eyes y={0.02} spread={0.28} size={0.19} />
          <Mouth y={-0.36} w={0.26} />
        </group>
      );

    /* 버려진 타이어 — 굴러다니는 고리. 눈이 구멍 위쪽에 붙는다. */
    case 'tire':
      return (
        <group>
          <mesh rotation={[0.18, 0, 0]}>
            <torusGeometry args={[0.66, 0.29, 10, 22]} />
            {skin(0.95)}
          </mesh>
          {/* 홈 — 타이어처럼 보이게 하는 건 이 결이다 */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} rotation={[0.18, 0, (i * Math.PI) / 3]}>
              <torusGeometry args={[0.66, 0.305, 4, 22, 0.24]} />
              <meshStandardMaterial color="#2A2725" roughness={1} />
            </mesh>
          ))}
          <Eyes y={0.24} spread={0.26} size={0.17} />
          <Mouth y={-0.06} w={0.19} />
        </group>
      );

    /* 일회용 컵 더미 — 컵 두어 개가 쌓이고 빨대가 꽂혔다 */
    case 'cup':
      return (
        <group>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.5, 0.34, 0.9, 16]} />
            {skin(0.8)}
          </mesh>
          <mesh position={[0.36, 0.14, -0.24]} rotation={[0, 0, 0.42]}>
            <cylinderGeometry args={[0.34, 0.24, 0.62, 14]} />
            {skin(0.8)}
          </mesh>
          {/* 뚜껑 */}
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.53, 0.53, 0.1, 16]} />
            <meshStandardMaterial color="#C6BCA8" roughness={0.6} />
          </mesh>
          {/* 빨대 */}
          <mesh position={[0.14, 0.72, 0.05]} rotation={[0.1, 0, -0.3]}>
            <cylinderGeometry args={[0.055, 0.055, 0.72, 8]} />
            <meshStandardMaterial color="#C0503E" roughness={0.5} />
          </mesh>
          <Eyes y={0.0} spread={0.22} size={0.16} />
          <Mouth y={-0.26} w={0.18} />
        </group>
      );

    /* 부러진 우산 — 살이 꺾여 삐죽 나온다 */
    case 'umbrella':
      return (
        <group>
          <mesh position={[0, 0.14, 0]}>
            <sphereGeometry args={[0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {skin(0.85)}
          </mesh>
          {/* 꺾인 살 */}
          {[-1, 1].map((s) => (
            <Strand
              key={s}
              pos={[0.6 * s, 0.28, 0.12 * s]}
              len={0.6}
              rot={[0, 0, s * (Math.PI / 2 - 0.5)]}
              color="#8E8B86"
              thick={0.035}
            />
          ))}
          {/* 자루 */}
          <mesh position={[0, -0.34, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.86, 8]} />
            <meshStandardMaterial color="#6B5B43" roughness={0.85} />
          </mesh>
          <mesh position={[0.16, -0.74, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.16, 0.05, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#6B5B43" roughness={0.85} />
          </mesh>
          <Eyes y={0.02} spread={0.24} size={0.17} />
          <Mouth y={-0.2} w={0.18} />
        </group>
      );

    /* 기름 얼룩 (우두머리) — 넓게 퍼진 검은 덩어리에 방울이 맺힌다 */
    case 'oil':
      return (
        <group>
          <mesh scale={[1.32, 0.72, 1.18]}>
            <icosahedronGeometry args={[1.0, 2]} />
            <meshStandardMaterial
              color={color} roughness={0.12} metalness={0.72}
              emissive="#FFFFFF" emissiveIntensity={0}
            />
          </mesh>
          {/* 무지갯빛 기름막 */}
          <mesh scale={[1.36, 0.75, 1.22]}>
            <icosahedronGeometry args={[1.0, 1]} />
            <meshStandardMaterial
              color="#6E4E86" transparent opacity={0.4}
              roughness={0.05} metalness={0.9} side={THREE.BackSide}
            />
          </mesh>
          {[-0.8, -0.2, 0.45, 0.95].map((x, i) => (
            <mesh key={i} position={[x, -0.62 - (i % 2) * 0.14, 0.35 - i * 0.2]}>
              <sphereGeometry args={[0.14 + (i % 2) * 0.05, 8, 7]} />
              <meshStandardMaterial color={color} roughness={0.1} metalness={0.7} />
            </mesh>
          ))}
          <Eyes y={0.18} spread={0.42} size={0.26} angry look={0.07} />
          <Mouth y={-0.24} w={0.36} open />
        </group>
      );

    /* 매연 구름 (우두머리) — 뭉게뭉게. 굴뚝 연기처럼 겹친다. */
    case 'smog':
      return (
        <group>
          {[
            [0, 0, 0, 1.0], [-0.72, 0.16, 0.1, 0.72], [0.74, 0.1, -0.1, 0.68],
            [0.2, 0.6, 0.2, 0.6], [-0.3, -0.42, -0.2, 0.62],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x, y, z]} scale={s}>
              <icosahedronGeometry args={[0.8, 1]} />
              <meshStandardMaterial
                color={color} roughness={1} transparent opacity={0.94}
                emissive="#FFFFFF" emissiveIntensity={0}
              />
            </mesh>
          ))}
          <Eyes y={0.2} spread={0.4} size={0.25} angry look={0.07} />
          <Mouth y={-0.22} w={0.34} open />
        </group>
      );

    default:
      return (
        <group>
          <mesh><sphereGeometry args={[0.78, 14, 11]} />{skin()}</mesh>
          <Eyes />
          <Mouth />
        </group>
      );
  }
}
