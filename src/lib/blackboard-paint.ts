/**
 * 칠판 그리기 로직.
 *
 * 3D 칠판 텍스처와 편집 모달의 미리보기가 **같은 함수**를 써야 한다.
 * 따로 그리면 미리보기에서 맞춰놓은 위치가 실제 칠판에서 어긋난다.
 */

export const TEX_W = 1400;
export const TEX_H = 430;
export const BOARD_BG = '#2E5844';

export interface PaintItem {
  kind: 'stroke' | 'text';
  /** 정규화 좌표(0~1) 배열 */
  points: number[][];
  color: string;
  width: number;
  text?: string;
  authorName: string;
}

/** 획 하나. 좌표는 정규화(0~1), w/h 는 그릴 캔버스 크기. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  pts: number[][],
  color: string,
  width: number,
  w: number,
  h: number
) {
  if (pts.length === 0) return;
  // 캔버스가 작아지면 선도 같이 얇아져야 미리보기와 실제가 같아 보인다
  ctx.strokeStyle = color;
  ctx.lineWidth = width * (w / TEX_W);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] * w + 0.1, pts[0][1] * h);
  } else {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
    }
  }
  ctx.stroke();
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  item: PaintItem,
  w: number,
  h: number,
  showAuthor = true
) {
  if (!item.text) return;
  const [nx, ny] = item.points[0] || [0.5, 0.5];
  const x = nx * w;
  const y = ny * h;
  const k = w / TEX_W;
  ctx.fillStyle = item.color;
  ctx.font = `bold ${item.width * 7 * k}px Pretendard, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(item.text, x, y);
  if (showAuthor) {
    // 작성자를 글씨 옆에 작게 붙여 익명 글이 남지 않게 한다
    const tw = ctx.measureText(item.text).width;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `${item.width * 3.4 * k}px Pretendard, sans-serif`;
    ctx.fillText(` ✏️${item.authorName}`, x + tw, y + item.width * 3 * k);
  }
}

/** 칠판 바탕 + 저장된 낙서 전부 */
export function paintBoard(
  ctx: CanvasRenderingContext2D,
  items: PaintItem[],
  w: number,
  h: number
) {
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, w, h);

  // 분필 자국 느낌의 옅은 얼룩
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(0, (i * h) / 6 + 8 * (h / TEX_H), w, 2);
  }
  ctx.globalAlpha = 1;

  items.forEach((it) => {
    if (it.kind === 'stroke') drawStroke(ctx, it.points, it.color, it.width, w, h);
    else drawText(ctx, it, w, h);
  });
}

/** 점들을 감싸는 사각형 (배치할 때 기준이 된다) */
export function bounds(strokes: number[][][]) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  strokes.forEach((s) => s.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }));
  if (minX > maxX) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0.5, cy: 0.5 };
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** 배치(이동·확대)를 실제 좌표에 적용한다 */
export function applyTransform(
  strokes: number[][][],
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  scale: number
): number[][][] {
  return strokes.map((s) =>
    s.map(([x, y]) => [
      Math.min(1, Math.max(0, cx + (x - cx) * scale + dx)),
      Math.min(1, Math.max(0, cy + (y - cy) * scale + dy)),
    ])
  );
}
