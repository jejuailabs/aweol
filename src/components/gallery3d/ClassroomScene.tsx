'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

export interface ClassroomActivity {
  id: string;
  title: string;
  description: string;
  date: string;
  emoji: string;
  color: string;
}

interface ClassroomSceneProps {
  classLabel: string;
  activities: ClassroomActivity[];
  onActivitySelect: (id: string) => void;
}

// --------------- 교실 구조 ---------------
function RoomShell() {
  const W = 14;
  const H = 4.2;
  const D = 12;
  const halfW = W * 0.5;
  const halfH = H * 0.5;
  const halfD = D * 0.5;

  return (
    <group>
      {/* 바닥 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#D8A876" roughness={0.65} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`fl-${i}`} rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.004, -halfD + i * 1.8 + 0.9]}>
          <planeGeometry args={[W, 0.025]} />
          <meshStandardMaterial color="#C08E58" />
        </mesh>
      ))}

      {/* 천장 */}
      <mesh rotation={[HALF_PI, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#FDFBF5" />
      </mesh>

      {/* 뒷벽 (칠판 벽) */}
      <mesh position={[0, halfH, -halfD]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#F6EEDF" />
      </mesh>

      {/* 왼쪽 벽 (창문) */}
      <mesh position={[-halfW, halfH, 0]} rotation={[0, HALF_PI, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#F2E9D8" />
      </mesh>

      {/* 오른쪽 벽 (게시판 벽) */}
      <mesh position={[halfW, halfH, 0]} rotation={[0, NEG_HALF_PI, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial color="#F2E9D8" />
      </mesh>

      {/* 앞벽 */}
      <mesh position={[0, halfH, halfD]} rotation={[0, PI, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#F6EEDF" />
      </mesh>

      {/* 걸레받이 */}
      <mesh position={[0, 0.07, -halfD + 0.02]}>
        <boxGeometry args={[W, 0.14, 0.04]} />
        <meshStandardMaterial color="#9C7248" />
      </mesh>
      <mesh position={[-halfW + 0.02, 0.07, 0]} rotation={[0, HALF_PI, 0]}>
        <boxGeometry args={[D, 0.14, 0.04]} />
        <meshStandardMaterial color="#9C7248" />
      </mesh>
      <mesh position={[halfW - 0.02, 0.07, 0]} rotation={[0, NEG_HALF_PI, 0]}>
        <boxGeometry args={[D, 0.14, 0.04]} />
        <meshStandardMaterial color="#9C7248" />
      </mesh>

      {/* 창문 3개 (왼쪽 벽) */}
      {[-3.2, 0, 3.2].map((z) => (
        <group key={`win-${z}`} position={[-halfW + 0.03, 2.3, z]} rotation={[0, HALF_PI, 0]}>
          <mesh>
            <boxGeometry args={[2.2, 1.7, 0.06]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <planeGeometry args={[1.95, 1.45]} />
            <meshStandardMaterial color="#AEDCF5" emissive="#AEDCF5" emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <boxGeometry args={[0.05, 1.45, 0.02]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <boxGeometry args={[1.95, 0.05, 0.02]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        </group>
      ))}

      {/* 시계 (앞벽) */}
      <group position={[0, 3.5, halfD - 0.05]} rotation={[0, PI, 0]}>
        <mesh>
          <cylinderGeometry args={[0.32, 0.32, 0.05, 24]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      </group>
    </group>
  );
}

// --------------- 칠판 ---------------
function Blackboard({ classLabel }: { classLabel: string }) {
  return (
    <group position={[0, 2.15, -5.93]}>
      {/* 나무 프레임 */}
      <mesh castShadow>
        <boxGeometry args={[6.4, 2.15, 0.08]} />
        <meshStandardMaterial color="#A97B4F" roughness={0.5} />
      </mesh>
      {/* 칠판면 */}
      <mesh position={[0, 0.04, 0.045]}>
        <planeGeometry args={[6.05, 1.85]} />
        <meshStandardMaterial color="#2E5844" roughness={0.85} />
      </mesh>
      {/* 분필 받침 */}
      <mesh position={[0, -1.12, 0.12]}>
        <boxGeometry args={[6.4, 0.07, 0.22]} />
        <meshStandardMaterial color="#8F6238" />
      </mesh>
      {/* 칠판 글씨 */}
      <Html position={[0, 0.1, 0.06]} transform scale={0.42} pointerEvents="none">
        <div style={{ width: '560px', textAlign: 'center', userSelect: 'none' }}>
          <div style={{ color: '#FFF8E7', fontSize: '44px', fontWeight: 800, textShadow: '0 0 6px rgba(255,255,255,0.25)', fontFamily: 'Pretendard, sans-serif' }}>
            {classLabel} 교실
          </div>
          <div style={{ color: '#CDE8D8', fontSize: '20px', marginTop: '8px', fontFamily: 'Pretendard, sans-serif' }}>
            게시판에서 보고 싶은 활동을 눌러보세요 ✏️
          </div>
        </div>
      </Html>
      {/* 태극기 */}
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[0.75, 0.5, 0.03]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

// --------------- 게시판 + 활동 포스터 ---------------
function ActivityBoard({
  activities,
  onActivitySelect,
}: {
  activities: ClassroomActivity[];
  onActivitySelect: (id: string) => void;
}) {
  const boardW = 9.6;
  const boardH = 2.6;

  return (
    <group position={[6.93, 2.05, 0]} rotation={[0, NEG_HALF_PI, 0]}>
      {/* 코르크 보드 */}
      <mesh castShadow>
        <boxGeometry args={[boardW + 0.3, boardH + 0.3, 0.06]} />
        <meshStandardMaterial color="#A97B4F" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[boardW, boardH]} />
        <meshStandardMaterial color="#D9B98A" roughness={0.95} />
      </mesh>
      {/* 보드 제목 */}
      <Html position={[0, boardH * 0.5 + 0.42, 0.05]} transform scale={0.4} pointerEvents="none">
        <div
          style={{
            background: '#3EC46D', color: 'white', fontWeight: 800, fontSize: '30px',
            padding: '10px 36px', borderRadius: '999px', fontFamily: 'Pretendard, sans-serif',
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)', whiteSpace: 'nowrap', userSelect: 'none',
          }}
        >
          🎨 우리 반 활동 전시
        </div>
      </Html>

      {/* 활동 포스터들 (최대 8개, 2행) */}
      {activities.slice(0, 8).map((act, i) => {
        const col = i % 4;
        const row = i < 4 ? 0 : 1;
        const x = -3.5 + col * 2.34;
        const y = row === 0 ? 0.62 : -0.68;
        const tilt = (i % 3 === 0 ? 1 : -1) * 0.035;
        return (
          <ActivityPoster
            key={act.id}
            activity={act}
            position={[x, y, 0.06]}
            tilt={tilt}
            onClick={() => onActivitySelect(act.id)}
          />
        );
      })}
    </group>
  );
}

function ActivityPoster({
  activity,
  position,
  tilt,
  onClick,
}: {
  activity: ClassroomActivity;
  position: [number, number, number];
  tilt: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position} rotation={[0, 0, tilt]}>
      {/* 압정 */}
      <mesh position={[0, 0.52, 0.045]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color="#E74C3C" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* 포스터 카드 */}
      <Html position={[0, 0, 0.02]} transform scale={0.4} zIndexRange={[10, 0]}>
        <button
          onClick={onClick}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            width: '210px', height: '250px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            background: '#FFFFFF', overflow: 'hidden', fontFamily: 'Pretendard, sans-serif',
            boxShadow: hovered ? '0 10px 26px rgba(0,0,0,0.35)' : '0 5px 14px rgba(0,0,0,0.22)',
            transform: hovered ? 'scale(1.07)' : 'scale(1)',
            transition: 'all 0.18s ease', display: 'flex', flexDirection: 'column', padding: 0,
          }}
        >
          <div style={{ height: '120px', background: activity.color + '38', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '58px' }}>
            {activity.emoji}
          </div>
          <div style={{ padding: '12px 14px', textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: '19px', color: '#2B2B2B', lineHeight: 1.2 }}>{activity.title}</div>
            <div style={{ fontSize: '12.5px', color: '#6B7280', marginTop: '5px', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {activity.description}
            </div>
            <div style={{ marginTop: 'auto', fontSize: '11px', color: '#9CA3AF' }}>{activity.date}</div>
          </div>
          <div style={{ background: activity.color, color: 'white', fontWeight: 700, fontSize: '13px', padding: '7px 0' }}>
            전시실 입장 →
          </div>
        </button>
      </Html>
    </group>
  );
}

// --------------- 책상들 ---------------
function Desks() {
  const rows = [1.2, 3.2];
  const cols = [-3.6, -1.2, 1.2, 3.6];
  return (
    <group>
      {rows.map((z) =>
        cols.map((x) => (
          <group key={`desk-${x}-${z}`} position={[x, 0, z]}>
            {/* 상판 */}
            <mesh position={[0, 0.62, 0]} castShadow>
              <boxGeometry args={[0.85, 0.05, 0.55]} />
              <meshStandardMaterial color="#E8C89A" roughness={0.5} />
            </mesh>
            {/* 다리 */}
            {([[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]] as [number, number][]).map(([lx, lz]) => (
              <mesh key={`l-${lx}-${lz}`} position={[lx, 0.3, lz]}>
                <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
                <meshStandardMaterial color="#8A8A8A" metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
            {/* 의자 */}
            <mesh position={[0, 0.36, 0.5]} castShadow>
              <boxGeometry args={[0.42, 0.05, 0.4]} />
              <meshStandardMaterial color="#5FA8D3" />
            </mesh>
            <mesh position={[0, 0.62, 0.68]}>
              <boxGeometry args={[0.42, 0.5, 0.05]} />
              <meshStandardMaterial color="#5FA8D3" />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}

// --------------- 카메라 연출 ---------------
function ClassroomCamera() {
  const { camera, pointer } = useThree();
  const introT = useRef(0);
  const base = useRef(new THREE.Vector3(-1.5, 2.5, 5.4));
  const introFrom = useRef(new THREE.Vector3(0, 3.4, 9.5));

  useFrame((state, delta) => {
    if (introT.current < 1) {
      introT.current = Math.min(1, introT.current + delta * 0.5);
      const ease = 1 - Math.pow(1 - introT.current, 3);
      camera.position.lerpVectors(introFrom.current, base.current, ease);
    } else {
      const t = state.clock.elapsedTime;
      const targetX = base.current.x + Math.sin(t * 0.25) * 0.25 + pointer.x * 0.7;
      const targetY = base.current.y + Math.cos(t * 0.2) * 0.1 + pointer.y * 0.3;
      camera.position.x += (targetX - camera.position.x) * 2 * delta;
      camera.position.y += (targetY - camera.position.y) * 2 * delta;
    }
    camera.lookAt(2.2, 1.7, -1.5);
  });

  return null;
}

// --------------- 조명 ---------------
function ClassroomLighting() {
  return (
    <>
      <ambientLight intensity={0.55} color="#FFF6E6" />
      <directionalLight position={[-6, 5, 2]} intensity={0.9} color="#FFF2D9" castShadow />
      <pointLight position={[0, 3.8, 0]} intensity={0.35} color="#FFF8E7" distance={16} />
      <pointLight position={[6, 3, 0]} intensity={0.3} color="#FFF8E7" distance={10} />
    </>
  );
}

// --------------- 메인 ---------------
export default function ClassroomScene({ classLabel, activities, onActivitySelect }: ClassroomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        camera={{ position: [0, 3.4, 9.5], fov: 52, near: 0.1, far: 60 }}
        gl={{ antialias: true }}
        dpr={[1, 2]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#F2E9D8' }}
      >
        <ClassroomLighting />
        <RoomShell />
        <Blackboard classLabel={classLabel} />
        <ActivityBoard activities={activities} onActivitySelect={onActivitySelect} />
        <Desks />
        <ClassroomCamera />
      </Canvas>
    </div>
  );
}
