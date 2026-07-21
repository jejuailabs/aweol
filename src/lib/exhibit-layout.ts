/**
 * 전시실 벽 자리 계산.
 *
 * 한 반은 **30명까지** 잡아야 한다. 전에는 두 줄에 20자리뿐이라, 30명이면
 * 열 점이 **아무 말 없이 안 걸렸다** — 그 아이는 자기 작품이 어디 갔는지 모른다.
 *
 * 3D 를 모르는 계산만 둔다. 자리가 겹치는지·벽을 넘는지는 눈으로 못 보니
 * 여기서 재봐야 한다.
 */

/** 방 크기 (Gallery3DView 와 같아야 한다) */
export const ROOM_W = 16;
export const ROOM_D = 16;

/** 액자 크기. 자리 간격이 이보다 좁으면 겹친다. */
export const FRAME_W = 1.8;
/** 액자 테두리까지 포함한 실제 폭 */
export const FRAME_OUTER = FRAME_W + 0.24;

/** 벽에서 살짝 띄운다 (z-fighting 방지) */
const WALL_GAP = 0.05;

/** 뒷벽 자리 수 */
const BACK_N = 6;
/** 옆벽 자리 수 (한쪽) */
const SIDE_N = 5;

/** 한 줄에 걸 수 있는 수 */
export const PER_ROW = BACK_N + SIDE_N * 2;
/** 두 줄까지 쓴다. 세 줄은 위가 너무 높아 아이 눈에 안 들어온다. */
export const MAX_ROWS = 2;
/** 전시실 하나에 걸 수 있는 최대 */
export const CAPACITY = PER_ROW * MAX_ROWS;

export interface WallSlot {
  pos: [number, number, number];
  rot: [number, number, number];
}

const HALF_PI = Math.PI / 2;

/**
 * 작품 수에 맞춰 자리를 만든다.
 *
 * 적으면 한 줄(눈높이)만 쓴다 — 몇 점 없는데 두 줄로 벌리면 휑해 보인다.
 * 많으면 위아래 두 줄. 실제 전시실도 그렇게 한다.
 */
export function wallSlots(count: number): WallSlot[] {
  const rows = count > PER_ROW ? 2 : 1;
  // 한 줄이면 눈높이. 두 줄이면 위아래로 벌린다.
  const rowY = rows === 1 ? [2.5] : [3.35, 1.72];

  const slots: WallSlot[] = [];
  const backHalf = ROOM_W / 2 - WALL_GAP;
  const sideHalf = ROOM_D / 2 - WALL_GAP;

  /** n 개를 -span..span 에 고르게 놓는다 */
  const spread = (n: number, span: number) =>
    n === 1 ? [0] : Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));

  for (const y of rowY) {
    // 뒷벽 — 가장 잘 보이는 자리라 여기부터 채운다
    for (const x of spread(BACK_N, 6.5)) {
      slots.push({ pos: [x, y, -backHalf], rot: [0, 0, 0] });
    }
    // 왼쪽 벽
    for (const z of spread(SIDE_N, 6)) {
      slots.push({ pos: [-sideHalf, y, z], rot: [0, HALF_PI, 0] });
    }
    // 오른쪽 벽
    for (const z of spread(SIDE_N, 6)) {
      slots.push({ pos: [sideHalf, y, z], rot: [0, -HALF_PI, 0] });
    }
  }
  return slots;
}

/**
 * 자리에 다 못 거는 작품이 몇 점인가.
 *
 * 0 이 아니면 **선생님에게 알려야 한다.** 조용히 빼면 그 아이는 자기 작품이
 * 왜 없는지 알 수 없다.
 */
export function overflowCount(count: number): number {
  return Math.max(0, count - CAPACITY);
}
