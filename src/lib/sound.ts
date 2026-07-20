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
  | 'error';     // 실패

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
}

function play(notes: Note[]) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.type || 'triangle';
    osc.frequency.setValueAtTime(n.freq, now + n.at);
    if (n.to) {
      osc.frequency.exponentialRampToValueAtTime(n.to, now + n.at + n.dur);
    }
    const peak = (n.gain ?? 0.16);
    // 딸깍거리지 않도록 짧게 올렸다 부드럽게 내린다
    gain.gain.setValueAtTime(0.0001, now + n.at);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
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
};

/** 효과음 재생. 음소거 상태면 조용히 무시된다. */
export function playSound(name: SoundName) {
  play(RECIPES[name]);
}
