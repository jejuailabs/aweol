/**
 * 개인 전시실 벽 자리 계산.
 *
 * 학교 전시실(`exhibit-layout.ts`)과 따로 둔다. 학교 것은 **한 반 서른 명**을
 * 다 걸어야 해서 두 줄로 빽빽하게 채운다. 미술관은 정반대다 —
 * **띄엄띄엄 한 줄이 원칙**이고, 눈높이에 맞춘다.
 *
 * 3D 를 모르는 계산만 둔다. 자리가 겹치는지·벽을 넘는지는 눈으로 못 보니
 * 여기서 재봐야 한다.
 */

/** 방 크기 (ArtShowScene 과 같아야 한다) */
export const ROOM_W = 26;
export const ROOM_D = 20;
export const ROOM_H = 6.2;

/** 벽에서 살짝 띄운다 (z-fighting 방지) */
const GAP = 0.06;

/** 가운데 가림벽이 서는 자리 */
export const PARTITION_Z = 3.4;
export const PARTITION_W = 11;
export const PARTITION_H = 3.6;

/**
 * 거는 높이 — **작품 한가운데가 바닥에서 1.55m.**
 * 미술관이 쓰는 값이다. 어른 눈높이보다 조금 아래라 아이도 어른도 편하다.
 */
const EYE = 1.62;
/** 두 줄로 걸어야 할 때의 위아래 */
const TWO_ROWS = [2.45, 1.15];

export interface HallSlot {
  pos: [number, number, number];
  rot: [number, number, number];
  /** 이 자리에 걸 수 있는 최대 폭 (액자 크기를 여기에 맞춘다) */
  maxW: number;
}

const HALF_PI = Math.PI / 2;

/** n 개를 -span..span 에 고르게 놓는다 */
const spread = (n: number, span: number) =>
  n <= 0 ? [] : n === 1 ? [0] : Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));

/** 벽 하나가 만드는 자리들 */
function wallSlots(
  n: number,
  rows: number[],
  make: (t: number, y: number) => HallSlot,
  span: number
): HallSlot[] {
  const out: HallSlot[] = [];
  for (const y of rows) for (const t of spread(n, span)) out.push(make(t, y));
  return out;
}

/**
 * 작품 수에 맞춘 자리들.
 *
 * **적으면 넓게 건다.** 세 점을 스물다섯 자리에 흩어 놓으면 텅 빈 방이 되고,
 * 스물다섯 점을 세 자리에 걸 수는 없다. 그래서 벽마다 **몇 개를 걸지**를
 * 작품 수에서 거꾸로 정한다.
 *
 * 차례는 **뒷벽 → 왼벽 → 오른벽 → 가운데 가림벽**이다. 들어서면 정면이
 * 뒷벽이라, 제일 보여주고 싶은 것(첫 번째)이 거기 걸린다.
 */
export function hallSlots(count: number): HallSlot[] {
  const n = Math.max(0, count);
  if (n === 0) return [];

  const backHalf = ROOM_D / 2 - GAP;
  const sideHalf = ROOM_W / 2 - GAP;

  /**
   * 한 줄에 몇 개까지 걸까.
   * 벽 길이를 액자 최소 간격(2.6m)으로 나눈 값이 상한이다 —
   * 이보다 촘촘하면 액자가 서로 닿는다.
   */
  const backMax = 7;
  const sideMax = 5;
  const partMax = 4;

  // 한 줄로 되면 한 줄, 안 되면 두 줄
  const onePass = backMax + sideMax * 2 + partMax * 2;
  const rows = n > onePass ? TWO_ROWS : [EYE];

  // 벽마다 몇 개씩 — 뒷벽부터 채우되, 한쪽만 빽빽해지지 않게 고르게 나눈다
  const perRow = Math.ceil(n / rows.length);
  const back = Math.min(backMax, Math.max(1, Math.round(perRow * 0.3)));
  const side = Math.min(sideMax, Math.max(0, Math.round(perRow * 0.22)));
  const part = Math.min(partMax, Math.max(0, perRow - back - side * 2));

  const slots: HallSlot[] = [
    // 뒷벽 — 들어서면 정면
    ...wallSlots(back, rows, (x, y) => ({
      pos: [x, y, -backHalf], rot: [0, 0, 0], maxW: 3,
    }), ROOM_W * 0.36),
    // 왼벽
    ...wallSlots(side, rows, (z, y) => ({
      pos: [-sideHalf, y, z], rot: [0, HALF_PI, 0], maxW: 2.6,
    }), ROOM_D * 0.3),
    // 오른벽
    ...wallSlots(side, rows, (z, y) => ({
      pos: [sideHalf, y, z], rot: [0, -HALF_PI, 0], maxW: 2.6,
    }), ROOM_D * 0.3),
    // 가운데 가림벽 — 앞뒤 두 면을 다 쓴다 (미술관이 늘 쓰는 수법)
    ...wallSlots(part, rows, (x, y) => ({
      pos: [x, y, PARTITION_Z - 0.2], rot: [0, Math.PI, 0], maxW: 2.6,
    }), 4.2),
    ...wallSlots(part, rows, (x, y) => ({
      pos: [x, y, PARTITION_Z + 0.2], rot: [0, 0, 0], maxW: 2.6,
    }), 4.2),
  ];

  return slots;
}

/** 자리에 다 못 거는 작품이 몇 점인가. 0 이 아니면 주인에게 알린다. */
export function overflowCount(count: number): number {
  return Math.max(0, count - hallSlots(count).length);
}
