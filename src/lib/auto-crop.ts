/**
 * 막 찍은 작품 사진에서 **작품만 찾아낸다.**
 *
 * 선생님은 25명 분을 책상 위에 놓고 연달아 찍는다. 그러면 사진마다 책상·손·그림자가
 * 같이 들어오고, 작품은 가운데 조금 치우쳐 있다. 그대로 액자에 걸면 **책상이 전시된다.**
 *
 * **AI를 안 부른다.** 한 반이 25장이고 반이 늘면 그게 다 요금이다. 그리고 이 일은
 * "배경과 다른 곳이 어디까지인가" 하나만 알면 되는 일이라 모델이 필요 없다.
 *
 * 여기 있는 것은 **순수 계산**이다(픽셀 배열 → 사각형). 그래서 브라우저도 서버도 없이
 * 그대로 시험할 수 있다 — `scripts/verify-auto-crop.mjs`.
 */

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AutoCropOptions {
  /**
   * 배경과 얼마나 달라야 '작품' 으로 볼지 (0~255).
   * 낮추면 그림자까지 작품으로 보고, 높이면 연한 색 그림을 배경으로 본다.
   */
  threshold?: number;
  /** 잘라낸 뒤 사방에 남길 여백 (짧은 변 기준 비율). 딱 맞게 자르면 답답하다. */
  marginRatio?: number;
  /**
   * 이만큼도 안 되게 작아지면 **자르지 않는다.**
   * 어두운 사진이나 배경이 요란한 사진에서 엉뚱한 조각만 남는 것을 막는다.
   */
  minAreaRatio?: number;
  /**
   * 이보다 크면 **자를 이유가 없다.** 이미 작품이 화면을 꽉 채운 사진이다.
   * 굳이 1~2% 를 깎으면 가장자리 획이 잘린다.
   */
  maxAreaRatio?: number;
}

const DEFAULTS: Required<AutoCropOptions> = {
  threshold: 26,
  marginRatio: 0.02,
  minAreaRatio: 0.12,
  maxAreaRatio: 0.92,
};

/** 가장자리 한 줄을 훑어 배경색을 고른다 — 중앙값이라 손가락 하나쯤은 흔들리지 않는다 */
function borderMedian(gray: Uint8Array | number[], w: number, h: number): number {
  const edge: number[] = [];
  for (let x = 0; x < w; x++) {
    edge.push(gray[x]);                 // 위
    edge.push(gray[(h - 1) * w + x]);   // 아래
  }
  for (let y = 0; y < h; y++) {
    edge.push(gray[y * w]);             // 왼쪽
    edge.push(gray[y * w + w - 1]);     // 오른쪽
  }
  edge.sort((a, b) => a - b);
  return edge[Math.floor(edge.length / 2)];
}

/**
 * 작품이 차지한 사각형을 찾는다. 찾을 이유가 없거나 미덥지 않으면 **null**.
 *
 * null 을 돌려주는 것이 실패가 아니다 — **자르지 않는 편이 나은 사진**이라는 뜻이고,
 * 호출부는 원본을 그대로 쓰면 된다. 아이 작품을 잘못 자르는 것보다 안 자르는 게 낫다.
 */
export function findContentBox(
  gray: Uint8Array | number[],
  w: number,
  h: number,
  options: AutoCropOptions = {}
): CropBox | null {
  const o = { ...DEFAULTS, ...options };
  if (w < 8 || h < 8) return null;

  const bg = borderMedian(gray, w, h);

  /**
   * 한 줄/한 칸이 배경과 다른 것만으로는 작품이라 하기 어렵다 —
   * 먼지 한 톨, 책상 무늬 하나에 사각형이 화면 끝까지 늘어난다.
   * 그래서 **줄 단위로 세어** 그 줄에 다른 점이 충분히 많을 때만 작품 줄로 친다.
   */
  const rowHits = new Array<number>(h).fill(0);
  const colHits = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      if (Math.abs(gray[base + x] - bg) > o.threshold) {
        rowHits[y]++;
        colHits[x]++;
      }
    }
  }

  // 그 줄의 3% 이상이 배경과 다르면 작품이 걸친 줄로 본다
  const rowNeed = Math.max(2, Math.floor(w * 0.03));
  const colNeed = Math.max(2, Math.floor(h * 0.03));

  let top = 0;
  while (top < h && rowHits[top] < rowNeed) top++;
  let bottom = h - 1;
  while (bottom > top && rowHits[bottom] < rowNeed) bottom--;
  let left = 0;
  while (left < w && colHits[left] < colNeed) left++;
  let right = w - 1;
  while (right > left && colHits[right] < colNeed) right--;

  if (right <= left || bottom <= top) return null;

  // 여백을 조금 남긴다 — 딱 맞게 자르면 그림이 액자에 눌린 것처럼 보인다
  const margin = Math.round(Math.min(w, h) * o.marginRatio);
  left = Math.max(0, left - margin);
  top = Math.max(0, top - margin);
  right = Math.min(w - 1, right + margin);
  bottom = Math.min(h - 1, bottom + margin);

  const box = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const ratio = (box.width * box.height) / (w * h);

  // 너무 작으면 못 믿을 결과, 너무 크면 자를 이유가 없다 — 둘 다 원본이 낫다
  if (ratio < o.minAreaRatio || ratio > o.maxAreaRatio) return null;
  return box;
}

/**
 * 작은 판에서 찾은 사각형을 원본 크기로 되돌린다.
 *
 * 판정은 **작게 줄여서** 한다(빠르고, 먼지 같은 잡티에 덜 흔들린다).
 * 그래서 결과를 원본 좌표로 늘려줘야 하는데, 이때 **원본 밖으로 나가지 않게**
 * 반드시 가둔다 — 한 픽셀만 넘어도 sharp 는 통째로 실패한다.
 */
export function scaleBox(box: CropBox, from: { w: number; h: number }, to: { w: number; h: number }): CropBox {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const left = Math.max(0, Math.min(to.w - 1, Math.round(box.left * sx)));
  const top = Math.max(0, Math.min(to.h - 1, Math.round(box.top * sy)));
  const width = Math.max(1, Math.min(to.w - left, Math.round(box.width * sx)));
  const height = Math.max(1, Math.min(to.h - top, Math.round(box.height * sy)));
  return { left, top, width, height };
}
