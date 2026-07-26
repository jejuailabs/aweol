'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { camControl, consumeAttack, shakeCamera } from './walker';
import { playSound } from '@/lib/sound';
import {
  AGGRO_RANGE, ATTACK_ARC, ATTACK_COOLDOWN_MS, ATTACK_RANGE, BOSS_TALK_RANGE,
  HIT_STUN_MS, KNOCKBACK, type Mob,
} from '@/lib/village-mobs';

/**
 * 마을 정화 — **베는 부분.**
 *
 * 타격감은 한 가지로 안 난다. 여섯 겹을 같은 순간에 겹쳐 쌓는다.
 *
 * 1. **소리** — 낮은 '퍽' + 잡음 + 칼끝 (`sound.ts` 의 `hit`)
 * 2. **화면 흔들림** — 시선을 턴다 (`shakeCamera`)
 * 3. **경직** — 맞은 것이 잠깐 굳는다. 이게 없으면 때려도 반응이 없어 보인다.
 * 4. **넉백** — 뒤로 밀린다. 밀리는 거리가 곧 '세게 때렸다' 는 느낌이다.
 * 5. **찌그러짐** — 맞는 순간 납작해졌다 돌아온다(스쿼시).
 * 6. **숫자** — 얼마나 들어갔는지 떠오른다.
 *
 * 여기서 **하나라도 빼면 확 심심해진다.** 특히 3번과 5번은 없어도 돌아가지만,
 * 없으면 "허공을 치는 것 같다" 는 말이 나온다.
 *
 * ---
 *
 * **우두머리는 칼이 안 통한다.**
 *
 * 치면 쇳소리를 내며 튕긴다. 문제를 맞혀야 껍질이 깨지고, 그때부터 벨 수 있다.
 * 문제를 푸는 것 자체를 처치로 하지 않은 이유: **그러면 칼이 장식이 된다.**
 * 껍질을 깨고 마무리를 짓는 편이 RPG 문법에 맞고, 맞힌 보람도 크다.
 */

/** 한 마리의 지금 상태 — **상태(state)가 아니라 참조(ref)에 둔다.** */
interface MobRT {
  hp: number;
  dead: boolean;
  /** 죽기 시작한 시각 (사라지는 연출에 쓴다) */
  deadAt: number;
  /** 맞아서 밀려난 만큼 */
  ox: number;
  oz: number;
  /** 언제까지 굳어 있나 */
  stunUntil: number;
  /** 하얗게 번쩍이는 정도 0~1 */
  flash: number;
  /** 찌그러진 정도 0~1 */
  squash: number;
}

/** 떠오르는 숫자 한 개 */
interface Dmg {
  key: number;
  x: number;
  z: number;
  text: string;
  born: number;
  /** 튕겼을 때는 다른 색 */
  blocked?: boolean;
}

export default function VillageMobs({
  mobs, cleared, unlocked, avatarPos, onPurified, onBossNear, onBlocked, onArmedChange,
}: {
  mobs: Mob[];
  /** 이미 정화한 것 — 안 그린다 */
  cleared: ReadonlySet<string>;
  /** 문제를 맞혀 껍질이 깨진 우두머리들 */
  unlocked: ReadonlySet<string>;
  avatarPos: React.RefObject<THREE.Vector3>;
  onPurified: (mob: Mob) => void;
  /** 우두머리에게 다가갔다 / 떨어졌다 */
  onBossNear: (mob: Mob | null) => void;
  /** 껍질에 튕겼다 — 화면에 한 줄 띄우라고 알린다 */
  onBlocked: (mob: Mob) => void;
  /** 칼을 뽑았나 / 넣었나 — 화면 아래 단추가 이걸 보고 바뀐다 */
  onArmedChange?: (armed: boolean) => void;
}) {
  /**
   * 막 벤 것 — **잠깐 더 들고 있는다.**
   *
   * 베는 순간 부모가 기록에 적고, 그러면 `cleared` 에 바로 들어와서
   * **사라지는 연출이 통째로 잘린다**(뻥 하고 없어진다). 정화되는 장면이
   * 이 놀이의 상인데 그게 안 보이면 벨 맛이 없다. 연출이 끝날 때까지만 붙잡는다.
   */
  const [dying, setDying] = useState<ReadonlySet<string>>(() => new Set());

  /** 아직 안 벤 것 + 사라지는 중인 것 */
  const live = useMemo(
    () => mobs.filter((m) => !cleared.has(m.id) || dying.has(m.id)),
    [mobs, cleared, dying]
  );

  const rt = useRef(new Map<string, MobRT>());
  const groups = useRef(new Map<string, THREE.Group>());
  const nextAttackAt = useRef(0);
  /** 휘두르는 중 1 → 0 */
  const swing = useRef(0);
  const swordRef = useRef<THREE.Group>(null);
  const arcRef = useRef<THREE.Mesh>(null);

  /** 칼을 뽑고 있나 — 가까이 뭔가 있을 때만 나온다 */
  const [armed, setArmed] = useState(false);
  /** 그림을 다시 그려야 할 때만 올린다 (체력이 줄거나 죽었을 때) */
  const [, bump] = useState(0);
  const [dmgs, setDmgs] = useState<Dmg[]>([]);
  const dmgKey = useRef(0);

  const rtOf = useCallback((id: string): MobRT => {
    let v = rt.current.get(id);
    if (!v) {
      v = { hp: 0, dead: false, deadAt: 0, ox: 0, oz: 0, stunUntil: 0, flash: 0, squash: 0 };
      rt.current.set(id, v);
    }
    return v;
  }, []);

  // 자리를 옮기면 싹 잊는다 — 곽지에서 때린 것이 애월리까지 따라오면 안 된다
  useEffect(() => {
    rt.current.clear();
    groups.current.clear();
    setDmgs([]);
    setDying(new Set());
  }, [mobs]);

  // 처음 보는 것은 종류가 정한 체력으로 채운다
  useEffect(() => {
    for (const m of live) {
      const v = rtOf(m.id);
      if (v.hp === 0 && !v.dead) v.hp = m.kind.hp;
    }
  }, [live, rtOf]);

  /** 우두머리가 가까이 있나 — 매 프레임 볼 것이 아니라 가끔만 본다 */
  useEffect(() => {
    const t = setInterval(() => {
      const p = avatarPos.current;
      if (!p) return;
      let near: Mob | null = null;
      for (const m of live) {
        if (m.kind.tier !== 'boss') continue;
        const v = rtOf(m.id);
        if (v.dead || unlocked.has(m.id)) continue;
        if (Math.hypot(p.x - (m.x + v.ox), p.z - (m.z + v.oz)) < BOSS_TALK_RANGE) {
          near = m;
          break;
        }
      }
      onBossNear(near);
    }, 240);
    return () => clearInterval(t);
  }, [live, unlocked, avatarPos, onBossNear, rtOf]);

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
   * 한 번 휘두른다.
   *
   * **앞쪽 부채꼴 안에 있는 것만** 맞는다. 거리만 보면 등 뒤의 것도 맞아서
   * 방향을 맞출 이유가 사라진다 — 그러면 버튼만 연타하는 놀이가 된다.
   *
   * 방향은 **카메라가 보는 쪽**이다. 아바타가 보는 쪽으로 하면 가만히 선 채로는
   * 어디를 보는지 알 수 없다(마지막으로 걷던 방향이 남아 있다).
   */
  const strike = useCallback((p: THREE.Vector3, now: number) => {
    // FollowCamera 가 카메라를 (sin yaw, cos yaw) 쪽에 두므로 보는 쪽은 그 반대다
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

      // 우두머리는 껍질이 깨지기 전에는 안 통한다
      if (m.kind.tier === 'boss' && !unlocked.has(m.id)) {
        v.flash = 0.5;
        v.stunUntil = now + 90;
        playSound('block');
        shakeCamera(0.05);
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '깡!', born: now, blocked: true });
        onBlocked(m);
        landed++;
        continue;
      }

      v.hp -= 1;
      v.flash = 1;
      v.squash = 1;
      v.stunUntil = now + HIT_STUN_MS;
      // 나에게서 멀어지는 쪽으로 민다
      v.ox += (dx / dist) * KNOCKBACK;
      v.oz += (dz / dist) * KNOCKBACK;
      landed++;

      if (v.hp <= 0) {
        v.dead = true;
        v.deadAt = now;
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '정화!', born: now });
        playSound('purify');
        shakeCamera(0.2);
        // 연출이 끝날 때까지 붙잡아 둔다 — 부모가 기록에 적어도 안 사라진다
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
      } else {
        added.push({ key: dmgKey.current++, x: mx, z: mz, text: '1', born: now });
      }
    }

    if (landed > 0) {
      playSound('hit');
      shakeCamera(0.14);
      try { navigator.vibrate?.(28); } catch {}
      setDmgs((prev) => [...prev, ...added].slice(-14));
      bump((n) => n + 1);
    }
  }, [live, unlocked, rtOf, onPurified, onBlocked]);

  useFrame((_, delta) => {
    const p = avatarPos.current;
    if (!p) return;
    const now = performance.now();

    // ---------- 입력 ----------
    if (consumeAttack() && now >= nextAttackAt.current) {
      nextAttackAt.current = now + ATTACK_COOLDOWN_MS;
      swing.current = 1;
      playSound('slash');
      strike(p, now);
    }

    // ---------- 칼 ----------
    // 가까이 뭔가 있을 때만 뽑는다. 늘 들고 다니면 산책이 순찰이 된다.
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
      // 오른쪽 허리께에 들고, 휘두르면 앞으로 베어 내린다
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const s = swing.current;
      // 시작이 빠르고 끝이 느리게 — 이렇게 해야 '휙' 하고 지나간 느낌이 난다
      const e = 1 - Math.pow(1 - s, 2);
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
        const mat = arc.material as THREE.MeshBasicMaterial;
        mat.opacity = s * 0.75;
      }
    }

    // ---------- 몹 ----------
    for (const m of live) {
      const g = groups.current.get(m.id);
      const v = rtOf(m.id);
      if (!g) continue;

      // 밀려난 것이 천천히 제자리로 — 완전히 안 돌아오면 벽에 박힌 채 남는다
      v.ox *= 1 - Math.min(1, delta * 2.2);
      v.oz *= 1 - Math.min(1, delta * 2.2);
      v.flash = Math.max(0, v.flash - delta * 4.5);
      v.squash = Math.max(0, v.squash - delta * 5.5);

      if (v.dead) {
        // 사라지는 연출 — 위로 뜨며 작아진다
        const t = Math.min(1, (now - v.deadAt) / 480);
        g.visible = t < 1;
        g.position.set(m.x + v.ox, 0.85 + t * 1.5, m.z + v.oz);
        const sc = Math.max(0.001, 1 - t);
        g.scale.set(sc, sc, sc);
        g.rotation.y += delta * 9;
        continue;
      }

      g.visible = true;
      const stunned = now < v.stunUntil;
      const t = now * 0.001;

      g.position.set(m.x + v.ox, 0.85, m.z + v.oz);

      // 맞으면 납작해졌다 부풀며 돌아온다
      const q = v.squash;
      g.scale.set(1 + q * 0.45, 1 - q * 0.4, 1 + q * 0.45);

      if (stunned) {
        // 굳어서 부르르 떤다
        g.position.x += (Math.random() - 0.5) * 0.12;
        g.position.z += (Math.random() - 0.5) * 0.12;
      } else {
        // 둥실 — 가까우면 빠르게 들썩인다(노려보는 느낌)
        const near = Math.hypot(p.x - m.x, p.z - m.z) < AGGRO_RANGE;
        const sp = near ? 5.2 : 1.6;
        const amp = near ? 0.2 : 0.09;
        g.position.y = 0.85 + Math.sin(t * sp + m.x) * amp;
        g.rotation.y = near
          ? Math.atan2(p.x - m.x, p.z - m.z)          // 나를 본다
          : Math.sin(t * 0.6 + m.z) * 0.5;
      }
    }
  });

  return (
    <group>
      {/* 정화의 검 — 가까이 뭔가 있을 때만 나온다 */}
      <group ref={swordRef} visible={false}>
        {/* 날 */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.075, 0.85, 0.02]} />
          <meshStandardMaterial
            color="#DFF3FF" emissive="#6FC6E8" emissiveIntensity={0.7}
            metalness={0.75} roughness={0.22}
          />
        </mesh>
        {/* 날 끝 */}
        <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.055, 0.055, 0.02]} />
          <meshStandardMaterial color="#EAF9FF" emissive="#8FD8F5" emissiveIntensity={0.8} />
        </mesh>
        {/* 코등이 */}
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.3, 0.06, 0.06]} />
          <meshStandardMaterial color="#E8C067" metalness={0.6} roughness={0.35} />
        </mesh>
        {/* 손잡이 */}
        <mesh position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
          <meshStandardMaterial color="#7A5A3C" roughness={0.85} />
        </mesh>
      </group>

      {/* 베어낸 자국 — 반달이 앞에서 번졌다 사라진다 */}
      <mesh ref={arcRef} visible={false}>
        <ringGeometry args={[0.75, 1.5, 24, 1, 0, Math.PI * 0.85]} />
        <meshBasicMaterial
          color="#CFF3FF" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>

      {/* 몹 */}
      {live.map((m) => {
        const v = rt.current.get(m.id);
        const isBoss = m.kind.tier === 'boss';
        const broken = unlocked.has(m.id);
        return (
          <group
            key={m.id}
            ref={(g) => {
              if (g) groups.current.set(m.id, g);
              else groups.current.delete(m.id);
            }}
            position={[m.x, 0.85, m.z]}
          >
            {/* 몸통 */}
            <mesh castShadow>
              <sphereGeometry args={[isBoss ? 1.15 : 0.78, 14, 11]} />
              <meshStandardMaterial
                color={m.kind.color}
                roughness={0.85}
                emissive="#FFFFFF"
                emissiveIntensity={v?.flash ?? 0}
              />
            </mesh>

            {/*
              우두머리 껍질 — **안 깨졌을 때만.**
              칼이 안 통한다는 것을 말로 설명하기 전에 **보여야** 한다.
            */}
            {isBoss && !broken && (
              <mesh>
                <sphereGeometry args={[1.42, 16, 12]} />
                <meshStandardMaterial
                  color="#9FE6FF" transparent opacity={0.3}
                  emissive="#4FC3E8" emissiveIntensity={0.5}
                  metalness={0.4} roughness={0.1}
                />
              </mesh>
            )}

            {/* 그림자 — 땅에 붙어 있어야 떠 있는 게 보인다 */}
            <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[isBoss ? 1.0 : 0.66, 14]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.17} depthWrite={false} />
            </mesh>

            <Html center position={[0, isBoss ? 1.75 : 1.2, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
              <div style={{ textAlign: 'center', width: 90, marginLeft: -45 }}>
                <div style={{ fontSize: isBoss ? '30px' : '23px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' }}>
                  {m.kind.emoji}
                </div>
                {/* 체력 — 남은 만큼 칸이 찬다 */}
                <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 2 }}>
                  {Array.from({ length: m.kind.hp }).map((_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 11, height: 5, borderRadius: 3,
                        background: i < (v?.hp ?? m.kind.hp) ? (isBoss ? '#E8604C' : '#7ED08A') : 'rgba(0,0,0,0.28)',
                        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
                      }}
                    />
                  ))}
                </div>
                {isBoss && !broken && (
                  <div
                    style={{
                      marginTop: 3, fontSize: 10, fontWeight: 900, color: '#0B3E52',
                      background: 'rgba(190,238,255,0.92)', borderRadius: 8, padding: '1px 5px',
                      display: 'inline-block', whiteSpace: 'nowrap',
                    }}
                  >
                    🛡️ 문제를 풀어야 해요
                  </div>
                )}
              </div>
            </Html>
          </group>
        );
      })}

      {/* 떠오르는 숫자 */}
      {dmgs.map((d) => (
        <Html
          key={d.key}
          center
          position={[d.x, 1.7, d.z]}
          style={{ pointerEvents: 'none' }}
          zIndexRange={[8, 0]}
        >
          <div
            style={{
              fontSize: d.text.length > 1 ? 15 : 20,
              fontWeight: 900,
              color: d.blocked ? '#BFE9FF' : d.text === '정화!' ? '#9CF0C2' : '#FFF0A8',
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
