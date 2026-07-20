/**
 * 학교 대표 이미지에서 3D 외관에 쓸 색을 뽑는다.
 *
 * 건물 형태는 학교마다 공용을 쓰되, 벽·지붕 색을 그 학교 이미지에서 가져오면
 * 들어갔을 때 "우리 학교"라는 느낌이 난다. (모든 학교가 같은 빨간 지붕이면
 * 한라산에 들어가도 애월초와 구분이 안 된다)
 */

export interface SchoolPalette {
  wall: string;
  wallWarm: string;
  roof: string;
  roofDark: string;
}

/** 이미지를 못 읽었을 때 쓰는 기존 색 */
export const DEFAULT_PALETTE: SchoolPalette = {
  wall: '#FFF3E0',
  wallWarm: '#FFE8CC',
  roof: '#E8493C',
  roofDark: '#D63C2F',
};

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) { const v = l * 255; return [v, v, v] as const; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255] as const;
}

/**
 * 이미지에서 팔레트를 뽑는다.
 * 실패하면(주소 없음·CORS 막힘·로드 실패) 기본 색을 돌려준다 — 화면이 깨지면 안 된다.
 */
export async function extractSchoolPalette(url: string): Promise<SchoolPalette> {
  if (!url || typeof window === 'undefined') return DEFAULT_PALETTE;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    // 버킷 CORS 가 열려 있어야 canvas 로 픽셀을 읽을 수 있다
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
  if (!img) return DEFAULT_PALETTE;

  try {
    const N = 24; // 작게 줄여서 대충의 색만 본다
    const canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return DEFAULT_PALETTE;
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);

    // 색상(hue) 12칸으로 나눠 가장 많이 쓰인 '진한 색'을 지붕으로 삼는다
    const bins = Array.from({ length: 12 }, () => ({ n: 0, h: 0, s: 0, l: 0 }));
    let lightR = 0, lightG = 0, lightB = 0, lightN = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 128) continue;
      const { h, s, l } = rgbToHsl(r, g, b);

      // 밝고 옅은 픽셀 → 벽 후보
      if (l > 0.62 && s < 0.5) { lightR += r; lightG += g; lightB += b; lightN += 1; }

      // 너무 어둡거나 옅은 건 지붕 후보에서 뺀다 (하늘·그림자에 끌려간다)
      if (s < 0.35 || l < 0.22 || l > 0.82) continue;
      const bin = bins[Math.min(11, Math.floor(h * 12))];
      bin.n += 1; bin.h += h; bin.s += s; bin.l += l;
    }

    const top = bins.reduce((a, b) => (b.n > a.n ? b : a), bins[0]);
    if (top.n === 0) return DEFAULT_PALETTE;

    const h = top.h / top.n;
    const s = Math.min(0.72, Math.max(0.42, top.s / top.n));
    const l = Math.min(0.62, Math.max(0.42, top.l / top.n));

    const [rr, rg, rb] = hslToRgb(h, s, l);
    const [dr, dg, dbb] = hslToRgb(h, s, Math.max(0.3, l - 0.08));

    // 벽은 이미지의 밝은 톤을 쓰되, 너무 어두우면 아이 눈에 답답하니 끌어올린다
    let wall = DEFAULT_PALETTE.wall;
    let wallWarm = DEFAULT_PALETTE.wallWarm;
    if (lightN > 0) {
      const wr = lightR / lightN, wg = lightG / lightN, wb = lightB / lightN;
      const wl = rgbToHsl(wr, wg, wb);
      const [nr, ng, nb] = hslToRgb(wl.h, Math.min(0.3, wl.s), Math.max(0.88, wl.l));
      wall = toHex(nr, ng, nb);
      const [ar, ag, ab] = hslToRgb(wl.h, Math.min(0.36, wl.s + 0.06), Math.max(0.83, wl.l - 0.04));
      wallWarm = toHex(ar, ag, ab);
    }

    return { wall, wallWarm, roof: toHex(rr, rg, rb), roofDark: toHex(dr, dg, dbb) };
  } catch {
    // canvas 가 오염되면(CORS) getImageData 가 던진다
    return DEFAULT_PALETTE;
  }
}
