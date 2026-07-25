'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  WalkerAvatar, FollowCamera, attachCameraControls, resetControls, setMovementLock,
  type Obstacle, type AvatarCustom, type AvatarTint,
} from './walker';
import type { CivicPlace, Fixture } from '@/lib/civic-places';
import {
  questOfPerson, questState, questTarget, type Quest,
} from '@/lib/village-rpg';

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

      {list.includes('bookshelf') && (
        // 책꽂이 — 벽을 따라 세운다. 도서관은 이게 없으면 도서관이 아니다.
        ([-8.4, 8.4] as const).map((wx) => (
          <group key={wx} position={[wx, 0, -1.5]}>
            <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.5, 2.2, 4.5]} />
              <meshStandardMaterial color="#9A6B45" roughness={0.9} />
            </mesh>
            {/* 책 등 — 색만 여럿 세워두면 책꽂이로 보인다 */}
            {Array.from({ length: 22 }, (_, i) => (
              <mesh
                key={i}
                position={[wx > 0 ? -0.3 : 0.3, 0.55 + (i % 2) * 0.85, -1.9 + (i % 11) * 0.36]}
                castShadow
              >
                <boxGeometry args={[0.16, 0.62, 0.24]} />
                <meshStandardMaterial color={['#C4674F', '#7B4B94', '#E8A33C', '#3BAF9F', '#4A90D9'][i % 5]} />
              </mesh>
            ))}
          </group>
        ))
      )}

      {list.includes('crops') && (
        // 농산물 상자 — 양배추·양파·감귤. 애월읍에서 실제로 많이 나는 것들이다.
        <group position={[-5.8, 0, -2.2]}>
          {([[0, 0], [1.3, 0.3], [0.6, 1.3]] as const).map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.22, 0]} castShadow>
                <boxGeometry args={[1.1, 0.44, 0.9]} />
                <meshStandardMaterial color="#B9895A" roughness={0.95} />
              </mesh>
              {Array.from({ length: 5 }, (_, j) => (
                <mesh key={j} position={[-0.3 + (j % 3) * 0.3, 0.52, -0.2 + Math.floor(j / 3) * 0.3]} castShadow>
                  <sphereGeometry args={[0.16, 10, 10]} />
                  <meshStandardMaterial color={['#8FBF6A', '#E8A33C', '#C9D97A'][(i + j) % 3]} roughness={0.85} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}

      {list.includes('bed') && (
        // 진료 침대 — 보건지소는 이게 있어야 병원처럼 보인다
        <group position={[6.2, 0, -1.6]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[1.0, 0.14, 2.2]} />
            <meshStandardMaterial color="#EAF2F0" roughness={0.7} />
          </mesh>
          {([-0.85, 0.85] as const).map((z) =>
            ([-0.4, 0.4] as const).map((x) => (
              <mesh key={`${x}-${z}`} position={[x, 0.2, z]}>
                <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
                <meshStandardMaterial color="#B9C2C0" metalness={0.3} />
              </mesh>
            ))
          )}
          <mesh position={[0, 0.58, -0.8]} castShadow>
            <boxGeometry args={[0.7, 0.14, 0.4]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
          </mesh>
        </group>
      )}

      {list.includes('shelves') && (
        // 편의점 매대 — 알록달록한 물건이 줄지어 있어야 가게로 보인다
        ([-5.2, -2.2] as const).map((sx) => (
          <group key={sx} position={[sx, 0, -0.6]}>
            <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.1, 1.4, 4.2]} />
              <meshStandardMaterial color="#EAEAEA" roughness={0.8} />
            </mesh>
            {Array.from({ length: 12 }, (_, i) => (
              <mesh
                key={i}
                position={[0, 0.5 + Math.floor(i / 6) * 0.75, -1.7 + (i % 6) * 0.68]}
                castShadow
              >
                <boxGeometry args={[1.0, 0.34, 0.4]} />
                <meshStandardMaterial
                  color={['#E8604C', '#E8A33C', '#3BAF9F', '#4A90D9', '#D86CB0', '#8FD98A'][i % 6]}
                  roughness={0.7}
                />
              </mesh>
            ))}
          </group>
        ))
      )}

      {list.includes('coffee') && (
        // 커피 머신과 빵 진열대 — 카페 창구 위
        <group>
          <group position={[-3.6, 1.22, -4.2]}>
            <mesh castShadow>
              <boxGeometry args={[0.9, 0.7, 0.6]} />
              <meshStandardMaterial color="#4A4440" roughness={0.4} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[0.6, 0.14, 0.5]} />
              <meshStandardMaterial color="#8A8A8A" metalness={0.5} roughness={0.4} />
            </mesh>
            {([-0.2, 0.2] as const).map((cx) => (
              <mesh key={cx} position={[cx, -0.1, 0.36]}>
                <cylinderGeometry args={[0.07, 0.05, 0.16, 8]} />
                <meshStandardMaterial color="#FFF6E4" roughness={0.7} />
              </mesh>
            ))}
          </group>
          {/* 빵 진열 */}
          <group position={[3.4, 1.22, -4.2]}>
            <mesh>
              <boxGeometry args={[1.6, 0.08, 0.8]} />
              <meshStandardMaterial color="#E8D7BC" roughness={0.8} />
            </mesh>
            {([[-0.5, 0], [0, 0.1], [0.5, -0.05]] as const).map(([bx, bz], i) => (
              <mesh key={i} position={[bx, 0.18, bz]} castShadow>
                <sphereGeometry args={[0.18, 8, 6]} />
                <meshStandardMaterial color={['#C9924F', '#B87F42', '#D9A860'][i]} roughness={0.9} />
              </mesh>
            ))}
          </group>
        </group>
      )}

      {list.includes('siren') && (
        // 경광등 — 켜 둔 것처럼 살짝 빛난다
        <group position={[0, 0, -6.4]}>
          <mesh position={[0, 2.6, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.34, 12]} />
            <meshStandardMaterial color="#E8604C" emissive="#E8604C" emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 2.4, 8]} />
            <meshStandardMaterial color="#7A8390" metalness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** 직원 — 창구 안쪽에 서서, 가까이 오면 자기 일을 말한다 */
function Clerk({
  x, emoji, name, hasGuide, plainTalk, done, active, onTalk, tone = '#E8A33C',
}: {
  x: number;
  emoji: string;
  name: string;
  /** 말을 걸 수 있는 사람인가 — 머리 위에 느낌표가 뜬다 */
  hasGuide?: boolean;
  /**
   * 이야기꾼도 심부름꾼도 아니지만 **눌러서 역할을 볼 수 있다.**
   * 느낌표도, 색깔 옷도 없다 — 미션과 헷갈리면 안 되니까.
   */
  plainTalk?: boolean;
  /** 이미 끝냈나 — 느낌표를 내린다 */
  done?: boolean;
  /**
   * **지금 말을 걸고 있는 사람인가.**
   *
   * 하는 말은 3D 에 안 띄우고 화면 아래 한 칸에 모은다(아래 '말 거는 칸').
   * 여기서는 이름표를 도드라지게 하는 데만 쓴다 — 누구 말인지는 보여야 하니까.
   */
  active?: boolean;
  onTalk?: () => void;
  /** 옷·테두리 색. 심부름 주는 사람은 이야기꾼과 달라 보여야 한다. */
  tone?: string;
}) {
  const talkable = hasGuide || plainTalk;

  return (
    <group position={[x, 0, -5.0]}>
      {/* 몸 — 이야기해 줄 사람은 옷 색이 다르다(느낌표만으로는 멀리서 안 보인다) */}
      <mesh
        position={[0, 0.85, 0]}
        castShadow
        onClick={talkable && onTalk ? (e) => { e.stopPropagation(); onTalk(); } : undefined}
        onPointerOver={talkable ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={talkable ? () => { document.body.style.cursor = 'auto'; } : undefined}
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

      {/*
        이름표 — **작게, 하나만 도드라지게.**

        예전에는 이름표 밑에 하는 말까지 통째로 띄웠다. 창구에 셋이 서 있으니
        작은 화면에서는 말풍선 셋이 서로 겹쳐 **하나도 못 읽었다.**
        하는 말은 화면 아래 한 칸으로 옮기고, 여기는 누구인지만 남긴다.
      */}
      <Html position={[0, 2.35, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[8, 0]}>
        <div
          style={{
            background: active ? '#FFF1D6' : 'rgba(255,248,231,0.9)',
            color: '#5B4A3B',
            fontWeight: 800,
            fontSize: active ? '13px' : '11px',
            padding: active ? '4px 10px' : '2px 7px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            fontFamily: 'Pretendard, sans-serif',
            userSelect: 'none',
            border: active ? `2px solid ${talkable ? tone : '#EFE3CB'}` : 'none',
            // 멀리 있는 사람은 옅게 — 가까운 쪽에 눈이 가야 한다
            opacity: active ? 1 : 0.72,
            transition: 'opacity .15s',
          }}
        >
          {emoji} {name}
        </div>
      </Html>
    </group>
  );
}

export default function CivicPlaceScene({
  place, avatarId, avatarCustom, avatarTint, onExit, onGuideDone, guideDone,
  progress, grade, quests, onFinishQuest, onGoTo,
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
   * 여기까지 조사한 기록(`site-*`, `place-*`, `quest-*`).
   * 누가 무슨 심부름을 줄 수 있는지는 이걸로 정해진다.
   */
  progress: ReadonlySet<string>;
  grade?: number;
  /** 이 학교의 심부름 목록 (학교가 고쳤을 수 있다) */
  quests: Quest[];
  /** 심부름을 마치고 알렸을 때 */
  onFinishQuest?: (q: Quest) => void;
  /** 심부름이 보내는 곳으로 데려다줄 때 */
  onGoTo?: (t: { kind: 'site' | 'place'; id: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarPos = useRef(new THREE.Vector3(0, 0, 4.5));
  const avatarYaw = useRef(0);

  /** 이야기 창 — 몇 장째인가. null 이면 닫혀 있다. */
  const [page, setPage] = useState<number | null>(null);
  /** 방금 다 들었다 — 끝났다는 것을 한 번 크게 알려준다 */
  const [justDone, setJustDone] = useState(false);
  /** 심부름 창 — 누구와 이야기하는 중인가. null 이면 닫혀 있다. */
  const [talking, setTalking] = useState<Quest | null>(null);
  /** 객관식 심부름에서 고른 번호 */
  const [picked, setPicked] = useState<number | null>(null);
  /** 몇 번 틀렸나 — 두 번 틀리면 힌트를 준다 */
  const [misses, setMisses] = useState(0);
  /** 여러 문제 중 지금 몇 번째인가 */
  const [quizIdx, setQuizIdx] = useState(0);
  /** 역할 카드 — 몇 번째 직원의 역할을 보는 중인가. null 이면 닫혀 있다. */
  const [roleAt, setRoleAt] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    resetControls(0, 11);
    return attachCameraControls(el, { minDist: 6, maxDist: 20 });
  }, []);

  useEffect(() => { setPicked(null); setMisses(0); setQuizIdx(0); }, [talking?.id]);

  const xs = useMemo(() => deskXs(place.people.length), [place.people.length]);
  const guide = place.guide ?? [];
  const guideAt = place.guideAt ?? -1;

  /**
   * 지금 **누구 앞에 서 있나** — 한 사람만 고른다.
   *
   * 예전에는 사람마다 스스로 거리를 재서 가까우면 말풍선을 띄웠다. 창구가
   * 8m 넘게 벌어져 있어 셋이 동시에 걸리는 일이 흔했고, 휴대폰 화면에서는
   * 말풍선 셋이 겹쳐 **하나도 안 읽혔다.**
   *
   * 그래서 판정을 여기로 올려 **제일 가까운 한 사람**만 고른다. 재는 것도
   * 한 번뿐이다(전에는 사람 수만큼 타이머가 돌았다).
   */
  const [nearIdx, setNearIdx] = useState<number | null>(null);
  useEffect(() => {
    /**
     * 거리 판정은 **화면 그리기와 따로 돈다.**
     * `useFrame` 안에서 상태를 바꾸면 1초에 60번 다시 그리게 된다 —
     * 사람이 걸어오는 속도에는 5번이면 충분하다.
     */
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;
      let best: number | null = null;
      // 이 안에 들어와야 말을 건다. 창구 간격보다 좁게 잡아야 한 사람만 걸린다.
      let bestD = 3.6;
      xs.forEach((cx, i) => {
        const d = Math.hypot(p.x - cx, p.z - -3.0);
        if (d < bestD) { bestD = d; best = i; }
      });
      setNearIdx((was) => (was === best ? was : best));
    }, 200);
    return () => clearInterval(t);
  }, [xs]);

  /**
   * 이 방 사람들이 지금 줄 수 있는 심부름.
   *
   * **사람마다 다르다.** 읍사무소만 해도 민원 담당은 동네 한 바퀴를,
   * 마을 담당은 유적 조사를 시킨다. 그리고 앞 심부름을 안 했으면 아예 안 뜬다.
   */
  const questAt = useMemo(
    () => place.people.map((_, i) => questOfPerson(quests, place.kind, i, progress, grade)),
    [quests, place.kind, place.people, progress, grade]
  );

  /**
   * 직원 한 사람 한 사람이 지금 어떤 상태인가 — **한 곳에서 정한다.**
   * 3D 이름표와 화면 아래 말 거는 칸이 **같은 값**을 봐야 한다.
   * 따로 계산하면 반드시 한쪽이 낡는다.
   */
  const clerks = useMemo(
    () => place.people.map((p, i) => {
      const isGuide = i === guideAt && guide.length > 0;
      const q = questAt[i];
      const qs = q ? questState(q, progress) : null;
      const isMission = !!q;
      return {
        ...p,
        i,
        isGuide,
        isMission,
        q,
        qs,
        done: isMission ? qs === 'done' : guideDone,
        tone: isMission ? (qs === 'ready' ? '#E8604C' : '#3BAF9F') : '#E8A33C',
        cta: isMission
          ? qs === 'ready'
            ? '🏅 다녀왔어요!'
            : qs === 'done'
              ? '🏅 마친 심부름 보기'
              : '📜 심부름 받기'
          : isGuide
            ? (guideDone ? '💬 다시 듣기' : '💬 이야기 듣기')
            : '👤 무슨 일 하는지 보기',
      };
    }),
    [place.people, guideAt, guide.length, questAt, progress, guideDone]
  );

  /** 그 사람에게 말을 건다 — 3D 몸을 눌러도, 아래 칸 단추를 눌러도 같은 길 */
  const talkTo = (i: number) => {
    const c = clerks[i];
    if (!c) return;
    if (c.isMission && c.q) { setPicked(null); setMisses(0); setTalking(c.q); }
    else if (c.isGuide) setPage(0);
    else setRoleAt(i);
  };

  /** 창이 하나라도 열려 있으면 아래 말 거는 칸은 숨는다 — 두 겹으로 겹치면 안 된다 */
  const anyModal = page !== null || talking !== null || roleAt !== null;
  const nearClerk = nearIdx !== null && !anyModal ? clerks[nearIdx] : null;

  /** 창을 보는 동안에는 아바타가 움직이면 안 된다 — 읽는 중에 걸어가 버린다 */
  useEffect(() => {
    setMovementLock(page !== null || talking !== null || roleAt !== null);
    return () => setMovementLock(false);
  }, [page, talking, roleAt]);

  /**
   * 편의점 매대는 몸이 못 지나가야 한다 — 매대 사이 골목을 걷는 게 가게 맛이다.
   * 다른 기관은 기존 장애물 그대로.
   */
  const obstacles = useMemo<Obstacle[]>(() => {
    const out = [...OBSTACLES];
    if (place.fixtures?.includes('shelves')) {
      out.push(
        { x: -5.2, z: -0.6, halfW: 0.6, halfD: 2.1 },
        { x: -2.2, z: -0.6, halfW: 0.6, halfD: 2.1 },
      );
    }
    return out;
  }, [place.fixtures]);

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
              padding: '10px 14px', borderRadius: '14px',
              // 휴대폰에서 300px 고정이면 화면 폭을 거의 다 덮는다
              width: 'min(64vw, 300px)',
              fontFamily: 'Pretendard, sans-serif', userSelect: 'none', textAlign: 'center',
              border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 'clamp(14px, 3.6vw, 19px)', fontWeight: 900 }}>
              {place.emoji} {place.label}
            </div>
            <div
              style={{
                fontSize: 'clamp(11px, 2.6vw, 13px)', marginTop: '5px',
                lineHeight: 1.5, color: '#6B5B43',
              }}
            >
              {place.oneLine}
            </div>
          </div>
        </Html>

        {/* 그 기관다운 물건들 */}
        <Fixtures list={place.fixtures ?? []} />

        {/*
          벽 포스터 — **이야기가 벽에도 붙어 있다.**
          이야기꾼을 지나쳐도 벽의 포스터를 누르면 같은 내용을 읽을 수 있다.
          기관마다 새 글을 쓰는 게 아니라 guide 를 그대로 건다 —
          내용이 두 벌이 되면 반드시 한쪽이 낡는다.
        */}
        {guide.slice(0, 3).map((g, i) => (
          <group key={`poster-${i}`} position={[ROOM_W / 2 - 0.08, 2.65, -4 + i * 3.4]} rotation={[0, -PI / 2, 0]}>
            <mesh position={[0, 0, -0.012]}>
              <planeGeometry args={[2.6, 1.8]} />
              <meshStandardMaterial color={place.color} roughness={0.85} />
            </mesh>
            <mesh
              onClick={(e) => { e.stopPropagation(); setPage(i); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
              <planeGeometry args={[2.4, 1.6]} />
              <meshStandardMaterial color="#FFFDF6" roughness={0.9} />
            </mesh>
            <Html position={[0, 0, 0.02]} transform scale={0.24} pointerEvents="none" zIndexRange={[6, 0]}>
              <div
                style={{
                  width: '340px', textAlign: 'center', fontFamily: 'Pretendard, sans-serif',
                  userSelect: 'none', color: '#3A3226',
                }}
              >
                <div style={{ fontSize: '30px' }}>{place.emoji}</div>
                <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.3, wordBreak: 'keep-all' }}>
                  {g.title}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#A6762A', marginTop: '8px' }}>
                  📌 눌러서 읽기
                </div>
              </div>
            </Html>
          </group>
        ))}

        {/* 공용 인테리어 — 시계·화분·입구 매트·창문. 어느 기관이든 방이 덜 휑해진다 */}
        <group position={[5, 3.3, -ROOM_D / 2 + 0.06]}>
          <mesh>
            <circleGeometry args={[0.45, 20]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh position={[0, 0.12, 0.01]}>
            <planeGeometry args={[0.06, 0.3]} />
            <meshStandardMaterial color="#3A3226" />
          </mesh>
          <mesh position={[0.09, 0, 0.01]} rotation={[0, 0, -PI / 2]}>
            <planeGeometry args={[0.05, 0.22]} />
            <meshStandardMaterial color="#3A3226" />
          </mesh>
        </group>
        {([[-7.2, -6.2], [7.2, 5.6]] as const).map(([px, pz]) => (
          <group key={`${px}`} position={[px, 0, pz]}>
            <mesh position={[0, 0.3, 0]} castShadow>
              <cylinderGeometry args={[0.32, 0.26, 0.6, 8]} />
              <meshStandardMaterial color="#B0603F" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.85, 0]} castShadow>
              <sphereGeometry args={[0.42, 8, 6]} />
              <meshStandardMaterial color="#4A8F40" roughness={0.95} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.015, 5.6]} rotation={[NEG_HALF_PI, 0, 0]}>
          <planeGeometry args={[3.2, 1.6]} />
          <meshStandardMaterial color="#C9B98E" roughness={0.95} />
        </mesh>
        {([-3, 1] as const).map((wz) => (
          <mesh key={wz} position={[-ROOM_W / 2 + 0.06, 2.7, wz]} rotation={[0, PI / 2, 0]}>
            <planeGeometry args={[2.2, 1.3]} />
            <meshStandardMaterial color="#BEE6F7" emissive="#9FD4EE" emissiveIntensity={0.2} />
          </mesh>
        ))}

        {/* 직원들 — 창구 안쪽 */}
        {clerks.map((c) => (
          <Clerk
            key={c.name}
            x={xs[c.i]}
            emoji={c.emoji}
            name={c.name}
            active={nearIdx === c.i}
            hasGuide={c.isGuide || c.isMission}
            /**
             * 미션도 이야기도 없는 직원도 **눌러서 역할을 볼 수 있다.**
             * 다만 느낌표·색깔 옷은 없다 — 해야 할 일과 헷갈리면 안 된다.
             */
            plainTalk={!c.isGuide && !c.isMission}
            /**
             * **알릴 것이 남았으면 느낌표가 살아 있다.**
             * 다녀왔는데 느낌표가 없으면 상 받으러 올 이유를 모른다.
             * 반대로 다 끝났는데 떠 있으면 할 일이 남은 줄 안다.
             */
            done={c.done}
            tone={c.tone}
            onTalk={() => talkTo(c.i)}
          />
        ))}

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
          obstacles={obstacles}
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
        말 거는 칸 — **화면 아래 한 곳에 모은다.**

        3D 위에 떠 있는 말풍선은 휴대폰에서 서로 겹쳐 하나도 안 읽혔다.
        창구에 셋이 서 있으면 말풍선도 셋이었다.

        그래서 **제일 가까운 한 사람의 말만** 아래 한 칸에 띄운다.
        여기는 3층(`.pos-hint`)이라 조이스틱과도 오른쪽 단추와도 안 부딪힌다.
        글자는 화면 크기와 상관없이 또렷하고, 단추도 손가락에 넉넉하다.
      */}
      {nearClerk && (
        <div className="pos-hint absolute left-1/2 -translate-x-1/2 z-30 w-[min(92vw,460px)] px-1">
          <div
            className="rounded-2xl px-4 py-3"
            style={{
              background: 'rgba(255,250,240,0.97)',
              border: `3px solid ${nearClerk.isGuide || nearClerk.isMission ? nearClerk.tone : '#EFE3CB'}`,
              boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[18px] leading-none">{nearClerk.emoji}</span>
              <span className="text-[13px] font-black" style={{ color: '#3A3226' }}>
                {nearClerk.name}
              </span>
              {/* 할 일이 남았으면 여기서도 알린다 — 느낌표는 멀면 안 보인다 */}
              {(nearClerk.isMission || nearClerk.isGuide) && !nearClerk.done && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-black text-white"
                  style={{ background: nearClerk.tone }}
                >
                  {nearClerk.isMission ? '심부름' : '이야기'}
                </span>
              )}
            </div>
            <div className="text-[13px] leading-relaxed" style={{ color: '#5B4A3B' }}>
              {nearClerk.job}
            </div>
            <button
              onClick={() => talkTo(nearClerk.i)}
              className="w-full mt-2.5 rounded-xl py-2.5 text-[14px] font-bold text-white"
              style={{ background: nearClerk.isGuide || nearClerk.isMission ? nearClerk.tone : '#A6762A' }}
            >
              {nearClerk.cta} ›
            </button>
          </div>
        </div>
      )}

      {/*
        역할 카드 — **이 사람이 무슨 일을 하는가.**
        미션 창과는 완전히 다르게 생겼다(문서 카드 vs 대화 창) —
        "볼 것"과 "할 일"이 같은 창에 나오면 아이가 구분을 못 한다.
      */}
      {roleAt !== null && place.people[roleAt] && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4"
          style={{ background: 'rgba(24,20,16,0.55)' }}
          onClick={() => setRoleAt(null)}
        >
          <div
            className="w-full max-w-[400px] rounded-3xl overflow-hidden"
            style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-2 text-center">
              <div className="text-[40px]">{place.people[roleAt].emoji}</div>
              <div className="text-[18px] font-black mt-1" style={{ color: '#3A3226' }}>
                {place.people[roleAt].name}
              </div>
              <div className="text-[12px] font-bold mt-0.5" style={{ color: '#A6762A' }}>
                {place.emoji} {place.label}에서 일해요
              </div>
            </div>
            <div className="px-5 pb-3">
              <div
                className="rounded-2xl px-4 py-3 text-[14px] leading-relaxed"
                style={{ background: 'white', color: '#5B4A3B' }}
              >
                {place.people[roleAt].job}
              </div>
              {place.notPublic && (
                <div className="text-[12px] leading-relaxed mt-2 px-1" style={{ color: '#A89880' }}>
                  {place.notPublic.replace(/\*\*/g, '')}
                </div>
              )}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setRoleAt(null)}
                className="w-full rounded-full py-3 text-[15px] font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                알겠어요
              </button>
            </div>
          </div>
        </div>
      )}

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
        심부름 창 — **받을 때, 다녀왔을 때, 물어볼 때가 다 다르다.**
        같은 사람이 같은 말만 하면 다녀온 보람이 없다.
      */}
      {talking && (() => {
        const q = talking;
        const st = questState(q, progress);
        const who = place.people[q.giver.at];
        const target = questTarget(q, progress);
        const quizLen = q.quiz?.length ?? 0;
        const curQ = quizLen > 0 ? q.quiz![quizIdx] : null;
        const curRight = curQ ? picked === curQ.correct : false;
        const allQuizDone = quizLen > 0 && quizIdx >= quizLen - 1 && curRight;
        const canFinish = st === 'ready' || allQuizDone;
        const body = st === 'done' ? q.reward : canFinish ? q.reward : q.ask;

        return (
          <div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4"
            style={{ background: 'rgba(24,20,16,0.55)' }}
            onClick={() => setTalking(null)}
          >
            <div
              className="w-full max-w-[440px] rounded-3xl overflow-hidden"
              style={{ background: '#FFFAF0', border: '3px solid rgba(255,255,255,0.75)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                <span className="text-[20px]">{who?.emoji ?? '🧑'}</span>
                <span className="text-[13px] font-bold" style={{ color: '#2E8C7F' }}>
                  {who?.name ?? ''}
                </span>
                <span className="ml-auto text-[12px] font-bold" style={{ color: '#A89880' }}>
                  {st === 'done' ? '마친 심부름' : canFinish ? '심부름 완료' : '심부름'}
                </span>
              </div>

              <div className="px-5 pb-3">
                <div className="text-[17px] font-black mb-2" style={{ color: '#3A3226' }}>
                  {st === 'done' || canFinish ? '고마워요!' : q.title}
                </div>
                <div className="text-[14px] leading-relaxed whitespace-pre-line" style={{ color: '#5B4A3B' }}>
                  {body.split(/\*\*(.+?)\*\*/g).map((part, i) =>
                    i % 2 === 1
                      ? <b key={i} style={{ color: '#3A3226' }}>{part}</b>
                      : <span key={i}>{part}</span>
                  )}
                </div>

                {/* 묻고 가는 심부름 — 문제를 풀어야 끝난다 */}
                {curQ && st !== 'done' && !allQuizDone && (
                  <div className="mt-3">
                    {quizLen > 1 && (
                      <div className="text-[12px] font-bold mb-2" style={{ color: '#A89880' }}>
                        문제 {quizIdx + 1} / {quizLen}
                      </div>
                    )}
                    {!curRight ? (
                      <>
                        <div className="text-[15px] font-black mb-2" style={{ color: '#3A3226' }}>
                          {curQ.q}
                        </div>
                        <div className="grid gap-1.5">
                          {curQ.choices.map((c, i) => (
                            <button
                              key={c}
                              onClick={() => {
                                setPicked(i);
                                if (i !== curQ.correct) setMisses((n) => n + 1);
                              }}
                              className="rounded-xl px-3 py-2.5 text-left text-[14px] font-bold"
                              style={
                                picked === i
                                  ? { background: '#F6D5CE', color: '#8A3A2A' }
                                  : { background: '#F0E6D2', color: '#5B4A3B' }
                              }
                            >
                              <span className="opacity-60 mr-1.5">{i + 1}.</span>{c}
                            </button>
                          ))}
                        </div>
                        {picked !== null && (
                          <div className="text-[13px] font-bold mt-2" style={{ color: '#C0392B' }}>
                            음… 다시 생각해 볼까요?
                          </div>
                        )}
                        {misses >= 2 && (
                          <div className="text-[13px] leading-relaxed mt-2 rounded-xl p-2.5" style={{ background: '#FFF1D6', color: '#6B5B43' }}>
                            💡 {curQ.why}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-[13px] leading-relaxed rounded-xl p-2.5" style={{ background: '#EAF6EF', color: '#3A5A48' }}>
                          ✅ {curQ.why}
                        </div>
                        <button
                          onClick={() => { setQuizIdx((n) => n + 1); setPicked(null); setMisses(0); }}
                          className="w-full mt-2 rounded-xl py-2.5 text-[14px] font-bold text-white"
                          style={{ background: '#3BAF9F' }}
                        >
                          다음 문제 ›
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* 마지막 문제까지 다 맞혔을 때 */}
                {curQ && allQuizDone && (
                  <div className="text-[13px] leading-relaxed mt-3 rounded-xl p-2.5" style={{ background: '#EAF6EF', color: '#3A5A48' }}>
                    ✅ {curQ.why}
                  </div>
                )}

                {q.badge && (st === 'done' || canFinish) && (
                  <div className="text-[13px] font-bold mt-3" style={{ color: '#A6762A' }}>
                    {q.badge.emoji} {q.badge.label} 뱃지
                  </div>
                )}
              </div>

              <div className="px-4 pb-4 flex gap-2">
                {st === 'done' ? (
                  <button
                    onClick={() => setTalking(null)}
                    className="flex-1 rounded-full py-3 text-[15px] font-bold"
                    style={{ background: '#F0E6D2', color: '#6B5B43' }}
                  >
                    닫기
                  </button>
                ) : canFinish ? (
                  <button
                    onClick={() => { setTalking(null); onFinishQuest?.(q); }}
                    className="flex-1 rounded-full py-3 text-[15px] font-bold text-white"
                    style={{ background: '#3BAF9F' }}
                  >
                    🏅 {q.badge ? '뱃지 받기' : '알려주기'}
                  </button>
                ) : target ? (
                  <button
                    onClick={() => { setTalking(null); onGoTo?.(target); }}
                    className="flex-1 rounded-full py-3 text-[15px] font-bold text-white"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {target.kind === 'site' ? '🗺️ 알아보러 가기 ›' : '🚪 그곳으로 가기 ›'}
                  </button>
                ) : (
                  <button
                    onClick={() => setTalking(null)}
                    className="flex-1 rounded-full py-3 text-[15px] font-bold"
                    style={{ background: '#F0E6D2', color: '#6B5B43' }}
                  >
                    알겠어요
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
