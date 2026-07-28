'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import {
  BANNER_SLOTS, PHASE_COLOR, showPeriod, themeOf, type HallDoc, type ShowDoc,
} from '@/lib/art-hall';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';
import { startGalleryMusic } from '@/lib/gallery-music';
/**
 * 광장·건물 크기와 **양식별 외관·마당·조형물**은 한 곳에서 온다.
 * 두 군데 적어두면 건물을 옮길 때 반드시 한쪽이 낡는다.
 */
import {
  PLAZA_W, PLAZA_D, FACADE_Z, FACADE_W, FACADE_H,
  Plaza, PlazaProps, StyledFacade,
} from './ArtHallStyles';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 개인 전시관 **바깥** — 미술관 앞 광장.
 *
 * 학교(`SchoolScene`)와 **일부러 다르게 만든다.** 학교는 아기자기하고 둥글다 —
 * 무지개가 뜨고 구름이 흐른다. 미술관은 그러면 안 된다. 전시를 보러 온 사람에게
 * 필요한 것은 **조용하고 반듯한 앞마당**이다.
 *
 * 그래서 이 화면은 세 가지를 지킨다.
 * 1. **곧은 선.** 화강암 바닥의 눈금, 늘어선 기둥, 반듯한 계단.
 * 2. **차분한 색.** 회백색 돌과 유리. 원색은 배너에만 쓴다.
 * 3. **배너가 주인공.** 건물은 배경이고, 눈이 가야 하는 것은 지금 열린 전시다.
 *
 * 실제 미술관 앞이 그렇다 — 건물은 조용하고 배너만 크게 걸려 있다.
 */


/**
 * 그림 한 장을 3D 판에 입힌다.
 *
 * **텍스처로 넣는다.** `Html` 로 `<img>` 를 띄우면 기둥 뒤에 서 있어도
 * 그림이 앞에 뜬다(DOM 은 3D 깊이를 모른다). 배너는 건물 앞에 늘어서 있어서
 * 서로 가리는 일이 잦다 — 그때 뒤엣것이 앞에 보이면 자리가 어디인지 알 수 없다.
 */
function ImagePlane({
  url, w, h, position, rotation,
}: {
  url: string;
  w: number;
  h: number;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) { setTex(null); return; }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      url,
      (t) => {
        if (!alive) { t.dispose(); return; }
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
      },
      undefined,
      // 못 받아도 화면은 멀쩡해야 한다 — 그림만 안 걸린다
      () => {}
    );
    return () => { alive = false; };
  }, [url]);

  // 텍스처는 컴포넌트가 사라질 때 직접 버린다 (three 는 GC 를 안 탄다)
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  if (!tex) return null;
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.85} toneMapped={false} />
    </mesh>
  );
}

/**
 * 세로 배너 — **이 화면의 주인공.**
 *
 * 실제 미술관 앞에 걸린 그것이다: 두 기둥 사이에 길게 늘어뜨린 천,
 * 위에 전시 제목, 아래 대표 이미지 한 장.
 *
 * **눌러서 들어간다.** 눌러보라고 적어 놓고 안 눌리면 안 되므로,
 * 천과 이미지와 아래 팻말이 **전부 같은 손잡이**를 갖는다
 * (마을 건물 입구에서 배운 것과 같다).
 */
function Banner({
  x, show, accent, onEnter,
}: {
  x: number;
  show: ShowDoc & { id: string };
  accent: string;
  onEnter: () => void;
}) {
  const [hot, setHot] = useState(false);
  const cloth = useRef<THREE.Group>(null);
  /** 지금이 전시 기간의 어느 때인가 — 띠 글자와 색이 여기서 나온다 */
  const period = useMemo(() => showPeriod(show), [show]);

  useFrame(({ clock }) => {
    // 아주 살짝 흔들린다 — 멈춘 천은 판자로 보인다
    if (cloth.current) {
      cloth.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + x) * 0.012;
    }
  });

  const press = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onEnter(); };
  const over = (e: { stopPropagation: () => void }) => {
    e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer';
  };
  const out = () => { setHot(false); document.body.style.cursor = 'auto'; };
  const grab = { onClick: press, onPointerOver: over, onPointerOut: out };

  const BW = 2.6;
  const BH = 7.4;

  return (
    <group position={[x, 0, -9]}>
      {/* 기둥 둘 + 받침 */}
      {([-BW / 2 - 0.28, BW / 2 + 0.28] as const).map((px) => (
        <group key={px}>
          <mesh position={[px, 5.1, 0]} castShadow {...grab}>
            <cylinderGeometry args={[0.11, 0.13, 10.2, 10]} />
            <meshStandardMaterial color="#6F6A64" metalness={0.45} roughness={0.4} />
          </mesh>
          <mesh position={[px, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.5, 0.28, 12]} />
            <meshStandardMaterial color="#57534E" metalness={0.3} roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* 위아래 가로대 */}
      {([9.9, 9.9 - BH] as const).map((py) => (
        <mesh key={py} position={[0, py, 0]} rotation={[0, 0, HALF_PI]} castShadow {...grab}>
          <cylinderGeometry args={[0.07, 0.07, BW + 0.7, 8]} />
          <meshStandardMaterial color="#6F6A64" metalness={0.45} roughness={0.4} />
        </mesh>
      ))}

      <group ref={cloth} position={[0, 9.9 - BH / 2, 0]}>
        {/* 천 — 가리키면 살짝 밝아진다 */}
        <mesh {...grab} castShadow>
          <planeGeometry args={[BW, BH]} />
          <meshStandardMaterial
            color={hot ? '#FFFFFF' : '#F7F5F1'}
            side={THREE.DoubleSide}
            roughness={0.92}
          />
        </mesh>
        {/* 위쪽 색 띠 — 전시관 색으로 */}
        <mesh position={[0, BH / 2 - 0.55, 0.012]}>
          <planeGeometry args={[BW, 1.1]} />
          <meshStandardMaterial color={accent} roughness={0.8} />
        </mesh>

        {/*
          전시 기간 띠 — **배너 아래쪽에 가로로 두른다.**

          실제 미술관 배너에도 기간이 늘 붙는다. 이름만 걸면 지금 볼 수 있는
          것인지, 다음 달에 여는 것인지 알 수 없다. 때에 따라 색이 바뀐다 —
          예정은 주황, 전시 중은 초록, 끝난 것은 회색.
        */}
        <mesh position={[0, -BH / 2 + 1.5, 0.012]}>
          <planeGeometry args={[BW, 0.86]} />
          <meshStandardMaterial color={PHASE_COLOR[period.phase]} roughness={0.85} />
        </mesh>
        <Html
          position={[0, -BH / 2 + 1.5, 0.02]}
          transform
          scale={0.2}
          pointerEvents="none"
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              width: '230px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none', color: '#FFFFFF', lineHeight: 1.25,
            }}
          >
            <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.02em' }}>
              {period.badge}
            </div>
            {period.note && (
              <div style={{ fontSize: '15px', fontWeight: 700, opacity: 0.92 }}>
                {period.note}
              </div>
            )}
          </div>
        </Html>

        {/* 대표 이미지 한 장 — 이름만 걸면 무슨 전시인지 알 수 없다 */}
        {show.posterUrl && (
          <ImagePlane
            url={show.posterUrl}
            w={BW - 0.5}
            h={BW - 0.5}
            position={[0, -0.5, 0.014]}
          />
        )}

        {/* 제목 — 천 위에 얹는다 */}
        <Html
          position={[0, BH / 2 - 1.55, 0.02]}
          transform
          scale={0.22}
          pointerEvents="none"
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              width: '210px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none', color: '#2A2724',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#8A8378', letterSpacing: '0.08em' }}>
              {show.subtitle || 'EXHIBITION'}
            </div>
            <div style={{ fontSize: '30px', fontWeight: 900, lineHeight: 1.2, marginTop: '4px', wordBreak: 'keep-all' }}>
              {show.title}
            </div>
          </div>
        </Html>

        {/* 아래 안내 — 몇 점인지와 '들어가기' */}
        <Html
          position={[0, -BH / 2 + 0.75, 0.02]}
          transform
          scale={0.2}
          pointerEvents="none"
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              width: '220px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#8A8378' }}>
              작품 {show.workCount ?? 0}점
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: accent, marginTop: '3px' }}>
              보러 가기 ›
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

/*
  옛 Fountain·Sculpture·PlazaTree·Facade 는 `ArtHallStyles.tsx` 로 옮겼다.

  여기 있을 때는 **양식이 하나뿐**이라 색만 갈아 끼웠다 — 셋 다 같은 건물에
  페인트만 다시 칠한 것이었다. 이제 다섯 양식이 저마다 다른 건물·마당·조형물을
  들고 있어서, 한 파일에 두면 이 파일이 천 줄을 넘는다.
*/

export default function ArtHallScene({
  hall, hallId, me, shows, avatarId, avatarCustom, avatarTint, onEnterShow, onExit, children,
}: {
  hall: HallDoc;
  /** 방 이름을 만드는 데 쓴다 — 전시관마다 따로 모인다 */
  hallId: string;
  /**
   * 나 — **없으면 친구도 안 보인다.**
   * 로그인해야 남에게 내 자리를 알릴 수 있고, 알리지 않으면 받기만 하는 셈이라
   * 서로 안 보이는 것이 맞다.
   */
  me?: { uid: string; look: PeerLook } | null;
  shows: (ShowDoc & { id: string })[];
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onEnterShow: (showId: string) => void;
  onExit: () => void;
  /** 화면 위에 얹는 것 (3D 밖이라 여기로 받는다) */
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 20));
  const avatarYaw = useRef(0);

  const t = themeOf(hall.theme);
  /** 배너 색 — 양식이 정한다(`art-hall.ts`). 여기서 또 적으면 반드시 어긋난다. */
  const accent = t.accent;

  /**
   * 광장 배경음악 — 전시관마다 다른 곡.
   * 전시실 안(`ArtShowScene`)과 **다른 씨앗**을 쓴다. 밖과 안이 같은 곡이면
   * 문을 열고 들어가도 아무 일도 안 일어난 것 같다.
   */
  useEffect(() => {
    /**
     * **음악이 광장을 막으면 안 된다.**
     * 여기서 던진 오류로 전시관 화면이 통째로 안 열린 적이 있다(2026-07).
     * 배경음악은 있으면 좋은 것이지 없으면 안 되는 것이 아니다.
     */
    let m: ReturnType<typeof startGalleryMusic> = null;
    try { m = startGalleryMusic(`hall:${hallId}`, t.ambient < 0.4); } catch { m = null; }
    return () => { try { m?.stop(); } catch {} };
  }, [hallId, t.ambient]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 16, 0.3);
    return attachCameraControls(el, { minDist: 8, maxDist: 40 });
  }, []);

  /** 배너가 걸리는 자리 — 가운데를 비우고 좌우로 벌린다(현관 길을 막지 않는다) */
  const banners = useMemo(() => {
    const list = shows.slice(0, BANNER_SLOTS);
    if (list.length === 0) return [];
    // 좌우 대칭으로 벌린다. 한 개면 왼쪽에 하나만 — 가운데는 현관 길이다.
    const span = 22;
    const step = list.length === 1 ? 0 : (span * 2) / (list.length - 1);
    return list.map((s, i) => ({
      show: s,
      x: list.length === 1 ? -13 : -span + step * i,
    }));
  }, [shows]);

  /** 몸이 못 지나가는 것들 */
  const obstacles = useMemo<Obstacle[]>(() => [
    // 분수
    { x: 0, z: 7, halfW: 5.4, halfD: 5.4 },
    // 조각 좌대
    { x: -21, z: 1, halfW: 1.2, halfD: 1.2 },
    { x: 21, z: 1, halfW: 1.2, halfD: 1.2 },
    // 건물 앞면 (계단 위로는 못 올라간다 — 안은 전시실이 따로 있다)
    { x: 0, z: FACADE_Z + 1, halfW: FACADE_W / 2, halfD: 8 },
    // 열주
    ...[-17.5, -12.5, -7.5, 7.5, 12.5, 17.5].map((cx) => ({
      x: cx, z: FACADE_Z + 2.6, halfW: 1, halfD: 1,
    })),
    // 배너 기둥
    ...banners.map((b) => ({ x: b.x, z: -9, halfW: 1.9, halfD: 0.4 })),
    // 가로수
    ...[-26, 26].flatMap((tx) => [-6, 4, 14].map((tz) => ({
      x: tx, z: tz, halfW: 1.5, halfD: 1.5,
    }))),
  ], [banners]);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 12, 34], fov: 52, near: 0.5, far: 400 }}
        dpr={[1, 2]}
        style={{
          position: 'absolute', inset: 0,
          // 하늘도 양식이 정한다 — 물가 건물과 신전은 같은 하늘 아래 서지 않는다
          background: t.sky,
        }}
      >
        <hemisphereLight args={['#E8F0F6', '#9E9890', 0.7]} />
        <ambientLight intensity={t.ambient * 0.5} />
        <directionalLight
          position={[26, 40, 22]}
          intensity={t.ambient < 0.4 ? 0.6 : 1.05}
          color="#FFF6E6"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
          shadow-bias={-0.0005}
        />

        {/* 마당 — 무늬가 양식마다 다르다 (격자·벽돌·박석·물결·방사형) */}
        <Plaza spec={t} />

        {/* 건물 — 신전·하이테크·한옥·티타늄·피라미드 */}
        <StyledFacade spec={t} />

        {/* 마당에 놓는 것 — 분수/수반·조형물·나무·석등·벤치 */}
        <PlazaProps spec={t} />

        {/*
          전시관 이름 — **건물 앞면에 새긴 것처럼.**
          건물 모양이 양식마다 달라서 여기(씬)에 둔다 — 양식 파일에 두면
          다섯 곳에 같은 글자를 다섯 번 적게 된다.
        */}
        <group>
          <Html
            position={[0, t.arch === 'pyramid' ? 12.6 : 12.9, FACADE_Z + 3.9]}
            transform
            scale={0.62}
            pointerEvents="none"
            zIndexRange={[7, 0]}
          >
            <div
              style={{
                fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                color: t.ambient < 0.4 ? '#E8E4DC' : '#4A453E',
                fontWeight: 900, fontSize: '26px',
                letterSpacing: '0.14em', whiteSpace: 'nowrap',
              }}
            >
              {hall.title}
            </div>
          </Html>
          <Html
            position={[0, t.arch === 'pyramid' ? 11.6 : 11.9, FACADE_Z + 3.9]}
            transform
            scale={0.4}
            pointerEvents="none"
            zIndexRange={[7, 0]}
          >
            <div
              style={{
                fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
                color: accent, fontWeight: 700, fontSize: '18px',
                letterSpacing: '0.2em', whiteSpace: 'nowrap',
              }}
            >
              {hall.placeName || hall.ownerName}
            </div>
          </Html>
        </group>

        {/* 전시 배너 */}
        {banners.map((b) => (
          <Banner
            key={b.show.id}
            x={b.x}
            show={b.show}
            accent={accent}
            onEnter={() => onEnterShow(b.show.id)}
          />
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -30, xMax: 30, zMin: -14, zMax: 26 }}
          start={[0, 0, 20]}
          maxSpeed={5}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={obstacles}
        />

        {/*
          같이 온 사람들 — **전시관마다 따로 모인다.**

          그동안 개인 전시관에는 이게 아예 없어서, 같은 시간 같은 광장에 서 있어도
          서로 안 보였다(학교 화면들에만 붙어 있었다). 전시는 같이 보는 재미가 큰데
          혼자 걷는 곳이 되어 있었다.

          방 이름은 `halls / hall-{전시관}` 이다 — 학교와 자리가 겹치지 않게
          맨 앞을 나눠 둔다.
        */}
        {me && (
          <Peers
            schoolId="halls"
            roomKey={`hall-${hallId}`}
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
          />
        )}

        <FollowCamera avatarPos={avatarPos} lookHeight={2} />
      </Canvas>

      <button
        onClick={onExit}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 지도로
      </button>

      {children}
    </div>
  );
}
