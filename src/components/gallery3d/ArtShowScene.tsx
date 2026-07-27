'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import {
  hallSlots, ROOM_W, ROOM_D, ROOM_H,
  PARTITION_Z, PARTITION_W, PARTITION_H,
} from '@/lib/hall-layout';
import { themeOf, type HallTheme, type ShowDoc, type WorkDoc } from '@/lib/art-hall';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 개인 전시실 **안** — 미술관 전시장.
 *
 * 학교 전시실(`Gallery3DView`)과 다른 방이다. 학교 것은 한 반 서른 명을
 * 다 걸어야 해서 두 줄로 빽빽하고, 벽도 아기자기하다.
 *
 * 여기는 **미술관이다.** 지키는 것이 셋이다.
 * 1. **천장이 높다**(6.2m). 낮은 방은 교실이고, 높은 방은 전시장이다.
 * 2. **벽이 비어 있다.** 장식을 안 넣는다 — 벽이 조용해야 그림이 보인다.
 * 3. **작품마다 이름표.** 미술관에서 그림 옆 작은 판을 읽는 그 경험이
 *    전시를 보는 일의 절반이다.
 */

/** 작품 한 점 — 액자·그림·이름표가 한 벌이다 */
function Artwork({
  work, pos, rot, maxW, frameColor, captionColor, onSelect,
}: {
  work: WorkDoc & { id: string };
  pos: [number, number, number];
  rot: [number, number, number];
  maxW: number;
  frameColor: string;
  captionColor: string;
  onSelect: () => void;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [hot, setHot] = useState(false);

  const url = work.thumbnailUrl || work.imageUrl;
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
      () => {}
    );
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  /**
   * **그림 비율을 지킨다.**
   *
   * 세로 사진을 가로 액자에 우겨 넣으면 사람 얼굴이 납작해진다. 학교 전시실은
   * 액자 크기가 고정이라 그랬는데, 사진전에서는 그게 곧 작품 훼손이다.
   * 그래서 받아온 그림의 실제 비율로 액자를 만든다.
   */
  const { w, h } = useMemo(() => {
    const img = tex?.image as { width?: number; height?: number } | undefined;
    const ratio = img?.width && img?.height ? img.width / img.height : 1;
    const maxH = 2.1;
    let ww = maxW;
    let hh = ww / ratio;
    if (hh > maxH) { hh = maxH; ww = hh * ratio; }
    return { w: ww, h: hh };
  }, [tex, maxW]);

  const press = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(); };
  const over = (e: { stopPropagation: () => void }) => {
    e.stopPropagation(); setHot(true); document.body.style.cursor = 'pointer';
  };
  const out = () => { setHot(false); document.body.style.cursor = 'auto'; };
  const grab = { onClick: press, onPointerOver: over, onPointerOut: out };

  return (
    <group position={pos} rotation={rot}>
      {/*
        벽에 진 빛 — **조명을 진짜로 켜지 않는다.**
        작품마다 스포트라이트를 켜면 스물다섯 개 광원이 되어 휴대폰이 못 버틴다.
        대신 빛이 닿은 자리를 옅은 판으로 그린다 — 눈에는 똑같이 보인다.
      */}
      <mesh position={[0, 0.35, 0.006]}>
        <planeGeometry args={[w + 1.9, h + 2.4]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={hot ? 0.14 : 0.07} />
      </mesh>

      {/* 액자 */}
      <mesh position={[0, 0, 0.02]} castShadow {...grab}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.07]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* 매트(그림 둘레 흰 여백) — 이게 있으면 값이 달라 보인다 */}
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[w + 0.08, h + 0.08]} />
        <meshStandardMaterial color="#FBFAF8" roughness={0.9} />
      </mesh>
      {/* 그림 */}
      {tex && (
        <mesh position={[0, 0, 0.06]} {...grab}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial map={tex} roughness={0.86} toneMapped={false} />
        </mesh>
      )}

      {/*
        이름표 — 작품 오른쪽 아래. 미술관이 늘 그 자리에 붙인다.
        `transform` 이라 멀면 작아진다 — 다가가야 읽히는 것도 전시의 일부다.
      */}
      <Html
        position={[w / 2 + 0.42, -h / 2 + 0.1, 0.03]}
        transform
        scale={0.13}
        pointerEvents="none"
        zIndexRange={[6, 0]}
      >
        <div
          style={{
            width: '150px', fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
            color: captionColor, lineHeight: 1.35,
          }}
        >
          <div style={{ fontSize: '17px', fontWeight: 800, wordBreak: 'keep-all' }}>
            {work.title || '무제'}
          </div>
          {work.takenAt && (
            <div style={{ fontSize: '13px', opacity: 0.72, marginTop: '2px' }}>
              {work.takenAt}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/**
 * 전시 대표 이미지 — **제목 바로 아래, 크게.**
 *
 * 실제 미술관 입구 벽에는 전시 제목과 함께 대표 이미지가 크게 걸린다.
 * 그동안은 글씨만 있어서 들어서자마자 무슨 전시인지 그림으로 오지 않았고,
 * 뒷벽 위쪽이 휑했다.
 *
 * **비율은 그림이 정한다.** 액자를 먼저 정해두고 우겨 넣으면 세로 사진이
 * 납작해진다 — 작품 액자에서 이미 겪은 것과 같은 잘못이다.
 * 가로로도 세로로도 정해둔 크기를 넘지 않는 선에서 원래 비율을 지킨다.
 */
function PosterWall({ url, frameColor }: { url: string; frameColor: string }) {
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
      () => {}
    );
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => { tex?.dispose(); }, [tex]);

  const { w, h } = useMemo(() => {
    const img = tex?.image as { width?: number; height?: number } | undefined;
    const ratio = img?.width && img?.height ? img.width / img.height : 1.5;
    /**
     * 뒷벽에서 이만큼까지 쓴다.
     *
     * **작품 위를 침범하면 안 된다.** 작품이 많아 두 줄로 걸리면 윗줄 한가운데가
     * 2.45m 이고 액자가 2.1m 까지 커지므로 위 끝이 3.5m 다(`hall-layout.ts`).
     * 그래서 대표 이미지는 3.65m 위에만 선다. 천장은 6.2m 라 자리는 넉넉하다.
     */
    const maxW = 4.8;
    const maxH = 1.4;
    let ww = maxW;
    let hh = maxW / ratio;
    if (hh > maxH) { hh = maxH; ww = maxH * ratio; }
    return { w: ww, h: hh };
  }, [tex]);

  if (!tex) return null;

  return (
    <group position={[0, 4.35, -ROOM_D / 2 + 0.07]}>
      {/* 테두리 — 벽과 그림 사이를 끊어줘야 '걸린 것' 으로 보인다 */}
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[w + 0.16, h + 0.16]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0.12} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 천장 조명 레일과 등 — 켜진 광원이 아니라 '있어 보이는' 기구다 */
function TrackLights({ dark }: { dark: boolean }) {
  return (
    <group>
      {([-7, 0, 7] as const).map((x) => (
        <group key={x}>
          <mesh position={[x, ROOM_H - 0.16, 0]}>
            <boxGeometry args={[0.1, 0.1, ROOM_D - 2]} />
            <meshStandardMaterial color="#57534E" metalness={0.7} roughness={0.35} />
          </mesh>
          {([-6, -2, 2, 6] as const).map((z) => (
            <group key={z} position={[x, ROOM_H - 0.42, z]} rotation={[0.42, 0, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.13, 0.17, 0.42, 10]} />
                <meshStandardMaterial color="#3A3630" metalness={0.6} roughness={0.4} />
              </mesh>
              <mesh position={[0, -0.22, 0]}>
                <circleGeometry args={[0.13, 12]} />
                <meshBasicMaterial color={dark ? '#FFE9B8' : '#FFF8E4'} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

export default function ArtShowScene({
  show, works, theme, hallTitle, avatarId, avatarCustom, avatarTint, onSelect, onExit, children,
}: {
  show: ShowDoc & { id: string };
  works: (WorkDoc & { id: string })[];
  theme: HallTheme;
  hallTitle: string;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onSelect: (work: WorkDoc & { id: string }) => void;
  onExit: () => void;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, ROOM_D / 2 - 3));
  const avatarYaw = useRef(0);

  const t = themeOf(theme);
  const dark = theme === 'dark';

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 11, 0.28);
    return attachCameraControls(el, { minDist: 5, maxDist: 22 });
  }, []);

  const slots = useMemo(() => hallSlots(works.length), [works.length]);

  const obstacles = useMemo<Obstacle[]>(() => [
    // 가운데 가림벽
    { x: 0, z: PARTITION_Z, halfW: PARTITION_W / 2, halfD: 0.4 },
    // 가운데 긴 의자
    { x: 0, z: -3.5, halfW: 1.8, halfD: 0.55 },
  ], []);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 4.5, 13], fov: 52, near: 0.1, far: 120 }}
        dpr={[1, 2]}
        style={{ position: 'absolute', inset: 0, background: t.ceiling }}
      >
        {/*
          조명 — **작품마다 켜지 않는다.** 스물다섯 개 광원은 휴대폰이 못 버틴다.
          위에서 고르게 내리는 빛 하나와 은은한 환경광으로 두고,
          작품 자리의 밝기는 벽에 그린 '빛 자국'이 맡는다.
        */}
        <hemisphereLight args={[dark ? '#6E6A72' : '#FFFFFF', t.floor, dark ? 0.5 : 0.85]} />
        <ambientLight intensity={t.ambient} />
        <directionalLight
          position={[0, 12, 6]}
          intensity={dark ? 0.35 : 0.6}
          color="#FFF8E8"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0006}
        />

        {/* 바닥 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[ROOM_W, ROOM_D]} />
          <meshStandardMaterial color={t.floor} roughness={dark ? 0.5 : 0.62} metalness={0.05} />
        </mesh>
        {/* 천장 */}
        <mesh rotation={[HALF_PI, 0, 0]} position={[0, ROOM_H, 0]}>
          <planeGeometry args={[ROOM_W, ROOM_D]} />
          <meshStandardMaterial color={t.ceiling} roughness={0.95} />
        </mesh>

        {/* 벽 셋 — 앞은 열어 둔다(들어온 쪽) */}
        <mesh position={[0, ROOM_H / 2, -ROOM_D / 2]} receiveShadow>
          <planeGeometry args={[ROOM_W, ROOM_H]} />
          <meshStandardMaterial color={t.wall} roughness={0.95} />
        </mesh>
        <mesh position={[-ROOM_W / 2, ROOM_H / 2, 0]} rotation={[0, HALF_PI, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, ROOM_H]} />
          <meshStandardMaterial color={t.wall} roughness={0.95} />
        </mesh>
        <mesh position={[ROOM_W / 2, ROOM_H / 2, 0]} rotation={[0, NEG_HALF_PI, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, ROOM_H]} />
          <meshStandardMaterial color={t.wall} roughness={0.95} />
        </mesh>
        {/* 앞벽 양쪽 (가운데가 입구) */}
        {([-1, 1] as const).map((s) => (
          <mesh
            key={s}
            position={[s * (ROOM_W / 4 + 1.5), ROOM_H / 2, ROOM_D / 2]}
            rotation={[0, PI, 0]}
            receiveShadow
          >
            <planeGeometry args={[ROOM_W / 2 - 3, ROOM_H]} />
            <meshStandardMaterial color={t.wall} roughness={0.95} />
          </mesh>
        ))}

        {/* 걸레받이 — 벽과 바닥이 만나는 선. 이게 있으면 방이 반듯해 보인다 */}
        {([
          [[0, 0.07, -ROOM_D / 2 + 0.03], [0, 0, 0], ROOM_W],
          [[-ROOM_W / 2 + 0.03, 0.07, 0], [0, HALF_PI, 0], ROOM_D],
          [[ROOM_W / 2 - 0.03, 0.07, 0], [0, NEG_HALF_PI, 0], ROOM_D],
        ] as [number[], number[], number][]).map(([p, r, len], i) => (
          <mesh key={i} position={p as [number, number, number]} rotation={r as [number, number, number]}>
            <planeGeometry args={[len, 0.14]} />
            <meshStandardMaterial color={t.trim} roughness={0.9} />
          </mesh>
        ))}

        {/* 가운데 가림벽 — 미술관이 늘 쓰는 수법. 동선이 생기고 벽이 두 배가 된다. */}
        <mesh position={[0, PARTITION_H / 2, PARTITION_Z]} castShadow receiveShadow>
          <boxGeometry args={[PARTITION_W, PARTITION_H, 0.4]} />
          <meshStandardMaterial color={t.wall} roughness={0.95} />
        </mesh>

        <TrackLights dark={dark} />

        {/*
          전시 제목 — 뒷벽 맨 위에 크게. 미술관 입구 벽 글씨 그것이다.
          **대표 이미지 자리를 비워 두려고 위로 올렸다**(아래 PosterWall).
        */}
        <Html
          position={[0, 5.55, -ROOM_D / 2 + 0.08]}
          transform
          scale={0.42}
          pointerEvents="none"
          zIndexRange={[6, 0]}
        >
          <div
            style={{
              width: '560px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none', color: t.caption,
            }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '0.24em', opacity: 0.66 }}>
              {hallTitle}
            </div>
            <div style={{ fontSize: '44px', fontWeight: 900, lineHeight: 1.15, marginTop: '6px', wordBreak: 'keep-all' }}>
              {show.title}
            </div>
            {show.subtitle && (
              <div style={{ fontSize: '19px', fontWeight: 600, marginTop: '6px', opacity: 0.72 }}>
                {show.subtitle}
              </div>
            )}
          </div>
        </Html>

        {/* 제목 바로 아래 — 이 전시가 무엇인지 그림으로 한 번에 온다 */}
        {show.posterUrl && <PosterWall url={show.posterUrl} frameColor={t.frame} />}

        {/* 작품들 */}
        {works.map((w, i) => {
          const s = slots[i];
          if (!s) return null;
          return (
            <Artwork
              key={w.id}
              work={w}
              pos={s.pos}
              rot={s.rot}
              maxW={s.maxW}
              frameColor={t.frame}
              captionColor={t.caption}
              onSelect={() => onSelect(w)}
            />
          );
        })}

        {/* 가운데 긴 의자 — 앉아서 오래 보는 자리 */}
        <group position={[0, 0, -3.5]}>
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.6, 0.18, 1.1]} />
            <meshStandardMaterial color={dark ? '#3A3A40' : '#C9C4BB'} roughness={0.7} />
          </mesh>
          {([-1.5, 1.5] as const).map((bx) => (
            <mesh key={bx} position={[bx, 0.2, 0]} castShadow>
              <boxGeometry args={[0.24, 0.4, 0.95]} />
              <meshStandardMaterial color={dark ? '#2A2A2E' : '#A9A399' } roughness={0.8} />
            </mesh>
          ))}
        </group>

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{
            xMin: -ROOM_W / 2 + 1, xMax: ROOM_W / 2 - 1,
            zMin: -ROOM_D / 2 + 1, zMax: ROOM_D / 2 - 1,
          }}
          start={[0, 0, ROOM_D / 2 - 3]}
          maxSpeed={4}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={obstacles}
        />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.5} />
      </Canvas>

      <button
        onClick={onExit}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 미술관 앞으로
      </button>

      {children}
    </div>
  );
}
