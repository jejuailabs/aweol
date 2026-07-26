'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { camControl, consumeAttack, shakeCamera } from './walker';
import MobBody from './MobBody';
import { playSound } from '@/lib/sound';
import {
  AGGRO_RANGE, ATTACK_ARC, ATTACK_COOLDOWN_MS, ATTACK_RANGE, BOSS_TALK_RANGE,
  HIT_STUN_MS, KNOCKBACK, LABEL_RANGE, SHOW_RANGE, type Mob,
} from '@/lib/village-mobs';

/**
 * 마을 정화 — **베는 부분.**
 *
 * 타격감은 한 가지로 안 난다. 여섯 겹을 같은 순간에 겹쳐 쌓는다.
 * 소리(3중) · 화면 흔들림 · 경직 · 넉백 · 찌그러짐 · 떠오르는 숫자.
 * 하나라도 빼면 "허공을 치는 것 같다" 는 말이 나온다.
 *
 * ---
 *
 * **우두머리는 먼저 두들긴 다음 문제가 나온다.**
 *
 * 처음에는 거꾸로 만들었다 — 다가가면 문제부터 뜨고, 맞혀야 벨 수 있었다.
 * 그러면 **칼이 장식**이다. 문제를 푸는 놈한테 칼을 왜 뽑나.
 * 지금은 체력을 다 깎으면 껍질이 벗겨지며 **약점이 드러나고**, 그때 문제가 뜬다.
 * RPG 에서 마무리 일격을 넣는 자리와 같다.
 *
 * ---
 *
 * **멀리 있는 것은 아예 안 그린다.**
 *
 * 마을이 800m 인데 열여섯 마리를 늘 띄워두면 어느 게 가까운지 모르고,
 * `Html` 이 열여섯 개 떠 있어 느려진다. 95m 안쪽만 그리고, 이름표는 42m 안쪽만.
 * 걸어가면 하나씩 나타난다 — 그게 탐험이다.
 */

interface MobRT {
  hp: number;
  dead: boolean;
  deadAt: number;
  /** 체력이 다 깎였다 — 우두머리는 여기서 문제가 뜬다 */
  weak: boolean;
  ox: number;
  oz: number;
  stunUntil: number;
  flash: number;
  squash: number;
}

interface Dmg {
  key: number;
  x: number;
  z: number;
  text: string;
  born: number;
  big?: boolean;
}

/** 화면 밖에 있는 가까운 놈 — 가장자리 화살표에 쓴다 */
export interface OffscreenMob {
  id: string;
  emoji: string;
  /** 왼쪽인가 오른쪽인가 */
  side: 'left' | 'right';
  /** 몇 미터 */
  dist: number;
  /** 화면 세로에서 어디쯤에 붙일까 (0~1). 뒤에 있으면 가운데. */
  t: number;
}

export default function VillageMobs({
  mobs, cleared, solved, avatarPos, onPurified, onBossNear, onBossWeak, onArmedChange,
  onOffscreen,
}: {
  mobs: Mob[];
  /** 이미 정화한 것 — 안 그린다 */
  cleared: ReadonlySet<string>;
  /** 문제를 맞힌 우두머리 — 이걸 보고 마무리한다 */
  solved: ReadonlySet<string>;
  avatarPos: React.RefObject<THREE.Vector3>;
  onPurified: (mob: Mob) => void;
  /** 약점이 드러난 우두머리 곁에 있다 / 아니다 (문제 다시 풀기 단추용) */
  onBossNear: (mob: Mob | null) => void;
  /** 방금 껍질이 벗겨졌다 — 문제를 띄우라고 알린다 */
  onBossWeak: (mob: Mob) => void;
  onArmedChange?: (armed: boolean) => void;
  /** 화면 밖에 있는 가까운 놈들 */
  onOffscreen?: (list: OffscreenMob[]) => void;
}) {
  const { camera, size } = useThree();

  /** 연출이 끝날 때까지 붙잡아 두는 것 (부모가 기록에 적어도 안 사라지게) */
  const [dying, setDying] = useState<ReadonlySet<string>>(() => new Set());

  /** 아직 안 벤 것 + 사라지는 중인 것 */
  const alive = useMemo(
    () => mobs.filter((m) => !cleared.has(m.id) || dying.has(m.id)),
    [mobs, cleared, dying]
  );

  /** 그중 **눈에 들어오는 거리**에 있는 것만 그린다 */
  const [nearIds, setNearIds] = useState<ReadonlySet<string>>(() => new Set());
  const live = useMemo(() => alive.filter((m) => nearIds.has(m.id)), [alive, nearIds]);

  const rt = useRef(new Map<string, MobRT>());
  const groups = useRef(new Map<string, THREE.Group>());
  const nextAttackAt = useRef(0);
  const swing = useRef(0);
  const swordRef = useRef<THREE.Group>(null);
  const arcRef = useRef<THREE.Mesh>(null);

  const [armed, setArmed] = useState(false);
  const [, bump] = useState(0);
  const [dmgs, setDmgs] = useState<Dmg[]>([]);
  const dmgKey = useRef(0);
  /** 마지막으로 알린 화면 밖 목록 — 같으면 다시 안 알린다 */
  const lastOff = useRef('');

  const rtOf = useCallback((id: string): MobRT => {
    let v = rt.current.get(id);
    if (!v) {
      v = {
        hp: 0, dead: false, deadAt: 0, weak: false,
        ox: 0, oz: 0, stunUntil: 0, flash: 0, squash: 0,
      };
      rt.current.set(id, v);
    }
    return v;
  }, []);

  // 자리를 옮기면 싹 잊는다
  useEffect(() => {
    rt.current.clear();
    groups.current.clear();
    setDmgs([]);
    setDying(new Set());
    setNearIds(new Set());
  }, [mobs]);

  // 처음 보는 것은 종류가 정한 체력으로 채운다
  useEffect(() => {
    for (const m of alive) {
      const v = rtOf(m.id);
      if (v.hp === 0 && !v.dead && !v.weak) v.hp = m.kind.hp;
    }
  }, [alive, rtOf]);

  /**
   * 정화되어 사라지게 한다 — 졸개는 체력이 0 일 때, 우두머리는 문제를 맞혔을 때.
   */
  const finish = useCallback((m: Mob, v: MobRT, now: number, x: number, z: number) => {
    v.dead = true;
    v.weak = false;
    v.deadAt = now;
    playSound('purify');
    shakeCamera(0.22);
    setDmgs((prev) => [...prev, { key: dmgKey.current++, x, z, text: '정화!', born: now, big: true }].slice(-14));
    setDying((prev) => new Set(prev).add(m.id));
    setTimeout(() => {
      setDying((prev) => {
        if (!prev.has(m.id)) return prev;
        const next = new Set(prev);
        next.delete(m.id);
        return next;
      });
    }, 560);
    onPurified(m);
  }, [onPurified]);

  /**
   * 문제를 맞힌 우두머리를 마무리한다.
   * 부모가 `solved` 에 넣어주면 여기서 받아 사라지게 한다.
   */
  useEffect(() => {
    if (solved.size === 0) return;
    const now = performance.now();
    for (const m of alive) {
      if (!solved.has(m.id)) continue;
      const v = rtOf(m.id);
      if (v.dead) continue;
      finish(m, v, now, m.x + v.ox, m.z + v.oz);
    }
    bump((n) => n + 1);
  }, [solved, alive, rtOf, finish]);

  /**
   * 눈에 들어오는 것 / 약점이 드러난 우두머리 곁인가.
   * 매 프레임 볼 것이 아니라 가끔만 본다.
   */
  useEffect(() => {
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;

      const seen = new Set<string>();
      let boss: Mob | null = null;
      for (const m of alive) {
        const v = rtOf(m.id);
        const d = Math.hypot(p.x - (m.x + v.ox), p.z - (m.z + v.oz));
        if (d < SHOW_RANGE || v.dead) seen.add(m.id);
        // 껍질이 벗겨진 채 남아 있는 놈 — 다시 풀 수 있게 알린다
        if (!boss && v.weak && !v.dead && d < BOSS_TALK_RANGE * 1.6) boss = m;
      }
      setNearIds((prev) => {
        if (prev.size === seen.size && Array.from(seen).every((id) => prev.has(id))) return prev;
        return seen;
      });
      onBossNear(boss);

      /*
        ---------- 화면 밖에 있는 놈 ----------

        **폰은 가로로 좁다.** `fov` 는 세로 기준이라 세로로 긴 화면에서는
        가로 시야가 통째로 줄어든다 — 실측으로 PC 89도, 폰 37도다.
        40m 앞에서 담기는 폭이 27m 인데 몹은 12~38m 간격이라,
        걷는 내내 한 마리도 화면에 안 들어오는 구간이 생긴다.
        "모바일에서는 몹이 안 보인다" 가 이것이다.

        그래서 **어느 쪽에 있는지 가장자리에 알려준다.** RPG 에서 화면 밖
        적을 화살표로 가리키는 것과 같다. 시야를 억지로 더 넓히면
        어안렌즈처럼 휘어서 그게 더 이상하다.
      */
      if (onOffscreen) {
        const cam = camera as THREE.PerspectiveCamera;
        const aspect = size.height > 0 ? size.width / size.height : 1;
        // 세로 fov 에서 가로 반각을 낸다
        const halfH = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect);
        const yaw = camControl.yaw;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        // 오른쪽 방향 (칼을 드는 쪽과 같은 계산)
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);

        const off: OffscreenMob[] = [];
        for (const m of alive) {
          const v = rtOf(m.id);
          if (v.dead) continue;
          const dx = m.x + v.ox - p.x;
          const dz = m.z + v.oz - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist > SHOW_RANGE * 0.75) continue;
          const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
          // 가장자리에 걸친 것은 이미 보이므로 조금 여유를 둔다
          if (Math.abs(ang) < halfH * 0.88) continue;
          off.push({
            id: m.id,
            emoji: m.kind.emoji,
            side: ang > 0 ? 'right' : 'left',
            dist: Math.round(dist),
            // 앞쪽에 가까울수록 위, 뒤로 갈수록 아래
            t: Math.min(1, Math.max(0, Math.abs(ang) / Math.PI)),
          });
        }
        off.sort((a, b) => a.dist - b.dist);
        const next = off.slice(0, 3);
        /*
          **바뀌었을 때만 알린다.** 그냥 넘기면 0.22초마다 새 배열이라
          아무 일이 없어도 화면이 계속 다시 그려진다.
          거리는 5m 단위로 뭉개서 본다 — 한 걸음마다 숫자가 떨리면 그것도 산만하다.
        */
        const key = next.map((o) => `${o.id}:${o.side}:${Math.round(o.dist / 5)}`).join('|');
        if (key !== lastOff.current) {
          lastOff.current = key;
          onOffscreen(next);
        }
      }
    }, 220);
    return () => clearInterval(t);
  }, [alive, avatarPos, onBossNear, rtOf, onOffscreen, camera, size.width, size.height]);

  /** 떠오른 숫자를 치운다 */
  useEffect(() => {
    if (dmgs.length === 0) return;
    const t = setInterval(() => {
      const now = performance.now();
      setDmgs((prev) => {
        const next = prev.filter((d) => now - d.born < 900);
        return next.length === prev.length ? prev : next;
      });
    }, 300);
    return () => clearInterval(t);
  }, [dmgs.length]);

  /**
   * 한 번 휘두른다. **앞쪽 부채꼴 안에 있는 것만** 맞는다.
   * 방향은 카메라가 보는 쪽이다(가만히 서 있어도 어디를 보는지 알 수 있다).
   */
  const strike = useCallback((p: THREE.Vector3, now: number) => {
    const fx = -Math.sin(camControl.yaw);
    const fz = -Math.cos(camControl.yaw);
    const minCos = Math.cos(ATTACK_ARC / 2);

    let landed = 0;
    const added: Dmg[] = [];

    for (const m of live) {
      const v = rtOf(m.id);
      if (v.dead) continue;

      const mx = m.x + v.ox;
      const mz = m.z + v.oz;
      const dx = mx - p.x;
      const dz = mz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ATTACK_RANGE || dist < 0.0001) continue;
      if ((dx * fx + dz * fz) / dist < minCos) continue;

      // 이미 약점이 드러난 우두머리는 더 때려도 소용없다 — 문제를 풀어야 한다
      if (v.weak) {
        v.flash = 0.4;
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '문제!', born: now });
        landed++;
        onBossWeak(m);
        continue;
      }

      v.hp -= 1;
      v.flash = 1;
      v.squash = 1;
      v.stunUntil = now + HIT_STUN_MS;
      v.ox += (dx / dist) * KNOCKBACK;
      v.oz += (dz / dist) * KNOCKBACK;
      landed++;

      if (v.hp > 0) {
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '1', born: now });
        continue;
      }

      if (m.quiz) {
        /*
          **여기서 죽지 않는다.** 껍질이 벗겨지고 약점이 드러날 뿐이다.
          마무리는 문제를 맞혀야 들어간다.
        */
        v.weak = true;
        v.stunUntil = now + 420;
        playSound('shatter');
        shakeCamera(0.3);
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '껍질이 깨졌다!', born: now, big: true });
        onBossWeak(m);
      } else {
        finish(m, v, now, mx, mz);
      }
    }

    if (landed > 0) {
      playSound('hit');
      shakeCamera(0.14);
      try { navigator.vibrate?.(28); } catch {}
      setDmgs((prev) => [...prev, ...added].slice(-14));
      bump((n) => n + 1);
    }
  }, [live, rtOf, onBossWeak, finish]);

  useFrame((_, delta) => {
    const p = avatarPos.current;
    if (!p) return;
    const now = performance.now();

    if (consumeAttack() && now >= nextAttackAt.current) {
      nextAttackAt.current = now + ATTACK_COOLDOWN_MS;
      swing.current = 1;
      playSound('slash');
      strike(p, now);
    }

    // 가까이 뭔가 있을 때만 칼을 뽑는다
    let anyNear = false;
    for (const m of live) {
      const v = rtOf(m.id);
      if (v.dead) continue;
      if (Math.hypot(p.x - (m.x + v.ox), p.z - (m.z + v.oz)) < AGGRO_RANGE) { anyNear = true; break; }
    }
    if (anyNear !== armed) { setArmed(anyNear); onArmedChange?.(anyNear); }

    if (swing.current > 0) swing.current = Math.max(0, swing.current - delta * 4.4);

    const yaw = camControl.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);

    const sw = swordRef.current;
    if (sw) {
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const e = 1 - Math.pow(1 - swing.current, 2);
      sw.position.set(
        p.x + rx * (0.55 - e * 0.2) + fx * e * 1.5,
        1.0 + e * 0.35,
        p.z + rz * (0.55 - e * 0.2) + fz * e * 1.5
      );
      sw.rotation.set(-e * 1.9 + 0.35, yaw, 0.4 - e * 0.6);
      sw.visible = armed;
    }

    const arc = arcRef.current;
    if (arc) {
      const s = swing.current;
      arc.visible = s > 0.05;
      if (s > 0.05) {
        arc.position.set(p.x + fx * 2.0, 1.05, p.z + fz * 2.0);
        arc.rotation.set(-Math.PI / 2, 0, -yaw);
        const sc = 1.1 + (1 - s) * 1.5;
        arc.scale.set(sc, sc, sc);
        (arc.material as THREE.MeshBasicMaterial).opacity = s * 0.75;
      }
    }

    // ---------- 몹 ----------
    for (const m of live) {
      const g = groups.current.get(m.id);
      const v = rtOf(m.id);
      if (!g) continue;

      v.ox *= 1 - Math.min(1, delta * 2.2);
      v.oz *= 1 - Math.min(1, delta * 2.2);
      v.flash = Math.max(0, v.flash - delta * 4.5);
      v.squash = Math.max(0, v.squash - delta * 5.5);

      // 맞으면 하얗게 번쩍인다 — 재질을 직접 만진다
      const f = v.flash;
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat && mat.emissive && mat.emissiveIntensity !== undefined && mat.userData.flashable !== false) {
          if (mat.emissive.r === 1 && mat.emissive.g === 1 && mat.emissive.b === 1) {
            mat.emissiveIntensity = f;
          }
        }
      });

      if (v.dead) {
        const t = Math.min(1, (now - v.deadAt) / 480);
        g.visible = t < 1;
        g.position.set(m.x + v.ox, 0.95 + t * 1.6, m.z + v.oz);
        const sc = Math.max(0.001, 1 - t);
        g.scale.set(sc, sc, sc);
        g.rotation.y += delta * 9;
        continue;
      }

      g.visible = true;
      const stunned = now < v.stunUntil;
      const t = now * 0.001;
      const base = m.kind.tier === 'boss' ? 1.15 : 0.95;

      g.position.set(m.x + v.ox, base, m.z + v.oz);

      const q = v.squash;
      // 약점이 드러나면 크게 헐떡인다 — 지금 때릴 때라는 표시
      const puff = v.weak ? 1 + Math.sin(t * 9) * 0.09 : 1;
      g.scale.set((1 + q * 0.45) * puff, (1 - q * 0.4) * puff, (1 + q * 0.45) * puff);

      if (stunned) {
        g.position.x += (Math.random() - 0.5) * 0.14;
        g.position.z += (Math.random() - 0.5) * 0.14;
      } else {
        const near = Math.hypot(p.x - m.x, p.z - m.z) < AGGRO_RANGE;
        const sp = near ? 5.2 : 1.6;
        const amp = near ? 0.18 : 0.08;
        g.position.y = base + Math.sin(t * sp + m.x) * amp;
        // 가까이 오면 나를 본다
        g.rotation.y = near || v.weak
          ? Math.atan2(p.x - m.x, p.z - m.z)
          : Math.sin(t * 0.6 + m.z) * 0.6;
      }
    }
  });

  return (
    <group>
      {/* 정화의 검 */}
      <group ref={swordRef} visible={false}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.075, 0.85, 0.02]} />
          <meshStandardMaterial
            color="#DFF3FF" emissive="#6FC6E8" emissiveIntensity={0.7}
            metalness={0.75} roughness={0.22}
          />
        </mesh>
        <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.055, 0.055, 0.02]} />
          <meshStandardMaterial color="#EAF9FF" emissive="#8FD8F5" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.3, 0.06, 0.06]} />
          <meshStandardMaterial color="#E8C067" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
          <meshStandardMaterial color="#7A5A3C" roughness={0.85} />
        </mesh>
      </group>

      {/* 베어낸 자국 */}
      <mesh ref={arcRef} visible={false}>
        <ringGeometry args={[0.75, 1.5, 24, 1, 0, Math.PI * 0.85]} />
        <meshBasicMaterial
          color="#CFF3FF" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>

      {/* 몹 — 눈에 들어오는 거리 안쪽만 */}
      {live.map((m) => {
        const v = rt.current.get(m.id);
        const isBoss = m.kind.tier === 'boss';
        const weak = !!v?.weak;
        const p = avatarPos.current;
        const dist = p ? Math.hypot(p.x - m.x, p.z - m.z) : 999;
        const showLabel = dist < LABEL_RANGE || weak;
        return (
          <group
            key={m.id}
            ref={(g) => {
              if (g) groups.current.set(m.id, g);
              else groups.current.delete(m.id);
            }}
            position={[m.x, isBoss ? 1.15 : 0.95, m.z]}
          >
            <MobBody kindId={m.kind.id} color={m.kind.color} />

            {/* 약점이 드러난 표시 — 붉게 도는 고리 */}
            {weak && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
                <ringGeometry args={[1.3, 1.7, 24]} />
                <meshBasicMaterial color="#FF9A6B" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
            )}

            {/* 그림자 */}
            <mesh position={[0, isBoss ? -1.1 : -0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[isBoss ? 1.1 : 0.7, 14]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
            </mesh>

            {showLabel && (
              <Html center position={[0, isBoss ? 1.9 : 1.35, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
                <div style={{ textAlign: 'center', width: 110, marginLeft: -55 }}>
                  <div
                    style={{
                      fontSize: 10, fontWeight: 900, color: '#FFF8E7',
                      textShadow: '0 1px 3px rgba(0,0,0,.8)', whiteSpace: 'nowrap', marginBottom: 2,
                    }}
                  >
                    {m.kind.name}
                  </div>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center' }}>
                    {/*
                      **문제가 나오는 놈은 미리 알려준다.**
                      다 두들겼는데 갑자기 문제가 뜨면 놀란다 — 각오하고 치는 것과
                      다르다. 물음표 하나면 충분하다.
                    */}
                    {m.quiz && (
                      <span
                        style={{
                          fontSize: 9, fontWeight: 900, color: '#7A2E10',
                          background: '#FFD9A8', borderRadius: 6, padding: '0 3px',
                          marginRight: 2, lineHeight: '11px',
                        }}
                      >
                        ?
                      </span>
                    )}
                    {Array.from({ length: m.kind.hp }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width: isBoss ? 14 : 11, height: 5, borderRadius: 3,
                          background: i < (v?.hp ?? m.kind.hp) ? (isBoss ? '#E8604C' : '#7ED08A') : 'rgba(0,0,0,0.32)',
                          boxShadow: '0 1px 2px rgba(0,0,0,.4)',
                        }}
                      />
                    ))}
                  </div>
                  {weak && (
                    <div
                      style={{
                        marginTop: 3, fontSize: 10, fontWeight: 900, color: '#7A2E10',
                        background: 'rgba(255,206,166,0.95)', borderRadius: 8, padding: '1px 6px',
                        display: 'inline-block', whiteSpace: 'nowrap',
                      }}
                    >
                      ❗ 문제를 풀어 마무리!
                    </div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* 떠오르는 숫자 */}
      {dmgs.map((d) => (
        <Html
          key={d.key}
          center
          position={[d.x, 1.9, d.z]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              fontSize: d.big ? 15 : 21,
              fontWeight: 900,
              color: d.big ? '#9CF0C2' : '#FFF0A8',
              textShadow: '0 2px 0 rgba(0,0,0,.55), 0 0 10px rgba(0,0,0,.4)',
              whiteSpace: 'nowrap',
              animation: 'dmg-float 0.9s ease-out both',
            }}
          >
            {d.text}
          </div>
        </Html>
      ))}
    </group>
  );
}
