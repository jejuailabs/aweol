'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { WalkerAvatar, FollowCamera, DustPuffs, attachCameraControls, resetControls, type Obstacle, type AvatarCustom, type AvatarTint } from './walker';
import { extractSchoolPalette, DEFAULT_PALETTE, type SchoolPalette } from '@/lib/image-palette';
import SchoolPet from './SchoolPet';
import { playSound } from '@/lib/sound';
import type { PetKind } from '@/lib/firestore-schema';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';

/**
 * 현관 옆에 거는 학교 사진.
 * 텍스처를 직접 로드한다 — 실패해도 액자만 비고 씬은 멀쩡해야 한다.
 */
function SchoolPhoto({ url }: { url: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        setTexture(t);
      },
      undefined,
      () => {}
    );
    return () => { alive = false; };
  }, [url]);

  if (!texture) return null;
  return (
    <mesh position={[0, 0, 0.06]}>
      <planeGeometry args={[2.66, 1.66]} />
      <meshStandardMaterial map={texture} roughness={0.8} />
    </mesh>
  );
}

/**
 * 현관 위 동그란 자리에 거는 교표.
 * 없으면 아무것도 그리지 않아 흰 원(시계)이 그대로 보인다.
 */
function SchoolEmblem({ url }: { url: string }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        setTexture(t);
      },
      undefined,
      () => {}
    );
    return () => { alive = false; };
  }, [url]);

  if (!texture) return null;
  return (
    <mesh position={[0, 0, 0.06]}>
      <circleGeometry args={[0.58, 32]} />
      <meshStandardMaterial map={texture} roughness={0.8} />
    </mesh>
  );
}

// 나무 줄기와 화단 (아래 배치와 같은 좌표)
const SCHOOL_OBSTACLES: Obstacle[] = [
  { x: -10.5, z: -1, halfW: 0.4, halfD: 0.4 },
  { x: 10.5, z: -1.5, halfW: 0.4, halfD: 0.4 },
  { x: -8, z: 4, halfW: 0.35, halfD: 0.35 },
  { x: 12, z: 5, halfW: 0.35, halfD: 0.35 },
  { x: -4.5, z: 3, halfW: 1.35, halfD: 0.65 },
  { x: 4.5, z: 3, halfW: 1.35, halfD: 0.65 },
  { x: 7.5, z: 1, halfW: 0.25, halfD: 0.25 },
  // 기억창고 · 운동장 입구 (아래 SidePlace 배치와 같은 좌표여야 한다)
  { x: -11.5, z: 8.5, halfW: 2.2, halfD: 1.9 },
  { x: 11.5, z: 8.5, halfW: 2.2, halfD: 1.9 },
];

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 문을 눌렀다는 걸 **보이게** 하고 나서 넘어간다.
 *
 * 예전에는 누르는 즉시 화면을 바꿔서, 눌렀는데 아무 일도 안 일어난 것처럼 보였다.
 * 특히 휴대폰은 마우스 올림(hover)이 없어 문에 불도 안 들어오니
 * 아이가 '안 눌렸나?' 하고 다른 걸 누르게 된다.
 *
 * 그래서 세 가지를 준다 — 문에 불, 소리, '들어가는 중' 팻말.
 * 그리고 한 박자(`ENTER_DELAY_MS`) 뒤에 넘어간다. 이 시간이 없으면
 * 불이 켜지기도 전에 화면이 바뀌어 아무것도 못 본다.
 */
const ENTER_DELAY_MS = 260;

function useDoorPress(onEnter?: () => void) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 화면을 떠날 때 예약을 지운다 (사라진 화면으로 보내면 안 된다)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const press = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    // 두 번 눌러도 한 번만 들어간다
    if (pressed || !onEnter) return;
    setPressed(true);
    playSound('open');
    timer.current = setTimeout(onEnter, ENTER_DELAY_MS);
  };

  return { pressed, press };
}

// --------------- 무지개 (마리오 감성) ---------------
function Rainbow() {
  const bands = [
    { r: 13, color: '#FF6B6B' },
    { r: 12.2, color: '#FFD93D' },
    { r: 11.4, color: '#8FD98A' },
    { r: 10.6, color: '#74C7EC' },
  ];
  return (
    <group position={[-16, 0, -22]} rotation={[0, 0.35, 0]}>
      {bands.map((b) => (
        <mesh key={b.color} rotation={[0, 0, 0]}>
          <torusGeometry args={[b.r, 0.35, 10, 40, PI]} />
          <meshStandardMaterial color={b.color} roughness={0.9} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// --------------- 꽃 한 송이 ---------------
function Flower({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.24, 6]} />
        <meshStandardMaterial color="#4FA85E" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = i * (PI * 0.4);
        return (
          <mesh key={i} position={[Math.cos(a) * 0.07, 0.26, Math.sin(a) * 0.07]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.26, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#FFD93D" />
      </mesh>
    </group>
  );
}

// --------------- 땅 + 길 ---------------
function Ground() {
  const flowerSpots: [number, number, string][] = [
    [-7, 6.5, '#FF8FB1'], [-6.2, 7.8, '#FFD93D'], [7.2, 6.8, '#FF8FB1'],
    [6.4, 8, '#C3A6FF'], [-11, 4, '#FFD93D'], [11, 3.5, '#FF8FB1'],
    [-9.5, 8.5, '#C3A6FF'], [9.8, 9, '#FFD93D'],
  ];
  return (
    <group>
      {/* 잔디 — 마리오처럼 쨍한 그린 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#6BCB4F" roughness={0.95} />
      </mesh>

      {/* 뒷동산 (둥근 언덕들) */}
      <mesh position={[-24, -2.5, -20]} scale={[1.6, 1, 1.4]}>
        <sphereGeometry args={[8, 20, 20]} />
        <meshStandardMaterial color="#5BB944" roughness={0.95} />
      </mesh>
      <mesh position={[24, -3.5, -22]} scale={[1.8, 1, 1.5]}>
        <sphereGeometry args={[9, 20, 20]} />
        <meshStandardMaterial color="#6BCB4F" roughness={0.95} />
      </mesh>

      {/* 꽃밭 흩뿌리기 */}
      {flowerSpots.map(([x, z, c], i) => (
        <Flower key={`flw-${i}`} position={[x, 0, z]} color={c} />
      ))}

      {/* 건물 앞 수풀 */}
      {[-10.2, -8.8, 8.8, 10.2].map((x) => (
        <group key={`bush-${x}`} position={[x, 0, -2.2]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <sphereGeometry args={[0.5, 12, 12]} />
            <meshStandardMaterial color="#4FA85E" roughness={0.95} />
          </mesh>
          <mesh position={[0.35, 0.28, 0.1]}>
            <sphereGeometry args={[0.34, 10, 10]} />
            <meshStandardMaterial color="#5FBC6E" roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* 진입로 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.01, 8]}>
        <planeGeometry args={[4.5, 22]} />
        <meshStandardMaterial color="#E8DCC8" roughness={0.9} />
      </mesh>
      {/* 운동장 트랙 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[-14, 0.01, 10]}>
        <circleGeometry args={[8, 32]} />
        <meshStandardMaterial color="#D9A876" roughness={0.9} />
      </mesh>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[-14, 0.02, 10]}>
        <circleGeometry args={[5.5, 32]} />
        <meshStandardMaterial color="#8FD070" roughness={0.95} />
      </mesh>
      {/* 화단 */}
      {([[-4.5, 3], [4.5, 3]] as [number, number][]).map(([x, z]) => (
        <group key={`fb-${x}`} position={[x, 0, z]}>
          <mesh position={[0, 0.15, 0]}>
            <boxGeometry args={[2.6, 0.3, 1.2]} />
            <meshStandardMaterial color="#B08860" />
          </mesh>
          {[-0.8, 0, 0.8].map((fx) => (
            <group key={`f-${fx}`} position={[fx, 0.42, 0]}>
              <mesh>
                <sphereGeometry args={[0.16, 8, 8]} />
                <meshStandardMaterial color={fx === 0 ? '#FF8FB1' : '#FFD93D'} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

export interface SchoolClassItem {
  id: string;
  /**
   * 문패·배너에 적을 이름.
   *
   * **전시관에서는 비어 있을 수 있다.** 전시 주제를 아직 안 정한 것이고,
   * 그때는 배너를 아예 안 건다 — '3-1' 같은 반 번호를 대신 걸면 전시관이
   * 학교처럼 보이고, 관람객에게는 아무 뜻도 없는 숫자다.
   */
  label: string;
  /** 그 전시실에 실제로 걸린 작품 한 점 (전시관 배너용) */
  coverUrl?: string;
}

/**
 * 전시 배너 — 전시관에서 창문 문패를 대신한다.
 *
 * 미술관 건물에 세로로 길게 걸린 천 같은 것. 작은 문패로는 전시 주제가
 * 안 읽히고, 무엇보다 '학교의 반' 처럼 보인다.
 * 눌러도 교실이 아니라 **전시실로 바로** 간다.
 */
function ExhibitBanner({
  label, coverUrl, onClick, delay = 0, x, y,
}: {
  label: string;
  /** 그 전시실에 실제로 걸린 작품 한 점. 없으면 천만 걸린다. */
  coverUrl?: string;
  onClick: () => void;
  delay?: number;
  x: number;
  y: number;
}) {
  const [hot, setHot] = useState(false);
  const { pressed, press } = useDoorPress(onClick);

  return (
    <group position={[x, y, 0]}>
      {/* 천 — 살짝 앞으로 나와 벽에서 뜬다 */}
      <mesh
        position={[0, 0, 0.12]}
        onClick={press}
        onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
      >
        <planeGeometry args={[2.1, 5.4]} />
        <meshStandardMaterial
          color={pressed ? '#F2D9A8' : hot ? '#F7EBD3' : '#FBF7EE'}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 위아래 봉 */}
      {([2.75, -2.75]).map((dy) => (
        <mesh key={dy} position={[0, dy, 0.14]} rotation={[0, 0, HALF_PI]}>
          <cylinderGeometry args={[0.07, 0.07, 2.3, 8]} />
          <meshStandardMaterial color="#8A6038" roughness={0.7} />
        </mesh>
      ))}

      {/* 주제 — 세로로 길게. 그 아래 실제로 걸린 작품 한 점 */}
      <Html position={[0, 0, 0.2]} transform scale={0.3} zIndexRange={[18, 0]} pointerEvents="none">
        <div
          style={{
            width: '150px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
            fontWeight: 900, fontSize: '26px', lineHeight: 1.25, color: '#5B4A3B',
            userSelect: 'none', wordBreak: 'keep-all',
          }}
        >
          {label}
          {/*
            안에 무엇이 걸려 있는지 한 점 보여준다. 이름만 있으면 문을 열기 전까지
            무슨 전시인지 알 수 없다. **작품이 아직 없으면 아무것도 안 건다** —
            빈 액자를 걸면 텅 빈 전시로 보인다.
          */}
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              style={{
                width: '116px', height: '116px', objectFit: 'cover', marginTop: '12px',
                borderRadius: '4px', border: '5px solid #FFFFFF',
                boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              }}
            />
          )}
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#A6762A', marginTop: '10px' }}>
            {pressed ? '들어가는 중...' : '전시 보러 가기 ›'}
          </div>
        </div>
      </Html>

      {/* 흔들리는 느낌 — 정지한 천은 판자처럼 보인다 */}
      <Html position={[0, 3.1, 0.2]} center style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
        <div style={{ fontSize: '15px', animationDelay: `${delay}s` }} className="float-slow">🎨</div>
      </Html>
    </group>
  );
}

// --------------- 창문 문패 (반 입구) ---------------
/**
 * 창문에 걸린 반 문패 = 교실 입구 버튼.
 *
 * 가만히 있으면 장식으로 읽혀서 아무도 누르지 않았다.
 * 그래서 세 가지를 준다 — 살짝 떠오르는 움직임, 뒤로 퍼지는 파동,
 * 그리고 앱의 다른 버튼과 같은 '눌리는 두께감'(globals.css 의 .class-plate).
 * delay 를 문패마다 달리 줘서 다 같이 움직이지 않게 한다(한꺼번에 흔들리면 기계처럼 보인다).
 */
function WindowPlate({
  label,
  onClick,
  delay = 0,
  mine = false,
}: {
  label: string;
  onClick: () => void;
  delay?: number;
  /** 내 반(아이는 자기 반, 선생님은 맡은 반, 학부모는 자녀 반) */
  mine?: boolean;
}) {
  return (
    <Html position={[0, -1.18, 0.1]} transform scale={0.32} zIndexRange={[20, 0]}>
      <button
        className={mine ? 'class-plate class-plate-mine' : 'class-plate'}
        onClick={onClick}
        aria-label={mine ? `우리 반 ${label} 교실 들어가기` : `${label} 교실 들어가기`}
        style={{ animationDelay: `${delay}s` }}
      >
        {mine ? '⭐' : '🚪'} {label}
        <span className="plate-go">›</span>
      </button>
    </Html>
  );
}

// --------------- 학교 건물 ---------------
function SchoolBuilding({
  classes,
  onClassSelect,
  schoolName,
  imageUrl,
  emblemUrl,
  onEnterHall,
  palette,
  myClasses,
  kind,
}: {
  classes: SchoolClassItem[];
  onClassSelect: (id: string) => void;
  schoolName: string;
  imageUrl: string;
  emblemUrl?: string;
  onEnterHall?: () => void;
  palette: SchoolPalette;
  /** 내 반 id 들. 문패를 금색으로 띄운다. */
  myClasses: string[];
  /** 'gallery' 면 창문 문패 대신 전시 배너를 건다 */
  kind: 'school' | 'gallery';
}) {
  const [doorHot, setDoorHot] = useState(false);
  const hallDoor = useDoorPress(onEnterHall);
  const bodyW = 18;
  const bodyH = 6.5;
  const bodyD = 6;

  // 창문 슬롯: 2층 왼→오, 그 다음 1층 왼→오
  const windowSlots: [number, number][] = [
    [-7.5, 4.4], [-5.4, 4.4], [-3.3, 4.4], [3.3, 4.4], [5.4, 4.4], [7.5, 4.4],
    [-7.5, 1.9], [-5.4, 1.9], [-3.3, 1.9], [3.3, 1.9], [5.4, 1.9], [7.5, 1.9],
  ];

  return (
    <group position={[0, 0, -6]}>
      {/* 본관 */}
      <mesh position={[0, bodyH * 0.5, 0]} castShadow>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial color={palette.wall} roughness={0.7} />
      </mesh>
      {/* 지붕 */}
      <mesh position={[0, bodyH + 0.55, 0]}>
        <boxGeometry args={[bodyW + 1, 1.1, bodyD + 1]} />
        <meshStandardMaterial color={palette.roof} roughness={0.6} />
      </mesh>
      {/* 중앙 현관탑 */}
      <mesh position={[0, 3.9, bodyD * 0.5 + 0.6]} castShadow>
        <boxGeometry args={[4.6, 7.8, 1.4]} />
        <meshStandardMaterial color={palette.wallWarm} roughness={0.7} />
      </mesh>
      <mesh position={[0, 8.15, bodyD * 0.5 + 0.6]}>
        <boxGeometry args={[5.2, 0.9, 2]} />
        <meshStandardMaterial color={palette.roofDark} roughness={0.6} />
      </mesh>
      {/* 현관문 — 누르면 '우리 학교' 창이 열린다 */}
      <group
        onClick={hallDoor.press}
        onPointerOver={(e) => { e.stopPropagation(); setDoorHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setDoorHot(false); document.body.style.cursor = 'auto'; }}
      >
        <mesh position={[0, 1.25, bodyD * 0.5 + 1.32]}>
          <boxGeometry args={[2.2, 2.5, 0.12]} />
          <meshStandardMaterial
            color="#8A5A3B"
            roughness={0.5}
            emissive="#E8A33C"
            emissiveIntensity={hallDoor.pressed ? 1 : doorHot ? 0.35 : 0}
          />
        </mesh>
        <mesh position={[0, 1.25, bodyD * 0.5 + 1.39]}>
          <planeGeometry args={[0.9, 1.9]} />
          <meshStandardMaterial color="#5B3A24" />
        </mesh>
        {/* 눌러도 되는 곳이라는 표시. 가리켰을 때, 그리고 누른 직후 */}
        {(doorHot || hallDoor.pressed) && (
          <Html position={[0, 2.85, bodyD * 0.5 + 1.4]} center style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
            <div
              style={{
                background: '#FFF8E7', color: '#6B5B43', fontWeight: 800, fontSize: '16px',
                padding: '6px 14px', borderRadius: '999px', whiteSpace: 'nowrap',
                fontFamily: 'Pretendard, sans-serif', border: '2px solid #EFE3CB',
                boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
              }}
            >
              {hallDoor.pressed ? '🚪 들어가는 중...' : '🚪 우리 학교 들어가기'}
            </div>
          </Html>
        )}
      </group>
      {/* 현관 위 동그란 자리 — 교표를 걸고, 없으면 흰 원으로 남는다 */}
      <group position={[0, 5.6, bodyD * 0.5 + 1.32]}>
        <mesh rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.65, 0.65, 0.1, 24]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
        {emblemUrl && <SchoolEmblem url={emblemUrl} />}
      </group>
      {/* 창문 (반 배정된 창문에는 문패 부착) */}
      {windowSlots.map(([x, y], i) => {
        const cls = classes[i];
        return (
          <group key={`w-${x}-${y}`} position={[x, y, bodyD * 0.5 + 0.02]}>
            <mesh>
              <boxGeometry args={[1.5, 1.6, 0.05]} />
              <meshStandardMaterial color="#FFFFFF" />
            </mesh>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[1.28, 1.38]} />
              <meshStandardMaterial
                color={cls ? '#FFE9A8' : '#9FD4EE'}
                emissive={cls ? '#FFD96B' : '#9FD4EE'}
                emissiveIntensity={cls ? 0.5 : 0.25}
              />
            </mesh>
            {/* 창틀 십자 */}
            <mesh position={[0, 0, 0.04]}>
              <boxGeometry args={[0.05, 1.38, 0.02]} />
              <meshStandardMaterial color="#FFFFFF" />
            </mesh>
            <mesh position={[0, 0, 0.04]}>
              <boxGeometry args={[1.28, 0.05, 0.02]} />
              <meshStandardMaterial color="#FFFFFF" />
            </mesh>
            {cls && kind === 'school' && (
              <WindowPlate
                label={cls.label}
                onClick={() => onClassSelect(cls.id)}
                // 문패마다 시작 시점을 달리해 물결처럼 보이게 (다 같이 흔들리면 기계 같다)
                delay={i * 0.18}
                mine={myClasses.includes(cls.id)}
              />
            )}
          </group>
        );
      })}
      {/*
        전시 배너 — 전시관일 때만. 창문 슬롯과 달리 앞면에 고르게 편다.
        네 개까지만 건다. 더 걸면 서로 겹쳐서 읽히지 않는다.
      */}
      {kind === 'gallery' && classes.filter((c) => c.label.trim()).slice(0, 4).map((cls, i, arr) => {
        const span = bodyW * 0.72;
        const gapX = arr.length > 1 ? span / (arr.length - 1) : 0;
        const x = arr.length > 1 ? -span / 2 + gapX * i : 0;
        return (
          <group key={cls.id} position={[0, 0, bodyD * 0.5 + 0.06]}>
            <ExhibitBanner
              label={cls.label}
              coverUrl={cls.coverUrl}
              onClick={() => onClassSelect(cls.id)}
              delay={i * 0.35}
              x={x}
              y={3.5}
            />
          </group>
        );
      })}

      {/* 학교 간판 — 이름은 반드시 실제 학교에서 온다 (예전엔 애월초로 박혀 있었다) */}
      {/*
        `zIndexRange` 를 빼먹으면 drei 가 z-index 16777271 을 준다.
        그러면 3D 안의 간판이 화면 위 버튼(z-40)까지 덮어버린다 —
        아이폰에서 간판이 '퍼가기' 를 가리고 있었다.
      */}
      <Html
        position={[0, 6.9, bodyD * 0.5 + 1.4]}
        transform
        scale={0.5}
        pointerEvents="none"
        zIndexRange={[10, 0]}
      >
        <div
          style={{
            background: '#FFF8E7', border: '3px solid #B08860', borderRadius: '12px',
            padding: '8px 30px', fontFamily: 'Pretendard, sans-serif', fontWeight: 800,
            fontSize: '30px', color: '#5B4A3B', whiteSpace: 'nowrap', userSelect: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          🏫 {schoolName}
        </div>
      </Html>

      {/*
        현판은 **현관탑 정면**에 건다.
        예전엔 본관 벽 x=-4.4 에 뒀는데, 그 자리는 창문 두 개(-5.4, -3.3) 사이라
        벽에서 0.7 떠서 창문과 반 문패를 가렸다. 현관탑에는 창문이 없어 겹칠 게 없다.
        (문 위 2.5 ~ 시계 아래 4.95 사이가 비어 있다)
      */}
      {imageUrl && (
        <group position={[0, 3.75, bodyD * 0.5 + 0.6 + 0.71]}>
          <mesh castShadow>
            <boxGeometry args={[2.9, 1.9, 0.1]} />
            <meshStandardMaterial color="#B08860" roughness={0.6} />
          </mesh>
          <SchoolPhoto url={imageUrl} />
        </group>
      )}
    </group>
  );
}

/**
 * 학교 옆 작은 건물 하나.
 *
 * 기억창고와 운동장 입구를 **버튼이 아니라 건물로** 세운다.
 * 화면 구석의 버튼은 '메뉴' 지만, 걸어가서 문을 여는 건 '장소' 다.
 * 버튼도 그대로 두는 이유는 이미 길을 아는 아이가 빨리 가고 싶을 때가 있어서다.
 */
function SidePlace({
  position, label, emoji, wall, roof, onEnter,
}: {
  position: [number, number, number];
  label: string;
  emoji: string;
  wall: string;
  roof: string;
  onEnter?: () => void;
}) {
  const [hot, setHot] = useState(false);
  const { pressed, press } = useDoorPress(onEnter);

  return (
    <group position={position}>
      {/* 몸통 */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 3, 3.4]} />
        <meshStandardMaterial color={wall} roughness={0.85} />
      </mesh>
      {/* 맞배지붕 */}
      <mesh position={[0, 3.4, 0]} rotation={[0, HALF_PI, 0]} castShadow>
        <cylinderGeometry args={[2.1, 2.1, 4.4, 3, 1, false, 0, PI]} />
        <meshStandardMaterial color={roof} roughness={0.7} />
      </mesh>
      {/* 판자 무늬 — 창고 느낌 */}
      {([-1.2, -0.4, 0.4, 1.2]).map((x) => (
        <mesh key={x} position={[x, 1.5, 1.72]}>
          <boxGeometry args={[0.06, 2.8, 0.03]} />
          <meshStandardMaterial color={roof} opacity={0.35} transparent />
        </mesh>
      ))}

      {/* 문 */}
      <group
        onClick={press}
        onPointerOver={(e) => { e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHot(false); document.body.style.cursor = 'auto'; }}
      >
        <mesh position={[0, 0.95, 1.74]} scale={pressed ? 0.94 : 1}>
          <boxGeometry args={[1.5, 1.9, 0.1]} />
          {/* 누르면 확 밝아진다 — 휴대폰에는 hover 가 없어 이게 유일한 신호다 */}
          <meshStandardMaterial
            color="#8A5A3B"
            emissive="#E8A33C"
            emissiveIntensity={pressed ? 1 : hot ? 0.45 : 0}
          />
        </mesh>
        <mesh position={[0.48, 0.95, 1.81]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#E8C86A" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* 명패 — 벽에 붙은 나무 팻말 */}
      <Html position={[0, 2.45, 1.76]} transform scale={0.3} pointerEvents="none" zIndexRange={[5, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#5B4A3B', fontWeight: 900, fontSize: '30px',
            padding: '8px 26px', borderRadius: '10px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', border: '4px solid #8A6038',
            boxShadow: '0 5px 0 #6B4A2B', userSelect: 'none',
          }}
        >
          {emoji} {label}
        </div>
      </Html>

      {(hot || pressed) && (
        <Html position={[0, 3.9, 1.8]} center style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
          <div
            style={{
              background: '#FFF8E7', color: '#6B5B43', fontWeight: 800, fontSize: '15px',
              padding: '5px 12px', borderRadius: '999px', whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif',
              border: pressed ? '2px solid #E8A33C' : '2px solid #EFE3CB',
            }}
          >
            {pressed ? '들어가는 중...' : '들어가기'}
          </div>
        </Html>
      )}
    </group>
  );
}

// --------------- 깃대 ---------------
function FlagPole() {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.18;
    }
  });
  return (
    <group position={[7.5, 0, 1]}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 6, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={flagRef} position={[0.62, 5.55, 0]}>
        <planeGeometry args={[1.2, 0.75]} />
        <meshStandardMaterial color="#FFFFFF" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// --------------- 나무 ---------------
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.8, 8]} />
        <meshStandardMaterial color="#8A5A3B" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <sphereGeometry args={[1.05, 12, 12]} />
        <meshStandardMaterial color="#4FA85E" roughness={0.95} />
      </mesh>
      <mesh position={[0.55, 2.7, 0.15]}>
        <sphereGeometry args={[0.65, 10, 10]} />
        <meshStandardMaterial color="#5FBC6E" roughness={0.95} />
      </mesh>
      <mesh position={[-0.5, 2.65, -0.1]}>
        <sphereGeometry args={[0.55, 10, 10]} />
        <meshStandardMaterial color="#3E8E4D" roughness={0.95} />
      </mesh>
    </group>
  );
}

// --------------- 구름 ---------------
function Cloud({ position, speed = 0.2 }: { position: [number, number, number]; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const startX = position[0];
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.x = startX + Math.sin(state.clock.elapsedTime * speed) * 3;
    }
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[1.1, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" roughness={1} />
      </mesh>
      <mesh position={[1, 0.15, 0]}>
        <sphereGeometry args={[0.8, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" roughness={1} />
      </mesh>
      <mesh position={[-1, 0.1, 0]}>
        <sphereGeometry args={[0.75, 10, 10]} />
        <meshStandardMaterial color="#FFFFFF" roughness={1} />
      </mesh>
    </group>
  );
}

// --------------- 메인 ---------------
export default function SchoolScene({
  classes = [],
  onClassSelect = () => {},
  avatarId,
  avatarCustom,
  avatarTint,
  schoolName = '학교',
  emblemUrl,
  onEnterHall,
  onEnterArchive,
  onEnterTrack,
  schoolId,
  me,
  pet,
  onPetClick,
  imageUrl = '',
  myClasses = [],
  kind = 'school',
}: {
  /** 'gallery' 면 문패 대신 배너를 걸고, 눌렀을 때 전시실로 바로 간다 */
  kind?: 'school' | 'gallery';
  classes?: SchoolClassItem[];
  /** 내 반 id 들 — `myClassIds(userDoc)` 로 만든다. 문패가 금색이 된다. */
  myClasses?: string[];
  onClassSelect?: (id: string) => void;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  schoolName?: string;
  emblemUrl?: string;
  onEnterHall?: () => void;
  /** 기억창고 건물 문 */
  onEnterArchive?: () => void;
  /** 운동장 가는 문 */
  onEnterTrack?: () => void;
  schoolId: string;
  /** 같이 있는 친구들을 보려면 준다. 로그인 안 했으면 없다. */
  me?: { uid: string; look: PeerLook } | null;
  /** 학교 동물. 아직 안 들였으면 없다 */
  pet?: { kind: PetKind; name: string; needEmoji: string } | null;
  onPetClick?: () => void;
  imageUrl?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 11));
  const avatarYaw = useRef(0);

  // 학교 그림에서 벽·지붕 색을 뽑는다. 못 뽑으면 기본 색 그대로.
  const [palette, setPalette] = useState<SchoolPalette>(DEFAULT_PALETTE);
  useEffect(() => {
    let alive = true;
    extractSchoolPalette(imageUrl).then((p) => { if (alive) setPalette(p); });
    return () => { alive = false; };
  }, [imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
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
    const t1 = setTimeout(fix, 120);
    const t2 = setTimeout(fix, 500);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // 드래그 회전 + 핀치/휠 줌
  useEffect(() => {
    resetControls(0, 11, 0.3);
    const el = containerRef.current;
    if (!el) return;
    return attachCameraControls(el, { minDist: 5, maxDist: 26 });
  }, []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 9, 26], fov: 50, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'linear-gradient(180deg, #6EC6F0 0%, #A8DDF5 45%, #D8F0FB 100%)',
        }}
      >
        <ambientLight intensity={0.65} color="#FFF8E7" />
        <directionalLight position={[10, 14, 8]} intensity={1.1} color="#FFF4DC" castShadow />
        <Ground />
        <Rainbow />
        <SchoolBuilding
          classes={classes}
          onClassSelect={onClassSelect}
          schoolName={schoolName}
          emblemUrl={emblemUrl}
          onEnterHall={onEnterHall}
          imageUrl={imageUrl}
          palette={palette}
          myClasses={myClasses}
          kind={kind}
        />
        <FlagPole />
        <Tree position={[-10.5, 0, -1]} scale={1.15} />
        <Tree position={[10.5, 0, -1.5]} scale={1.05} />
        <Tree position={[-8, 0, 4]} scale={0.85} />
        <Tree position={[12, 0, 5]} scale={0.9} />

        {/* 왼쪽 — 기억창고 */}
        <SidePlace
          position={[-11.5, 0, 8.5]}
          label="기억창고"
          emoji="📦"
          wall="#E8D7BC"
          roof="#A9865E"
          onEnter={onEnterArchive}
        />
        {/* 오른쪽 — 운동장 가는 문 */}
        <SidePlace
          position={[11.5, 0, 8.5]}
          label="운동장"
          emoji="🏃"
          wall="#DCEBD8"
          roof="#5FA85C"
          onEnter={onEnterTrack}
        />
        <Cloud position={[-9, 12, -14]} speed={0.14} />
        <Cloud position={[7, 13.5, -16]} speed={0.1} />
        <Cloud position={[0, 11, -12]} speed={0.18} />
        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -14, xMax: 14, zMin: -1.5, zMax: 16 }}
          start={[0, 0, 11]}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={SCHOOL_OBSTACLES}
        />
        {me && (
          <Peers
            schoolId={schoolId}
            roomKey="school"
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
          />
        )}
        {pet && (
          <SchoolPet
            kind={pet.kind}
            name={pet.name}
            needEmoji={pet.needEmoji}
            // 아바타 위치를 줘야 피하기도 하고 말도 건다
            avatarPos={avatarPos}
            onClick={onPetClick}
          />
        )}
        <DustPuffs />
        <FollowCamera
          avatarPos={avatarPos}
          lookHeight={2.2}
          introFrom={[0, 9, 26]}
          introLook={[0, 3.2, -6]}
        />
      </Canvas>
    </div>
  );
}
