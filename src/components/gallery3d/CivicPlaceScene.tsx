'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls, setMovementLock,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import type { CivicPlace, Fixture } from '@/lib/civic-places';

const PI = Math.PI;
const NEG_HALF_PI = -PI * 0.5;

/**
 * 우리 동네 기관 안 — **걸어다니며 배운다.**
 *
 * 창을 하나 띄워 글을 읽히면 그건 그냥 안내문이다. 학교 로비(`SchoolLobbyScene`)에서
 * 배운 대로, **걸어가서 앞에 서면 말을 거는** 방식으로 만든다.
 * 아이가 창구 앞에 서면 그 사람이 자기 일을 말해준다.
 *
 * **방은 한 벌만 만든다.** 우체국·읍사무소·경찰서가 저마다 다른 건물이면 기관을
 * 하나 늘릴 때마다 3D 를 새로 만들어야 한다. 벽 색과 창구 이름만 바뀌면
 * **표에 한 줄 더 쓰는 것으로 기관이 하나 늘어난다** — 그게 이 구조의 요점이다.
 */

const ROOM_W = 16;
const ROOM_D = 14;
const WALL_H = 4.2;

/** 창구·안내판처럼 몸이 못 지나가는 것들 */
const OBSTACLES: Obstacle[] = [
  // 창구 카운터 (안쪽 가로로 길게)
  { x: 0, z: -4.2, halfW: 5.5, halfD: 0.8 },
  // 대기 의자 두 줄
  { x: -3.5, z: 2.4, halfW: 2.25, halfD: 0.6 },
  { x: 3.5, z: 2.4, halfW: 2.25, halfD: 0.6 },
];

/** 사람이 서 있는 자리 (창구 안쪽) */
function deskXs(count: number): number[] {
  if (count <= 1) return [0];
  const span = 8.4;
  const gap = span / (count - 1);
  return Array.from({ length: count }, (_, i) => -span / 2 + gap * i);
}

/**
 * 방에 놓는 것들 — **종류마다 다르게.**
 * 창구만 있으면 우체국이든 읍사무소든 똑같아 보인다. 저울과 택배 상자가
 * 있어야 '여기가 우체국이구나' 가 된다.
 */
function Fixtures({ list }: { list: Fixture[] }) {
  return (
    <group>
      {list.includes('scale') && (
        // 저울 — 창구 위에 올려둔다. 편지 무게를 재는 그것.
        <group position={[-4.2, 1.22, -4.2]}>
          <mesh castShadow>
            <boxGeometry args={[0.9, 0.16, 0.7]} />
            <meshStandardMaterial color="#C6CBD2" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.2, -0.2]}>
            <boxGeometry args={[0.55, 0.36, 0.08]} />
            <meshStandardMaterial color="#3A3F47" />
          </mesh>
          <mesh position={[0, 0.14, 0.1]}>
            <boxGeometry args={[0.6, 0.05, 0.45]} />
            <meshStandardMaterial color="#EDEFF2" roughness={0.6} />
          </mesh>
        </group>
      )}

      {list.includes('parcel') && (
        // 택배 상자 더미 — 옆에 쌓아 둔다
        <group position={[5.6, 0, -4.6]}>
          {[
            [0, 0.3, 0, 1.1], [1.2, 0.26, 0.2, 0.95], [0.2, 0.85, 0.1, 0.8],
            [-1.1, 0.28, -0.1, 1.0],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[0, i * 0.4, 0]} castShadow>
              <boxGeometry args={[s, s * 0.55, s * 0.8]} />
              <meshStandardMaterial color={i % 2 ? '#C9A46B' : '#D8B77E'} roughness={0.95} />
            </mesh>
          ))}
        </group>
      )}

      {list.includes('bank') && (
        // 금융 창구 — 오른쪽에 따로. 여기만 유리 칸막이가 있다.
        <group position={[4.6, 0, -4.2]}>
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[3.2, 0.7, 0.06]} />
            <meshStandardMaterial color="#BEE3F2" transparent opacity={0.45} />
          </mesh>
          <mesh position={[0, 1.92, 0]}>
            <boxGeometry args={[3.3, 0.08, 0.14]} />
            <meshStandardMaterial color="#8A6038" roughness={0.7} />
          </mesh>
        </group>
      )}

      {list.includes('mailbox') && (
        // 빨간 우체통 — 들어서면 바로 보이는 자리
        <group position={[-6.2, 0, 1.2]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 1.2, 14]} />
            <meshStandardMaterial color="#E8604C" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.24, 0]} castShadow>
            <sphereGeometry args={[0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#C94A38" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.85, 0.33]}>
            <boxGeometry args={[0.4, 0.08, 0.04]} />
            <meshStandardMaterial color="#3A3226" />
          </mesh>
        </group>
      )}

      {list.includes('noticeboard') && (
        // 알림판 — 읍사무소에는 늘 붙어 있다
        <group position={[-5.4, 0, -6.6]}>
          <mesh position={[0, 1.7, 0]} castShadow>
            <boxGeometry args={[3.0, 1.8, 0.1]} />
            <meshStandardMaterial color="#F2EAD8" roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.7, 0.06]}>
            <boxGeometry args={[3.2, 2.0, 0.06]} />
            <meshStandardMaterial color="#8A6038" roughness={0.8} />
          </mesh>
        </group>
      )}

      {list.includes('flag') && (
        <group position={[6.2, 0, -6.4]}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 3.2, 8]} />
            <meshStandardMaterial color="#9AA3AE" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0.6, 2.7, 0]}>
            <planeGeometry args={[1.2, 0.8]} />
            <meshStandardMaterial color="#FFFFFF" side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** 직원 — 창구 안쪽에 서서, 가까이 오면 자기 일을 말한다 */
function Clerk({
  x, emoji, name, job, avatarPos, hasGuide, done, onTalk, cta, tone = '#E8A33C',
}: {
  x: number;
  emoji: string;
  name: string;
  job: string;
  avatarPos: React.RefObject<THREE.Vector3>;
  /** 말을 걸 수 있는 사람인가 — 머리 위에 느낌표가 뜬다 */
  hasGuide?: boolean;
  /** 이미 끝냈나 — 느낌표를 내린다 */
  done?: boolean;
  onTalk?: () => void;
  /** 말풍선 아래 적는 말. 이야기꾼과 심부름꾼은 하는 말이 다르다. */
  cta?: string;
  /** 옷·테두리 색. 심부름 주는 사람은 이야기꾼과 달라 보여야 한다. */
  tone?: string;
}) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    /**
     * 거리 판정은 **화면 그리기와 따로 돈다.**
     * `useFrame` 안에서 상태를 바꾸면 1초에 60번 다시 그리게 된다 —
     * 사람이 걸어오는 속도에는 5번이면 충분하다.
     */
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;
      const d = Math.hypot(p.x - x, p.z - (-3.0));
      setNear((was) => (was === d < 3.2 ? was : d < 3.2));
    }, 200);
    return () => clearInterval(t);
  }, [avatarPos, x]);

  return (
    <group position={[x, 0, -5.0]}>
      {/* 몸 — 이야기해 줄 사람은 옷 색이 다르다(느낌표만으로는 멀리서 안 보인다) */}
      <mesh
        position={[0, 0.85, 0]}
        castShadow
        onClick={hasGuide && onTalk ? (e) => { e.stopPropagation(); onTalk(); } : undefined}
        onPointerOver={hasGuide ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={hasGuide ? () => { document.body.style.cursor = 'auto'; } : undefined}
      >
        <capsuleGeometry args={[0.32, 0.8, 4, 12]} />
        <meshStandardMaterial color={hasGuide ? tone : '#5B6B8A'} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#F2D3B3" roughness={0.9} />
      </mesh>

      {/*
        느낌표 — **아직 안 들은 사람에게만.**
        다 듣고도 계속 떠 있으면 '아직 할 일이 남았나' 하고 다시 누른다.
      */}
      {hasGuide && !done && (
        <Html position={[0, 2.9, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="float-slow" style={{ fontSize: '26px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.3))' }}>
            ❗
          </div>
        </Html>
      )}

      <Html position={[0, 2.35, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[8, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#5B4A3B', fontWeight: 800, fontSize: '13px',
            padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
          }}
        >
          {emoji} {name}
        </div>
      </Html>

      {/*
        가까이 갔을 때만 말한다. 셋이 한꺼번에 떠들면 아무것도 안 읽힌다 —
        학교 창문 문패에서 배운 것과 같다.
      */}
      {near && (
        <Html
          position={[0, 3.1, 0]}
          center
          // 이야기해 줄 사람은 말풍선도 눌린다 — 눌러보라고 적어놓고 안 눌리면 안 된다
          style={{ pointerEvents: hasGuide && onTalk ? 'auto' : 'none' }}
          zIndexRange={[9, 0]}
        >
          <div
            onClick={hasGuide && onTalk ? onTalk : undefined}
            style={{
              background: 'rgba(255,250,240,0.98)', color: '#3A3226',
              fontSize: '13px', lineHeight: 1.5, fontWeight: 600,
              padding: '10px 14px', borderRadius: '14px', width: '230px',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none',
              border: `2px solid ${hasGuide ? tone : '#EFE3CB'}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              cursor: hasGuide ? 'pointer' : 'default',
            }}
          >
            {job}
            {hasGuide && (
              <div style={{ marginTop: '8px', color: '#A6762A', fontWeight: 800 }}>
                {cta ?? (done ? '💬 다시 듣기 ›' : '💬 이야기 듣기 ›')}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function CivicPlaceScene({
  place, avatarId, avatarCustom, avatarTint, onExit, onGuideDone, guideDone,
  missionState = 'hidden', onGoSite, onClaimMission,
}: {
  place: CivicPlace;
  avatarId?: string | null;
  avatarCustom?: AvatarCustom;
  avatarTint?: AvatarTint;
  onExit: () => void;
  /** 이야기를 끝까지 들었을 때. 심부름 표시는 부모가 남긴다. */
  onGuideDone?: () => void;
  /** 이미 들었나 (다시 들어와도 느낌표가 안 뜨게) */
  guideDone?: boolean;
  /**
   * 밖으로 나가는 심부름이 지금 어디까지 왔나.
   *
   * - `hidden` — 이 마을엔 그 심부름이 없다(유적이 없는 학교)
   * - `todo` — 아직 안 다녀왔다
   * - `ready` — 다녀왔는데 아직 알리지 않았다 → 느낌표가 다시 뜬다
   * - `done` — 상을 받았다
   *
   * **판단은 부모가 한다.** 이 화면은 3D 만 그리고, 어디까지 했는지는
   * 서버 기록을 읽는 쪽이 정한다.
   */
  missionState?: 'hidden' | 'todo' | 'ready' | 'done';
  onGoSite?: () => void;
  onClaimMission?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 4.5));
  const avatarYaw = useRef(0);

  /** 이야기 창 — 몇 장째인가. null 이면 닫혀 있다. */
  const [page, setPage] = useState<number | null>(null);
  /** 방금 다 들었다 — 끝났다는 것을 한 번 크게 알려준다 */
  const [justDone, setJustDone] = useState(false);
  /** 심부름 창이 열려 있나 */
  const [missionOpen, setMissionOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 11);
    return attachCameraControls(el, { minDist: 6, maxDist: 20 });
  }, []);

  const xs = deskXs(place.people.length);
  const guide = place.guide ?? [];
  const guideAt = place.guideAt ?? -1;

  /** 심부름을 주는 사람. 이 마을에 그 유적이 없으면 아무도 안 준다. */
  const mission = place.mission;
  const missionAt = missionState === 'hidden' ? -1 : (mission?.at ?? -1);

  /** 창을 보는 동안에는 아바타가 움직이면 안 된다 — 읽는 중에 걸어가 버린다 */
  useEffect(() => {
    setMovementLock(page !== null || missionOpen);
    return () => setMovementLock(false);
  }, [page, missionOpen]);

  return (
    <div ref={containerRef} className="scene-3d" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 6, 12], fov: 55, near: 0.1, far: 200 }}
        style={{ background: '#EAF1F8' }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 14, 6]} intensity={0.8} castShadow />

        {/* 바닥 */}
        <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
          <planeGeometry args={[ROOM_W, ROOM_D]} />
          <meshStandardMaterial color="#E9E3D6" roughness={0.95} />
        </mesh>

        {/* 벽 셋 (앞은 열어둔다 — 막으면 답답하고 나가는 길이 안 보인다) */}
        <mesh position={[0, WALL_H / 2, -ROOM_D / 2]} receiveShadow>
          <planeGeometry args={[ROOM_W, WALL_H]} />
          <meshStandardMaterial color={place.color} roughness={0.9} />
        </mesh>
        <mesh position={[-ROOM_W / 2, WALL_H / 2, 0]} rotation={[0, PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, WALL_H]} />
          <meshStandardMaterial color="#F4EFE4" roughness={0.95} />
        </mesh>
        <mesh position={[ROOM_W / 2, WALL_H / 2, 0]} rotation={[0, -PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, WALL_H]} />
          <meshStandardMaterial color="#F4EFE4" roughness={0.95} />
        </mesh>

        {/* 창구 카운터 */}
        <mesh position={[0, 0.55, -4.2]} castShadow receiveShadow>
          <boxGeometry args={[11, 1.1, 1.6]} />
          <meshStandardMaterial color="#B98D5F" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.16, -4.2]}>
          <boxGeometry args={[11.2, 0.12, 1.8]} />
          <meshStandardMaterial color="#8A6038" roughness={0.6} />
        </mesh>

        {/* 안내판 — 여기가 어디이고 무엇을 하는 곳인가 */}
        <Html position={[0, 3.1, -ROOM_D / 2 + 0.15]} center style={{ pointerEvents: 'none' }} zIndexRange={[7, 0]}>
          <div
            style={{
              background: 'rgba(255,255,255,0.96)', color: '#3A3226',
              padding: '12px 18px', borderRadius: '14px', width: '300px',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none', textAlign: 'center',
              border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: '19px', fontWeight: 900 }}>{place.emoji} {place.label}</div>
            <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5, color: '#6B5B43' }}>
              {place.oneLine}
            </div>
          </div>
        </Html>

        {/* 그 기관다운 물건들 */}
        <Fixtures list={place.fixtures ?? []} />

        {/* 직원들 — 창구 안쪽 */}
        {place.people.map((p, i) => {
          const isGuide = i === guideAt && guide.length > 0;
          const isMission = i === missionAt && !!mission;
          return (
            <Clerk
              key={p.name}
              x={xs[i]}
              emoji={p.emoji}
              name={p.name}
              job={p.job}
              avatarPos={avatarPos}
              hasGuide={isGuide || isMission}
              /**
               * 심부름은 **다녀와서 알리기 전까지** 느낌표가 살아 있다.
               * 갔다 왔는데 느낌표가 없으면 상 받으러 올 이유를 모른다.
               */
              done={isMission ? missionState === 'done' : guideDone}
              tone={isMission ? '#3BAF9F' : '#E8A33C'}
              cta={
                isMission
                  ? missionState === 'ready'
                    ? '🏅 다녀왔어요! ›'
                    : missionState === 'done'
                      ? '🏅 마친 심부름 ›'
                      : '📜 심부름 받기 ›'
                  : undefined
              }
              onTalk={() => (isMission ? setMissionOpen(true) : setPage(0))}
            />
          );
        })}

        {/* 대기 의자 */}
        {[-3.5, 3.5].map((x) => (
          <group key={x} position={[x, 0, 2.4]}>
            <mesh position={[0, 0.42, 0]} castShadow>
              <boxGeometry args={[4.5, 0.18, 1.2]} />
              <meshStandardMaterial color="#C9A97E" roughness={0.8} />
            </mesh>
            {[-1.6, 0, 1.6].map((dx) => (
              <mesh key={dx} position={[dx, 0.2, 0]} castShadow>
                <boxGeometry args={[0.2, 0.4, 1.1]} />
                <meshStandardMaterial color="#A07E55" roughness={0.85} />
              </mesh>
            ))}
          </group>
        ))}

        <WalkerAvatar
          avatarPos={avatarPos}
          bounds={{ xMin: -ROOM_W / 2 + 1, xMax: ROOM_W / 2 - 1, zMin: -ROOM_D / 2 + 1, zMax: ROOM_D / 2 - 1 }}
          start={[0, 0, 4.5]}
          maxSpeed={4.2}
          avatarId={avatarId}
          avatarCustom={avatarCustom}
          avatarTint={avatarTint}
          avatarYaw={avatarYaw}
          obstacles={OBSTACLES}
        />
        <FollowCamera avatarPos={avatarPos} lookHeight={1.4} />
      </Canvas>

      <button
        onClick={onExit}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 마을로
      </button>

      {/*
        이야기 창 — **한 장에 한 가지씩, 화살표로 넘긴다.**
        한 화면에 다 쏟으면 초등학생은 안 읽는다. 끝까지 넘기면 심부름이 끝난다.
      */}
      {page !== null && guide[page] && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4"
          style={{ background: 'rgba(24,20,16,0.55)' }}
          onClick={() => setPage(null)}
        >
          <div
            className="w-full max-w-[440px] rounded-3xl overflow-hidden"
            style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-[20px]">{place.emoji}</span>
              <span className="text-[13px] font-bold" style={{ color: '#A6762A' }}>
                {place.people[guideAt]?.name ?? ''}
              </span>
              <span className="ml-auto text-[12px] font-bold" style={{ color: '#A89880' }}>
                {page + 1} / {guide.length}
              </span>
            </div>

            <div className="px-5 pb-3">
              <div className="text-[17px] font-black mb-2" style={{ color: '#3A3226' }}>
                {guide[page].title}
              </div>
              <div
                className="text-[14px] leading-relaxed whitespace-pre-line"
                style={{ color: '#5B4A3B', minHeight: '104px' }}
              >
                {/* **강조는 굵게만.** 별표가 그대로 보이면 아이가 읽다 걸린다 */}
                {guide[page].body.split(/\*\*(.+?)\*\*/g).map((part, i) =>
                  i % 2 === 1
                    ? <b key={i} style={{ color: '#3A3226' }}>{part}</b>
                    : <span key={i}>{part}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 pb-4">
              <button
                onClick={() => setPage((p) => Math.max(0, (p ?? 0) - 1))}
                disabled={page === 0}
                className="h-11 w-11 rounded-full text-[18px] font-black disabled:opacity-30"
                style={{ background: '#F0E6D2', color: '#6B5B43' }}
              >
                ‹
              </button>

              {page < guide.length - 1 ? (
                <button
                  onClick={() => setPage(page + 1)}
                  className="flex-1 rounded-full py-3 text-[15px] font-bold text-white"
                  style={{ background: 'var(--color-primary)' }}
                >
                  다음 ›
                </button>
              ) : (
                <button
                  onClick={() => {
                    setPage(null);
                    if (!guideDone) { setJustDone(true); onGuideDone?.(); }
                  }}
                  className="flex-1 rounded-full py-3 text-[15px] font-bold text-white"
                  style={{ background: '#3BAF9F' }}
                >
                  ✓ 다 들었어요
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        심부름 창 — **받을 때와 마치고 왔을 때가 다른 말을 한다.**
        같은 사람이 같은 말만 하면 다녀온 보람이 없다.
      */}
      {missionOpen && mission && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4"
          style={{ background: 'rgba(24,20,16,0.55)' }}
          onClick={() => setMissionOpen(false)}
        >
          <div
            className="w-full max-w-[440px] rounded-3xl overflow-hidden"
            style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-4 pb-2 flex items-center gap-2">
              <span className="text-[20px]">{place.people[mission.at]?.emoji ?? '🧑'}</span>
              <span className="text-[13px] font-bold" style={{ color: '#2E8C7F' }}>
                {place.people[mission.at]?.name ?? ''}
              </span>
              <span className="ml-auto text-[12px] font-bold" style={{ color: '#A89880' }}>
                {missionState === 'todo' ? '심부름' : '심부름 완료'}
              </span>
            </div>

            <div className="px-5 pb-3">
              <div className="text-[17px] font-black mb-2" style={{ color: '#3A3226' }}>
                {missionState === 'todo' ? mission.title : '고마워요!'}
              </div>
              <div className="text-[14px] leading-relaxed whitespace-pre-line" style={{ color: '#5B4A3B' }}>
                {(missionState === 'todo' ? mission.ask : mission.reward)
                  .split(/\*\*(.+?)\*\*/g)
                  .map((part, i) =>
                    i % 2 === 1
                      ? <b key={i} style={{ color: '#3A3226' }}>{part}</b>
                      : <span key={i}>{part}</span>
                  )}
              </div>
            </div>

            <div className="px-4 pb-4">
              {missionState === 'todo' ? (
                <button
                  onClick={() => { setMissionOpen(false); onGoSite?.(); }}
                  className="w-full rounded-full py-3 text-[15px] font-bold text-white"
                  style={{ background: 'var(--color-primary)' }}
                >
                  🏯 알아보러 가기 ›
                </button>
              ) : missionState === 'ready' ? (
                <button
                  onClick={() => { setMissionOpen(false); onClaimMission?.(); }}
                  className="w-full rounded-full py-3 text-[15px] font-bold text-white"
                  style={{ background: '#3BAF9F' }}
                >
                  🏅 상 받기
                </button>
              ) : (
                <button
                  onClick={() => setMissionOpen(false)}
                  className="w-full rounded-full py-3 text-[15px] font-bold"
                  style={{ background: '#F0E6D2', color: '#6B5B43' }}
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/*
        다 들은 뒤 — **돌아갈 길을 여기서 준다.**
        걸어서 돌아가도 되지만, 심부름을 마친 아이에게 '이제 어디로' 를
        안 알려주면 마을에서 헤맨다.
      */}
      {justDone && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{ background: 'rgba(24,20,16,0.5)' }}
          onClick={() => setJustDone(false)}
        >
          <div
            className="w-full max-w-[380px] rounded-3xl p-5 text-center"
            style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[34px] mb-1">🎉</div>
            <div className="text-[17px] font-black mb-1" style={{ color: '#3A3226' }}>
              {place.label} 을 다 알아봤어요!
            </div>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#8A7A5F' }}>
              이제 심부름을 준 곳으로 돌아가서 알려주면 돼요.
            </p>
            <button
              onClick={onExit}
              className="w-full rounded-2xl py-3 text-[15px] font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              🗺️ 마을로 돌아가기
            </button>
            <button
              onClick={() => setJustDone(false)}
              className="w-full mt-2 rounded-2xl py-2.5 text-[13px] font-bold"
              style={{ background: '#F0E6D2', color: '#6B5B43' }}
            >
              더 둘러볼래요
            </button>
          </div>
        </div>
      )}

      {/*
        여기 와야 되는 일 — **창구 사람 말과 다른 것**이다.
        사람은 '내가 무슨 일을 하는가' 를 말하고, 여기는 '네가 무엇을 할 수 있는가' 다.
      */}
      <div className="pos-hint absolute left-3 right-3 z-20 mx-auto max-w-[420px] rounded-2xl px-4 py-3 pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.94)', color: '#5B4A3B' }}
      >
        <div className="text-[13px] font-black mb-1">여기서 할 수 있는 일</div>
        <ul className="text-[12px] leading-relaxed list-disc pl-4">
          {place.todo.map((t) => <li key={t}>{t.replace(/\*\*/g, '')}</li>)}
        </ul>
      </div>
    </div>
  );
}
