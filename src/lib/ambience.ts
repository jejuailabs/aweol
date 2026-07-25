'use client';

import { getAudioContext, isMuted } from './sound';

/**
 * 마을 배경음 — **파도·바람·새·발소리.**
 *
 * 지금 마을은 완전 무음이다. 그림은 바다 마을인데 소리가 없으면
 * **화면 보호기처럼** 느껴진다. 소리 하나로 '여기 있다' 가 생긴다.
 *
 * ---
 *
 * **효과음(`sound.ts`)과 얼개가 다르다.**
 *
 * 효과음은 눌렀을 때 한 번 나고 끝이다. 배경음은 **계속 흐르고, 자리에 따라
 * 커지고 작아진다.** 그래서 소리마디를 쌓는 대신 잡음(noise)을 걸러 쓴다:
 * 파도는 잡음에 넓은 필터를, 바람은 낮은 필터를 물린다.
 *
 * **음원 파일을 안 받는다.** 효과음과 같은 판단이다 — 용량이 0이고,
 * 저작권이 없고, 첫 걸음에 지연이 없다.
 *
 * ---
 *
 * **조심한 것 셋.**
 *
 * 1. **장치를 함께 쓴다**(`getAudioContext`). 따로 만들면 음소거가 따로 논다.
 * 2. **화면을 떠나면 반드시 멈춘다.** 안 끄면 다른 화면에서도 파도가 친다.
 * 3. **안 보이면 쉰다.** 탭을 옮겨두면 소리를 멈춘다 — 배터리를 먹지 않게.
 */

export interface Ambience {
  /** 바다가 얼마나 가까운가 (0 = 안 들림, 1 = 바로 앞) */
  setSea(v: number): void;
  /** 한 걸음 — 걷는 중에 부른다 */
  step(): void;
  /** 다 끄고 치운다 */
  stop(): void;
}

/** 잡음 한 통 — 만들어 두고 돌려 쓴다 */
function noiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** 부드럽게 값을 옮긴다 — 갑자기 바꾸면 '툭' 소리가 난다 */
function ramp(p: AudioParam, to: number, ctx: AudioContext, secs = 0.4) {
  const now = ctx.currentTime;
  p.cancelScheduledValues(now);
  p.setValueAtTime(Math.max(p.value, 0.0001), now);
  p.linearRampToValueAtTime(Math.max(to, 0.0001), now + secs);
}

export function startAmbience(): Ambience | null {
  const maybe = getAudioContext();
  if (!maybe) return null;
  /**
   * 아래 닫힌 함수(새·발소리)들 안에서도 **비어 있지 않다**는 것이 지켜져야 한다.
   * 그냥 쓰면 타입 검사가 닫힌 함수 안에서 좁힘을 놓친다.
   */
  const ctx: AudioContext = maybe;

  const buf = noiseBuffer(ctx);

  /** 모두가 지나가는 문 — 음소거와 탭 전환을 여기 하나로 막는다 */
  const master = ctx.createGain();
  master.gain.value = isMuted() ? 0 : 1;
  master.connect(ctx.destination);

  // ── 파도 ──────────────────────────────────────────────
  // 잡음에 넓은 필터를 물리고, 밀려왔다 빠지듯 소리를 오르내린다
  const seaSrc = ctx.createBufferSource();
  seaSrc.buffer = buf;
  seaSrc.loop = true;
  const seaFilter = ctx.createBiquadFilter();
  seaFilter.type = 'bandpass';
  seaFilter.frequency.value = 620;
  seaFilter.Q.value = 0.7;
  const seaSwell = ctx.createGain();   // 밀물썰물처럼 흔들리는 부분
  seaSwell.gain.value = 0.5;
  const seaLevel = ctx.createGain();   // 바다와 얼마나 가까운가
  seaLevel.gain.value = 0;

  /** 파도가 밀려왔다 빠지는 결 — 아주 느린 흔들림 둘을 겹친다 */
  const swell1 = ctx.createOscillator();
  swell1.frequency.value = 0.11;
  const swell1Amt = ctx.createGain();
  swell1Amt.gain.value = 0.34;
  const swell2 = ctx.createOscillator();
  swell2.frequency.value = 0.047;
  const swell2Amt = ctx.createGain();
  swell2Amt.gain.value = 0.2;
  swell1.connect(swell1Amt).connect(seaSwell.gain);
  swell2.connect(swell2Amt).connect(seaSwell.gain);

  seaSrc.connect(seaFilter).connect(seaSwell).connect(seaLevel).connect(master);

  // ── 바람 ──────────────────────────────────────────────
  // 낮게 깔린다. 제주는 바람이 늘 분다.
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = buf;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 380;
  const windLevel = ctx.createGain();
  windLevel.gain.value = 0.045;
  const windSwell = ctx.createOscillator();
  windSwell.frequency.value = 0.07;
  const windAmt = ctx.createGain();
  windAmt.gain.value = 0.022;
  windSwell.connect(windAmt).connect(windLevel.gain);
  windSrc.connect(windFilter).connect(windLevel).connect(master);

  seaSrc.start();
  windSrc.start();
  swell1.start();
  swell2.start();
  windSwell.start();

  // ── 새 ────────────────────────────────────────────────
  /** 짧게 미끄러지는 두세 마디 — 갈매기보다 참새 쪽에 가깝게 */
  function chirp() {
    const base = 1800 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const at = ctx.currentTime + i * 0.13;
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * 1.5, at + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, at + 0.11);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.035, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + 0.14);
    }
  }
  let birdTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleBird = () => {
    // 6~20초에 한 번. 규칙적이면 기계 소리로 들린다.
    birdTimer = setTimeout(() => {
      if (!isMuted() && document.visibilityState === 'visible') chirp();
      scheduleBird();
    }, 6000 + Math.random() * 14000);
  };
  scheduleBird();

  // ── 발소리 ────────────────────────────────────────────
  let lastStep = 0;
  function step() {
    if (isMuted()) return;
    const now = ctx.currentTime;
    // 너무 잦으면 지직거린다 — 한 걸음 사이를 둔다
    if (now - lastStep < 0.28) return;
    lastStep = now;

    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420 + Math.random() * 160;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    s.connect(f).connect(g).connect(master);
    // 잡음 통의 아무 데서나 잘라 쓴다 — 늘 같은 자리를 쓰면 같은 소리가 난다
    s.start(now, Math.random() * 2, 0.12);
    s.stop(now + 0.13);
  }

  // ── 음소거·탭 전환 ────────────────────────────────────
  const sync = () => {
    const off = isMuted() || document.visibilityState !== 'visible';
    ramp(master.gain, off ? 0 : 1, ctx, 0.25);
  };
  const watch = setInterval(sync, 500);
  document.addEventListener('visibilitychange', sync);

  let stopped = false;

  return {
    setSea(v: number) {
      if (stopped) return;
      ramp(seaLevel.gain, Math.max(0, Math.min(1, v)) * 0.4, ctx, 0.8);
    },
    step,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(watch);
      if (birdTimer) clearTimeout(birdTimer);
      document.removeEventListener('visibilitychange', sync);
      // 뚝 끊으면 '툭' 하고 튄다 — 잠깐 사이에 줄이고 끈다
      ramp(master.gain, 0, ctx, 0.25);
      setTimeout(() => {
        try {
          seaSrc.stop(); windSrc.stop();
          swell1.stop(); swell2.stop(); windSwell.stop();
          master.disconnect();
        } catch { /* 이미 멈췄으면 그만이다 */ }
      }, 300);
    },
  };
}
