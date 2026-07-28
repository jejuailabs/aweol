'use client';

import { getAudioContext, isMuted } from './sound';

/**
 * 전시실 배경음악 — **방마다 다른 곡.**
 *
 * 그림을 보며 걷는데 아무 소리도 없으면 화면 보호기 같다. 그렇다고 노래를
 * 틀면 그림보다 노래가 크다. 미술관에서 나는 소리는 **있는 줄도 모르게
 * 깔려 있는 것**이라야 한다.
 *
 * ---
 *
 * **음원 파일을 안 받는다.**
 *
 * 효과음(`sound.ts`)·마을 배경음(`ambience.ts`)과 같은 판단이다 —
 * 용량이 0이고, 저작권이 없고, 첫 걸음에 지연이 없다.
 * 대신 **화음을 즉석에서 짚는다.**
 *
 * ---
 *
 * **전시마다 다른 곡이 나온다.**
 *
 * 곡을 여러 개 적어두고 고르는 것이 아니라, **전시 이름을 씨앗**으로 삼아
 * 조(調)와 화음 차례를 뽑는다. 그래서 전시가 몇 개로 늘어도 손댈 것이 없고,
 * 같은 전시에 다시 들어오면 **같은 곡**이 흐른다 — 그 방의 소리가 된다.
 *
 * ---
 *
 * **조심한 것 셋** (마을 배경음에서 배운 것과 같다).
 * 1. 장치를 함께 쓴다(`getAudioContext`) — 따로 만들면 음소거가 따로 논다.
 * 2. 화면을 떠나면 반드시 멈춘다 — 안 끄면 교실에서도 음악이 흐른다.
 * 3. 안 보이면 쉰다 — 탭을 옮겨두면 소리를 멈춰 배터리를 아낀다.
 */

export interface GalleryMusic {
  stop(): void;
}

/** 글자를 숫자 씨앗으로 */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 씨앗 하나에서 0~1 */
function seeded(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ 0x12345, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 화음 차례 — **네 개를 돌린다.**
 *
 * 어느 것을 골라도 **어둡지도 들뜨지도 않게** 골랐다. 전시실에서 흐르는
 * 소리가 슬프면 그림이 슬퍼지고, 신나면 그림을 안 본다.
 * 숫자는 으뜸음에서 몇 반음 떨어졌나(반음 계단)다.
 */
const PROGRESSIONS: number[][][] = [
  // I – vi – IV – V  (가장 순한 차례)
  [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  // I – IV – vi – V
  [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]],
  // vi – IV – I – V  (조금 잔잔하게 시작한다)
  [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
  // I – V – vi – IV
  [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
];

/** 으뜸음 후보 — 낮게 깔리는 음역. 높으면 귀에 걸린다. */
const ROOTS = [110.0, 123.47, 130.81, 146.83, 164.81, 174.61];

/**
 * 전시실 배경음악을 켠다.
 *
 * @param key 전시를 가리키는 글자 — 같은 값이면 늘 같은 곡이 흐른다
 * @param dark 어두운 전시실인가 — 조금 더 낮고 느리게 흐른다
 */
export function startGalleryMusic(key: string, dark = false): GalleryMusic | null {
  const maybe = getAudioContext();
  if (!maybe) return null;
  const ctx: AudioContext = maybe;

  const seed = seedOf(key || 'show');
  const prog = PROGRESSIONS[Math.floor(seeded(seed) * PROGRESSIONS.length) % PROGRESSIONS.length];
  const root = ROOTS[Math.floor(seeded(seed + 7) * ROOTS.length) % ROOTS.length];

  /** 모두가 지나가는 문 — 음소거와 탭 전환을 여기 하나로 막는다 */
  const master = ctx.createGain();
  /**
   * **아주 작게.** 그림을 보러 온 사람에게 음악은 배경이다 —
   * 있는 줄도 모르게 깔려 있어야 한다.
   */
  master.gain.value = isMuted() ? 0 : 1;

  /** 부드럽게 만드는 필터 — 높은 쪽을 깎으면 멀리서 나는 소리가 된다 */
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = dark ? 900 : 1400;
  soften.Q.value = 0.4;
  soften.connect(master).connect(ctx.destination);

  /**
   * 한 화음을 짚는다 — **길게 밀려왔다 길게 빠진다.**
   *
   * 붙였다 뗐다 하면 노래가 되고, 아주 길게 겹치면 공기가 된다.
   * 미술관에서 들리는 것은 뒤엣것이다.
   */
  const chordAt = (semis: number[], at: number, dur: number) => {
    semis.forEach((s, i) => {
      const osc = ctx.createOscillator();
      // 삼각파는 사인보다 조금 도톰하다 — 사인만 쓰면 소리가 얇아 존재감이 없다
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = root * Math.pow(2, s / 12);

      /**
       * **아주 조금 어긋나게 짚는다.** 셋을 정확히 같은 순간에 같은 크기로
       * 내면 기계 소리가 난다. 사람이 손가락으로 짚으면 늘 미세하게 어긋난다.
       */
      const off = seeded(seed + s * 31 + i) * 0.35;
      const g = ctx.createGain();
      const peak = (i === 0 ? 0.05 : 0.032) * (dark ? 0.85 : 1);

      g.gain.setValueAtTime(0.0001, at + off);
      // 밀려오는 데 3초, 빠지는 데 나머지 — 시작이 느려야 안 튄다
      g.gain.linearRampToValueAtTime(peak, at + off + dur * 0.32);
      g.gain.linearRampToValueAtTime(0.0001, at + off + dur);

      osc.connect(g).connect(soften);
      osc.start(at + off);
      osc.stop(at + off + dur + 0.1);
    });
  };

  /** 한 화음이 머무는 시간 — 어두운 방은 조금 더 느리게 */
  const BAR = dark ? 11 : 9;
  let step = 0;
  /** 다음 화음을 미리 예약해 둔 시각 */
  let nextAt = ctx.currentTime + 0.4;

  /**
   * 멈췄나 — **`pump()` 보다 먼저 선언해야 한다.**
   *
   * 전에는 이 줄이 파일 아래쪽에 있었다. `let` 은 선언 전에는 손도 못 대는데
   * (temporal dead zone), `pump()` 를 그 위에서 불러버려서
   * `Cannot access 'stopped' before initialization` 이 났다.
   * 그 오류가 그리기 도중에 터지니 **전시관 화면이 통째로 죽었다** —
   * 배경음악 하나 때문에 문이 안 열렸다.
   */
  let stopped = false;

  const pump = () => {
    if (stopped) return;
    /**
     * **미리 심어 둔다.** 타이머는 정확하지 않아서, 소리가 날 때 맞춰
     * 만들면 사이가 벌어져 뚝뚝 끊긴다. 소리 장치의 시계에 미리 예약한다.
     */
    while (nextAt < ctx.currentTime + BAR * 1.5) {
      chordAt(prog[step % prog.length], nextAt, BAR * 1.25);
      step++;
      nextAt += BAR;
    }
  };
  pump();
  const timer = setInterval(pump, (BAR * 1000) / 2);

  // ── 음소거·탭 전환 ────────────────────────────────────
  const sync = () => {
    const off = isMuted() || document.visibilityState !== 'visible';
    const now = ctx.currentTime;
    const p = master.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(Math.max(p.value, 0.0001), now);
    p.linearRampToValueAtTime(off ? 0.0001 : 1, now + 0.5);
  };
  const watch = setInterval(sync, 600);
  document.addEventListener('visibilitychange', sync);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      clearInterval(watch);
      document.removeEventListener('visibilitychange', sync);
      // 뚝 끊으면 '툭' 하고 튄다 — 잠깐 사이에 줄이고 끈다
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      setTimeout(() => {
        try { master.disconnect(); } catch { /* 이미 끊겼으면 그만이다 */ }
      }, 800);
    },
  };
}
