'use client';

/**
 * 게임풍 효과음.
 * 음원 파일을 받아오지 않고 Web Audio로 즉석 합성한다.
 * - 네트워크 요청이 없어 첫 클릭에도 지연 없이 난다
 * - 용량이 0이고 저작권 문제도 없다
 * 나중에 실제 음원을 쓰고 싶으면 playFile() 쪽만 갈아끼우면 된다.
 */

export type SoundName =
  | 'tap'        // 일반 버튼
  | 'enter'      // 학교·교실 입장
  | 'open'       // 모달·게시물 열기
  | 'close'      // 닫기
  | 'like'       // 좋아요
  | 'post'       // 글·댓글 등록
  | 'notify'     // 새 글 알림
  | 'success'    // 제출 완료
  | 'error'      // 실패
  // ── 마을 정화(전투) ──
  | 'slash'      // 칼을 휘두름 (허공)
  | 'hit'        // 맞았다
  | 'block'      // 우두머리 껍질에 튕김
  | 'purify'     // 정화되어 사라짐
  | 'shatter';   // 우두머리 껍질이 깨짐

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = 'aewol.muted';

if (typeof window !== 'undefined') {
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {}
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {}
}

/**
 * 오디오 장치를 **함께 쓴다.**
 *
 * 마을 배경음(`ambience.ts`)이 자기 것을 따로 만들면 장치가 둘이 된다 —
 * 브라우저마다 개수 제한이 있고, 음소거도 따로 놀게 된다.
 */
export function getAudioContext(): AudioContext | null {
  return getCtx();
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // 브라우저가 사용자 제스처 전에는 정지 상태로 둔다
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Note {
  freq: number;
  /** 시작 시각 (초, 재생 시점 기준) */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** 끝 주파수 — 주면 미끄러지는 소리가 된다 */
  to?: number;
  /**
   * **바람 소리로 낸다** — 음정 대신 잡음을 쓴다.
   *
   * 오실레이터는 '삐-' 하는 음이라 **때리는 소리가 안 난다.** 칼이 공기를
   * 가르는 소리, 무언가 부서지는 소리는 전부 잡음이다. 타격감은 여기서 반쯤
   * 갈린다 — 음만으로 만든 타격음은 장난감 소리로 들린다.
   *
   * `freq` 는 이때 **거르는 중심 주파수**로 쓴다(높을수록 날카롭다).
   */
  noise?: boolean;
  /** 잡음을 거르는 방식. 기본은 대역통과. */
  filter?: BiquadFilterType;
  /** 잡음이 날카로운 정도 */
  q?: number;
}

/**
 * 잡음 원본 — **한 번만 만들어 돌려 쓴다.**
 * 소리 낼 때마다 만들면 휘두를 때마다 2초치 배열을 새로 채운다.
 */
let noiseBuf: AudioBuffer | null = null;
function getNoise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 1.2);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function play(notes: Note[]) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  for (const n of notes) {
    const gain = c.createGain();
    const peak = (n.gain ?? 0.16);
    // 딸깍거리지 않도록 짧게 올렸다 부드럽게 내린다
    gain.gain.setValueAtTime(0.0001, now + n.at);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);

    if (n.noise) {
      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      // 매번 다른 데서 잘라 쓴다 — 같은 자리를 쓰면 연달아 칠 때 똑같이 들린다
      const off = Math.random() * 0.8;
      const f = c.createBiquadFilter();
      f.type = n.filter ?? 'bandpass';
      f.frequency.setValueAtTime(n.freq, now + n.at);
      if (n.to) f.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.dur);
      f.Q.value = n.q ?? 1.2;
      src.connect(f).connect(gain).connect(c.destination);
      src.start(now + n.at, off, n.dur + 0.05);
      src.stop(now + n.at + n.dur + 0.05);
      continue;
    }

    const osc = c.createOscillator();
    osc.type = n.type || 'triangle';
    osc.frequency.setValueAtTime(n.freq, now + n.at);
    if (n.to) {
      osc.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.dur);
    }
    osc.connect(gain).connect(c.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.02);
  }
}

const RECIPES: Record<SoundName, Note[]> = {
  tap: [{ freq: 880, at: 0, dur: 0.07, gain: 0.1 }],

  // 문이 열리며 올라가는 3음 — 입장 연출과 함께 쓴다
  enter: [
    { freq: 523, at: 0, dur: 0.12 },
    { freq: 659, at: 0.09, dur: 0.12 },
    { freq: 880, at: 0.18, dur: 0.22, gain: 0.18 },
  ],

  open: [
    { freq: 620, at: 0, dur: 0.09 },
    { freq: 930, at: 0.06, dur: 0.12 },
  ],

  close: [
    { freq: 700, at: 0, dur: 0.08 },
    { freq: 440, at: 0.05, dur: 0.1 },
  ],

  // 통통 튀는 하트
  like: [
    { freq: 700, at: 0, dur: 0.08, type: 'sine' },
    { freq: 1050, at: 0.06, dur: 0.14, type: 'sine', gain: 0.14 },
  ],

  post: [
    { freq: 587, at: 0, dur: 0.1 },
    { freq: 784, at: 0.08, dur: 0.16 },
  ],

  // 새 글이 올라왔을 때 — 두 번 울리는 종
  notify: [
    { freq: 988, at: 0, dur: 0.16, type: 'sine', gain: 0.13 },
    { freq: 1319, at: 0.14, dur: 0.26, type: 'sine', gain: 0.13 },
  ],

  success: [
    { freq: 523, at: 0, dur: 0.1 },
    { freq: 659, at: 0.08, dur: 0.1 },
    { freq: 784, at: 0.16, dur: 0.1 },
    { freq: 1047, at: 0.24, dur: 0.3, gain: 0.2 },
  ],

  error: [
    { freq: 320, at: 0, dur: 0.14, type: 'square', gain: 0.09, to: 180 },
  ],

  /*
    ── 마을 정화 ──

    타격감은 **세 겹**으로 만든다. 하나만 쓰면 얇게 들린다.
    1) 낮은 '퍽' (몸에 닿은 무게)  2) 잡음 '착' (부딪힌 결)  3) 짧은 금속음 (칼)
    셋을 몇 밀리초씩 어긋나게 놓으면 한 방으로 뭉쳐 들린다.
  */

  // 허공을 가름 — 잡음이 높은 데서 낮은 데로 스친다
  slash: [
    { freq: 3200, at: 0, dur: 0.13, gain: 0.09, noise: true, to: 700, q: 0.8 },
  ],

  // 맞았다 — 무게(낮은 삼각파) + 결(잡음) + 칼끝(짧은 고음)
  hit: [
    { freq: 150, at: 0, dur: 0.11, type: 'triangle', gain: 0.2, to: 62 },
    { freq: 1500, at: 0.005, dur: 0.09, gain: 0.13, noise: true, to: 420, q: 0.7 },
    { freq: 2400, at: 0, dur: 0.045, type: 'square', gain: 0.05 },
  ],

  // 껍질에 튕김 — 쇳소리. 안 통한다는 것이 소리만으로 와야 한다.
  block: [
    { freq: 1850, at: 0, dur: 0.16, type: 'square', gain: 0.08 },
    { freq: 2470, at: 0.01, dur: 0.14, type: 'square', gain: 0.06 },
    { freq: 5200, at: 0, dur: 0.07, gain: 0.07, noise: true, filter: 'highpass' },
  ],

  // 껍질이 깨짐 — 잡음이 넓게 터졌다가 잦아든다
  shatter: [
    { freq: 5200, at: 0, dur: 0.26, gain: 0.14, noise: true, to: 900, filter: 'highpass' },
    { freq: 320, at: 0, dur: 0.2, type: 'square', gain: 0.1, to: 110 },
  ],

  // 정화 — 물방울이 튀고 맑게 올라간다
  purify: [
    { freq: 900, at: 0, dur: 0.1, gain: 0.09, noise: true, to: 2600, filter: 'bandpass', q: 2.4 },
    { freq: 784, at: 0.04, dur: 0.12, type: 'sine', gain: 0.14 },
    { freq: 1175, at: 0.11, dur: 0.16, type: 'sine', gain: 0.13 },
    { freq: 1568, at: 0.19, dur: 0.28, type: 'sine', gain: 0.11 },
  ],
};

/** 효과음 재생. 음소거 상태면 조용히 무시된다. */
export function playSound(name: SoundName) {
  play(RECIPES[name]);
}
