'use client';

import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const NEG_HALF_PI = -PI * 0.5;

// 드래그 카메라 회전 상태 (360도 자유 회전 + 줌)
const dragState = { yaw: 0, radius: 6.4 };

// 키 입력 (e.code 기반 — 한글 자판에서도 동작)
const classKeys: Record<string, boolean> = {};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    classKeys[e.code] = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { classKeys[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(classKeys).forEach((k) => { classKeys[k] = false; }); });
}

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
  canManage?: boolean;
  onAddActivity?: () => void;
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
  canManage,
  onAddActivity,
}: {
  activities: ClassroomActivity[];
  onActivitySelect: (id: string) => void;
  canManage?: boolean;
  onAddActivity?: () => void;
}) {
  const boardW = 10.2;
  const boardH = 3.3;
  // 4열 x 2행 슬롯 — 카드(가로형 약 1.7x1.05)가 여백을 두고 차곡차곡 들어가는 간격
  const colX = [-3.72, -1.24, 1.24, 3.72];
  const rowY = [0.82, -0.82];

  return (
    <group position={[6.93, 2.1, 0]} rotation={[0, NEG_HALF_PI, 0]}>
      {/* 코르크 보드 */}
      <mesh castShadow>
        <boxGeometry args={[boardW + 0.34, boardH + 0.34, 0.06]} />
        <meshStandardMaterial color="#A97B4F" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[boardW, boardH]} />
        <meshStandardMaterial color="#D9B98A" roughness={0.95} />
      </mesh>
      {/* 보드 제목 — 동숲 팻말 */}
      <Html position={[0, boardH * 0.5 + 0.4, 0.05]} transform scale={0.38} pointerEvents="none" zIndexRange={[5, 0]}>
        <div
          style={{
            background: '#FFF8E7', color: '#7A6A52', fontWeight: 800, fontSize: '28px',
            padding: '10px 38px', borderRadius: '999px', fontFamily: 'Pretendard, sans-serif',
            border: '4px solid #EFE3CB',
            boxShadow: '0 5px 0 #E3D5B8, 0 10px 18px rgba(0,0,0,0.18)',
            whiteSpace: 'nowrap', userSelect: 'none',
          }}
        >
          🎨 우리 반 활동 전시
        </div>
      </Html>

      {/* 활동 포스터들 (최대 8개, 4열 x 2행 차곡차곡) */}
      {activities.slice(0, 8).map((act, i) => {
        const x = colX[i % 4];
        const y = rowY[i < 4 ? 0 : 1];
        const tilt = (i % 3 === 0 ? 1 : -1) * 0.022;
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

      {/* 교사 전용: 다음 빈 슬롯에 + 새 활동 카드 */}
      {canManage && onAddActivity && activities.length < 8 && (() => {
        const i = activities.length;
        const x = colX[i % 4];
        const y = rowY[i < 4 ? 0 : 1];
        return <AddActivityPoster position={[x, y, 0.06]} onClick={onAddActivity} />;
      })()}
    </group>
  );
}

function AddActivityPoster({
  position,
  onClick,
}: {
  position: [number, number, number];
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      <Html position={[0, 0, 0.02]} transform scale={0.3} zIndexRange={[10, 0]}>
        <button
          onClick={onClick}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            width: '236px', height: '148px', borderRadius: '18px', cursor: 'pointer',
            background: hovered ? 'rgba(255,248,231,0.85)' : 'rgba(255,248,231,0.5)',
            border: '4px dashed #C9AE7E', fontFamily: 'Pretendard, sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '7px', transition: 'all 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: hovered ? 'translateY(-4px) scale(1.05)' : 'scale(1)',
          }}
        >
          <div
            style={{
              width: '46px', height: '46px', borderRadius: '50%', background: '#8FD98A',
              color: '#2E5B2A', fontSize: '30px', fontWeight: 800, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '3px solid #7BC876',
              boxShadow: '0 4px 0 #6AB565, 0 8px 14px rgba(0,0,0,0.15)',
            }}
          >
            +
          </div>
          <div style={{ fontWeight: 800, fontSize: '16px', color: '#7A6A52' }}>새 활동 만들기</div>
          <div style={{ fontSize: '11px', color: '#A89880', lineHeight: 1.3, textAlign: 'center' }}>
            수업 이름을 넣고 작품을 전시해요
          </div>
        </button>
      </Html>
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
      <mesh position={[0, 0.56, 0.05]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshStandardMaterial color="#E74C3C" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* 동숲 명패식 가로 카드 */}
      <Html position={[0, 0, 0.02]} transform scale={0.3} zIndexRange={[10, 0]}>
        <button
          onClick={onClick}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          style={{
            width: '236px', height: '148px', borderRadius: '18px', cursor: 'pointer',
            background: '#FFF8E7', overflow: 'hidden', fontFamily: 'Pretendard, sans-serif',
            border: '3px solid #EFE3CB',
            boxShadow: hovered
              ? '0 6px 0 #E3D5B8, 0 14px 26px rgba(0,0,0,0.3)'
              : '0 4px 0 #E3D5B8, 0 8px 16px rgba(0,0,0,0.2)',
            transform: hovered ? 'translateY(-4px) scale(1.05)' : 'scale(1)',
            transition: 'all 0.16s cubic-bezier(0.34, 1.56, 0.64, 1)',
            display: 'flex', flexDirection: 'column', padding: 0, textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px 6px' }}>
            <div
              style={{
                width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                background: activity.color + '40', border: `2.5px solid ${activity.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
              }}
            >
              {activity.emoji}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '17px', color: '#6B5B43', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activity.title}
              </div>
              <div style={{ fontSize: '10.5px', color: '#A89880', marginTop: '2px' }}>{activity.date}</div>
            </div>
          </div>
          <div style={{ padding: '0 14px', fontSize: '11.5px', color: '#8A7A5F', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {activity.description}
          </div>
          <div
            style={{
              marginTop: 'auto', background: activity.color, color: 'white', fontWeight: 800,
              fontSize: '12px', padding: '7px 0', textAlign: 'center', letterSpacing: '0.02em',
            }}
          >
            전시실 입장 →
          </div>
        </button>
      </Html>
    </group>
  );
}

// --------------- 책상들 (캔디 컬러 의자) ---------------
function Desks() {
  const rows = [1.2, 3.2];
  const cols = [-3.6, -1.2, 1.2, 3.6];
  const chairColors = ['#E8493C', '#FFD93D', '#4FA8E8', '#8FD98A'];
  return (
    <group>
      {rows.map((z, ri) =>
        cols.map((x, ci) => {
          const chairColor = chairColors[(ri * 4 + ci) % 4];
          return (
            <group key={`desk-${x}-${z}`} position={[x, 0, z]}>
              {/* 상판 */}
              <mesh position={[0, 0.62, 0]} castShadow>
                <boxGeometry args={[0.85, 0.05, 0.55]} />
                <meshStandardMaterial color="#F2D5A0" roughness={0.5} />
              </mesh>
              {/* 다리 */}
              {([[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]] as [number, number][]).map(([lx, lz]) => (
                <mesh key={`l-${lx}-${lz}`} position={[lx, 0.3, lz]}>
                  <cylinderGeometry args={[0.025, 0.025, 0.6, 8]} />
                  <meshStandardMaterial color="#8A8A8A" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
              {/* 의자 — 반마다 다른 캔디 컬러 */}
              <mesh position={[0, 0.36, 0.5]} castShadow>
                <boxGeometry args={[0.42, 0.05, 0.4]} />
                <meshStandardMaterial color={chairColor} roughness={0.55} />
              </mesh>
              <mesh position={[0, 0.62, 0.68]}>
                <boxGeometry args={[0.42, 0.5, 0.05]} />
                <meshStandardMaterial color={chairColor} roughness={0.55} />
              </mesh>
            </group>
          );
        })
      )}

      {/* 교실 중앙 원형 러그 */}
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.012, -2.2]}>
        <circleGeometry args={[1.7, 24]} />
        <meshStandardMaterial color="#8FD98A" roughness={0.95} />
      </mesh>
      <mesh rotation={[NEG_HALF_PI, 0, 0]} position={[0, 0.018, -2.2]}>
        <circleGeometry args={[1.3, 24]} />
        <meshStandardMaterial color="#B8E8B4" roughness={0.95} />
      </mesh>

      {/* 천장 만국기 */}
      {Array.from({ length: 11 }).map((_, i) => {
        const t = i * 0.1;
        const x = -6 + 12 * t;
        const sag = Math.sin(t * PI) * 0.45;
        const colors = ['#E8493C', '#FFD93D', '#4FA8E8', '#8FD98A', '#FF9EAF'];
        return (
          <mesh
            key={`cflag-${i}`}
            position={[x, 3.9 - sag, 0.5]}
            rotation={[PI, 0, 0]}
            scale={[1, 1, 0.2]}
          >
            <coneGeometry args={[0.13, 0.3, 3]} />
            <meshStandardMaterial color={colors[i % 5]} side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

// --------------- 카메라 연출 (드래그+WASD, 360도 자유 회전) ---------------
function ClassroomCamera() {
  const { camera } = useThree();
  const introT = useRef(0);
  const target = useRef(new THREE.Vector3(0, 1.8, -0.5));
  const introFrom = useRef(new THREE.Vector3(0, 3.4, 9.5));

  useFrame((state, delta) => {
    // WASD/방향키: A·D 회전, W·S 줌
    if (classKeys['KeyA'] || classKeys['ArrowLeft']) dragState.yaw += 1.8 * delta;
    if (classKeys['KeyD'] || classKeys['ArrowRight']) dragState.yaw -= 1.8 * delta;
    if (classKeys['KeyW'] || classKeys['ArrowUp']) dragState.radius = Math.max(3.2, dragState.radius - 4.5 * delta);
    if (classKeys['KeyS'] || classKeys['ArrowDown']) dragState.radius = Math.min(8.5, dragState.radius + 4.5 * delta);

    const yaw = dragState.yaw;
    const radius = dragState.radius;
    const orbitPos = new THREE.Vector3(
      target.current.x + Math.sin(yaw) * radius,
      2.6 + Math.cos(state.clock.elapsedTime * 0.2) * 0.08,
      target.current.z + Math.cos(yaw) * radius
    );

    if (introT.current < 1) {
      introT.current = Math.min(1, introT.current + delta * 0.5);
      const ease = 1 - Math.pow(1 - introT.current, 3);
      camera.position.lerpVectors(introFrom.current, orbitPos, ease);
    } else {
      camera.position.lerp(orbitPos, 6 * delta);
    }
    camera.lookAt(target.current);
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
export default function ClassroomScene({ classLabel, activities, onActivitySelect, canManage, onAddActivity }: ClassroomSceneProps) {
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

  // 마우스/터치 드래그로 교실 둘러보기
  useEffect(() => {
    dragState.yaw = -0.5; // 시작 시 게시판이 살짝 보이는 각도
    dragState.radius = 6.4;
    const el = containerRef.current;
    if (!el) return;
    let dragging = false;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = e.clientX - lastX;
      lastX = e.clientX;
      dragState.yaw -= delta * 0.005;
    };
    const onUp = () => { dragging = false; };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
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
        <ActivityBoard
          activities={activities}
          onActivitySelect={onActivitySelect}
          canManage={canManage}
          onAddActivity={onAddActivity}
        />
        <Desks />
        <ClassroomCamera />
      </Canvas>
    </div>
  );
}
