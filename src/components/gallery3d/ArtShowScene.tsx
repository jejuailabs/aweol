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
import { startGalleryMusic } from '@/lib/gallery-music';
import Peers from './Peers';
import type { PeerLook } from '@/lib/presence';

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
/**
 * 빛 웅덩이 그림 — **가운데가 밝고 가장자리로 사라진다.**
 *
 * 그동안 벽에 진 빛을 **불투명도 0.07 짜리 흰 네모** 하나로 그렸다.
 * 그건 빛이 아니라 옅은 종이다 — 테두리가 칼같이 끊겨서, 눈은 그걸
 * 조명으로 안 읽는다. 빛은 **가장자리가 흐려야** 빛이다.
 *
 * 그림 한 장을 만들어 **모두가 나눠 쓴다.** 작품마다 만들면 마흔 장이 된다.
 */
let glowTex: THREE.Texture | null = null;
function getGlow(): THREE.Texture | null {
  if (glowTex) return glowTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * 핀조명 빔 — **천장에서 그림으로 삼각형으로 퍼진다.**
 *
 * 진짜 광원을 켜지 않는다. 작품이 마흔 점이면 광원이 마흔 개가 되어
 * 휴대폰이 못 버틴다(WebGL 은 광원 수에 한계가 있다).
 * 대신 **빛이 지나가는 공기**를 옅은 원뿔로 그린다 — 실제로 미술관에서
 * 보이는 것도 먼지에 걸린 그 빛기둥이지 광원 자체가 아니다.
 *
 * `AdditiveBlending` 이라 겹칠수록 밝아진다. 빛이 그렇다.
 * `depthWrite` 를 끄는 이유: 켜두면 원뿔이 그림을 가려 뿌옇게 만든다.
 */
function SpotBeam({ w, h, warm }: { w: number; h: number; warm: string }) {
  const { from, len, tilt, mid } = useMemo(() => {
    /** 등이 달린 자리 — 그림 위쪽, 조금 앞으로 */
    const ly = h / 2 + 2.1;
    const lz = 1.7;
    const dy = -(ly);
    const dz = -(lz - 0.08);
    const l = Math.hypot(dy, dz);
    return {
      from: [0, ly, lz] as [number, number, number],
      len: l,
      // 기본 원뿔은 꼭지가 위, 아가리가 아래다. 그림 쪽으로 눕힌다.
      tilt: Math.atan2(-dz, -dy),
      mid: [0, ly + dy / 2, lz + dz / 2] as [number, number, number],
    };
  }, [h]);

  /**
   * 아가리 크기 — **옆 작품까지 넘지 않게.**
   *
   * 뒷벽 작품은 3m 간격으로 걸린다. 아가리를 그보다 넓게 잡으면 빛기둥이
   * 서로 겹치는데, 겹칠수록 밝아지는 셈법(가산)이라 그 자리가 하얗게 뜬다.
   * 그림 폭의 절반 남짓이면 그림은 다 덮으면서 옆과 안 부딪힌다.
   */
  const spread = Math.max(w, h) * 0.45 + 0.3;

  return (
    <group>
      {/* 빛기둥 */}
      <mesh position={mid} rotation={[tilt, 0, 0]}>
        <coneGeometry args={[spread, len, 20, 1, true]} />
        <meshBasicMaterial
          color={warm}
          transparent
          // 빛기둥은 **있는 듯 없는 듯** 해야 한다. 진하면 안개 낀 방이 된다.
          opacity={0.09}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* 등 — 빛이 나오는 자리에 작은 알이 보여야 어디서 오는지 안다 */}
      <mesh position={from}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshBasicMaterial color={warm} />
      </mesh>
    </group>
  );
}

function Artwork({
  work, pos, rot, maxW, frameColor, captionColor, onSelect, talk, onTalk, dark,
}: {
  work: WorkDoc & { id: string };
  pos: [number, number, number];
  rot: [number, number, number];
  maxW: number;
  frameColor: string;
  captionColor: string;
  onSelect: () => void;
  /** 이 작품에 달린 말 — 개수와 **가장 최근 한 줄**만 받는다 */
  talk?: { count: number; latest: string; isNew: boolean };
  /** 말풍선을 눌렀다 */
  onTalk?: () => void;
  /**
   * 어두운 전시실인가 — **핀조명은 여기서만 켠다.**
   *
   * 밝은 방에 빛기둥을 세웠더니 흰 벽에 **흰 삼각형**만 도드라졌다.
   * 조명은 어두워야 조명으로 보인다 — 밝은 데서 더 밝게 비추면
   * 빛이 아니라 얼룩이다. 실제 미술관도 화이트큐브는 천장을 고르게 밝히고,
   * 핀조명은 어두운 전시장에서 쓴다.
   */
  dark?: boolean;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [hot, setHot] = useState(false);
  /** 빛 웅덩이 그림 — 모두가 나눠 쓴다 */
  const glow = useMemo(() => getGlow(), []);
  /**
   * 조명 색 — **전시등은 늘 조금 노랗다.**
   * 순백으로 비추면 병원이지 미술관이 아니다.
   */
  const warm = '#FFE9C4';

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
        벽에 진 빛 — **가장자리가 흐려야 빛이다.**

        전에는 불투명도 0.07 짜리 흰 네모였다. 테두리가 칼같이 끊겨서
        눈이 그걸 조명으로 안 읽었고, 벽은 여전히 캄캄했다.
        이제 가운데가 밝고 밖으로 사라지는 그림을 깔고, **세로로 길게** 늘인다 —
        위에서 비스듬히 떨어진 빛은 벽에 길쭉한 타원으로 진다.
      */}
      {glow && (
        <mesh position={[0, 0.1, 0.006]}>
          {/* 옆 작품과 겹치지 않게 — 뒷벽은 3m 간격이다 */}
          <planeGeometry args={[w + 1.7, h + 2.8]} />
          <meshBasicMaterial
            map={glow}
            color={warm}
            transparent
            /*
              **밝은 방에서는 거의 안 보이게.**
              흰 벽에 밝은 빛을 더하면 빛이 아니라 얼룩이다. 그래도 아주
              옅게 남기는 이유는 **가리켰을 때**다 — 어느 것을 누르려는지는
              밝은 방에서도 알아야 한다.
            */
            opacity={dark ? (hot ? 0.44 : 0.28) : (hot ? 0.16 : 0)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 천장에서 내려오는 빛기둥 — **어두운 전시실에서만** */}
      {dark && <SpotBeam w={w} h={h} warm={warm} />}

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
        말풍선 — **작품 밖에 세운다.**

        남긴 말을 액자 안이나 그림 위에 늘어놓으면 **작품 비율이 깨진다.**
        긴 글 하나에 그림이 밀려나는 셈이라, 여기서는 **숫자와 최신 한 줄**만
        띄우고 나머지는 눌러서 본다.

        `transform` 을 안 쓴다 — 멀어도 크기가 그대로라야 방 저편에서도
        "저기 말이 달렸구나" 가 보인다(이름표는 반대로 다가가야 읽힌다).
      */}
      {talk && talk.count > 0 && (
        <Html
          position={[w / 2 + 0.28, h / 2 - 0.1, 0.08]}
          center
          zIndexRange={[7, 0]}
          style={{ pointerEvents: 'auto' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onTalk?.(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,250,240,0.96)',
              border: '2px solid rgba(0,0,0,0.12)',
              borderRadius: 999,
              padding: '4px 9px 4px 7px',
              boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'Pretendard, sans-serif',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>💬</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#5B4A3B' }}>
              {talk.count}
            </span>
            {/* 안 읽은 말이 있으면 — 빨간 점 하나면 충분하다 */}
            {talk.isNew && (
              <span
                style={{
                  fontSize: 9, fontWeight: 900, color: 'white',
                  background: '#E8604C', borderRadius: 999, padding: '1px 5px',
                }}
              >
                NEW
              </span>
            )}
          </button>
        </Html>
      )}

      {/*
        가장 최근 한 줄 — **딱 한 줄.**
        여러 줄을 걸면 그림보다 글이 커진다. 나머지는 말풍선을 눌러서 본다.
      */}
      {talk && talk.latest && (
        <Html
          position={[0, -h / 2 - 0.42, 0.03]}
          center
          transform
          scale={0.13}
          pointerEvents="none"
          zIndexRange={[6, 0]}
        >
          <div
            style={{
              width: '340px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
              userSelect: 'none', color: captionColor, fontSize: '15px', opacity: 0.85,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            “{talk.latest}”
          </div>
        </Html>
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

/**
 * 코브 조명 — **벽 윗머리를 훑고 내려오는 빛.**
 *
 * 작품에만 핀조명을 주면 그 사이 벽은 캄캄해서 **방이 어디까지인지 안 보인다.**
 * 어두운 전시장에서 실제로 그랬다 — 그림만 떠 있고 벽이 없었다.
 *
 * 실제 미술관도 벽 윗머리에 숨은 등을 두어 벽면을 위에서 아래로 훑는다
 * (wall wash). 그 빛이 있어야 방의 크기와 모서리가 읽힌다.
 */
function CoveLight({ w, pos, rot, warm }: {
  w: number;
  pos: [number, number, number];
  rot: [number, number, number];
  warm: string;
}) {
  const glow = useMemo(() => getGlow(), []);
  if (!glow) return null;
  return (
    <group position={pos} rotation={rot}>
      {/* 벽을 훑는 넓은 빛 — 위가 밝고 아래로 사라진다 */}
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[w, ROOM_H * 1.5]} />
        <meshBasicMaterial
          map={glow}
          color={warm}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* 숨은 등 자리 — 가느다란 밝은 띠 */}
      <mesh position={[0, ROOM_H / 2 - 0.5, 0.02]}>
        <planeGeometry args={[w * 0.92, 0.06]} />
        <meshBasicMaterial color={warm} transparent opacity={0.5} depthWrite={false} />
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
  show, hallId, me, works, theme, hallTitle,
  avatarId, avatarCustom, avatarTint, onSelect, onExit, talks, onTalk, children,
}: {
  show: ShowDoc & { id: string };
  /** 방 이름을 만드는 데 쓴다 */
  hallId: string;
  /** 나 — 없으면(로그인 안 했으면) 친구도 안 보인다 */
  me?: { uid: string; look: PeerLook } | null;
  works: (WorkDoc & { id: string })[];
  theme: HallTheme;
  hallTitle: string;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom | null;
  avatarTint?: AvatarTint | null;
  onSelect: (work: WorkDoc & { id: string }) => void;
  onExit: () => void;
  /** 작품마다 달린 말 — `{작품id: {개수, 최신 한 줄, 안 읽은 것 있나}}` */
  talks?: Record<string, { count: number; latest: string; isNew: boolean }>;
  /** 말풍선을 눌렀다 */
  onTalk?: (work: WorkDoc & { id: string }) => void;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, ROOM_D / 2 - 3));
  const avatarYaw = useRef(0);

  const t = themeOf(theme);
  const dark = theme === 'dark';

  /**
   * 배경음악 — **방마다 다른 곡.**
   *
   * 전시 이름을 씨앗으로 삼아 조와 화음 차례를 뽑으므로, 전시가 늘어도
   * 손댈 것이 없고 같은 전시에 다시 오면 같은 곡이 흐른다.
   *
   * **화면을 떠나면 반드시 끈다.** 안 끄면 교실에서도 음악이 흐른다 —
   * 마을 파도 소리에서 이미 밟은 함정이다.
   */
  useEffect(() => {
    /**
     * **음악이 방을 막으면 안 된다.**
     *
     * 여기서 던진 오류가 그리기 도중에 터져 **전시실이 통째로 안 열린 적이
     * 있다**(2026-07). 배경음악은 있으면 좋은 것이지 없으면 안 되는 것이
     * 아니다 — 실패하면 조용히 넘어간다.
     */
    let m: ReturnType<typeof startGalleryMusic> = null;
    try { m = startGalleryMusic(`${hallId}:${show.id}`, dark); } catch { m = null; }
    return () => { try { m?.stop(); } catch {} };
  }, [hallId, show.id, dark]);

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
        {/*
          **어두운 전시장도 벽은 보여야 한다.**
          검게 두면 분위기는 나지만 방이 어디까지인지 모른다 — 실제로
          그림만 허공에 떠 있고 벽이 없었다. 밑을 0.34 로 받쳐 둔다.
        */}
        <hemisphereLight args={[dark ? '#6E6A72' : '#FFFFFF', t.floor, dark ? 0.5 : 0.85]} />
        <ambientLight intensity={Math.max(0.34, t.ambient)} />
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
          벽을 훑는 빛 — **어두운 전시실에서만.**

          어두운 방은 작품에만 핀조명을 주면 그 사이 벽이 캄캄해서 방이
          어디까지인지 안 보인다. 그래서 벽 윗머리를 훑는 빛을 둔다.

          밝은 방(화이트큐브)에는 안 둔다. 이미 벽이 다 보이는데 빛을 더하면
          **흰 벽에 흰 얼룩**이 생길 뿐이다 — 실제로 그렇게 보였다.
        */}
        {dark && (
          <>
            <CoveLight
              w={ROOM_W}
              pos={[0, ROOM_H / 2, -ROOM_D / 2 + 0.05]}
              rot={[0, 0, 0]}
              warm="#FFE9C4"
            />
            <CoveLight
              w={ROOM_D}
              pos={[-ROOM_W / 2 + 0.05, ROOM_H / 2, 0]}
              rot={[0, HALF_PI, 0]}
              warm="#FFE9C4"
            />
            <CoveLight
              w={ROOM_D}
              pos={[ROOM_W / 2 - 0.05, ROOM_H / 2, 0]}
              rot={[0, NEG_HALF_PI, 0]}
              warm="#FFE9C4"
            />
          </>
        )}

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
              talk={talks?.[w.id]}
              onTalk={() => onTalk?.(w)}
              dark={dark}
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

        {/*
          같이 온 사람들 — **전시마다 따로 모인다.**
          전시관 광장(`hall-…`)과 방(`show-…`)을 나눠야, 광장에 선 사람이
          방 안에 있는 것처럼 보이지 않는다.
        */}
        {me && (
          <Peers
            schoolId="halls"
            roomKey={`show-${hallId}-${show.id}`}
            uid={me.uid}
            look={me.look}
            avatarPos={avatarPos}
            avatarYaw={avatarYaw}
          />
        )}

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
