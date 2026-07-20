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

    /**
     * 색상(hue)을 12칸으로 나눠 가장 넓게 쓰인 색을 고른다.
     *
     * **위쪽 35%는 아예 안 본다.** 거기는 거의 언제나 하늘이다.
     * 하늘은 개수도 많고 채도도 높아서(실측: 개수 102, 채도점수 92 — 건물 주황보다 높다)
     * 개수로 뽑아도 채도로 뽑아도 이겨버린다. 그러면 학교마다 똑같은 하늘색이 나와
     * '학교별로 다르게' 라는 목적 자체가 사라진다. 잘라내는 게 가장 확실하다.
     */
    const SKY_CUT = Math.floor(N * 0.35);
    const bins = Array.from({ length: 12 }, () => ({ n: 0, h: 0, s: 0 }));

    for (let py = SKY_CUT; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const i = (py * N + px) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (data[i + 3] < 128) continue;
        const { h, s, l } = rgbToHsl(r, g, b);
        // 너무 어둡거나 옅은 건 뺀다 (그림자·흰 벽)
        if (s < 0.35 || l < 0.22 || l > 0.82) continue;
        const bin = bins[Math.min(11, Math.floor(h * 12))];
        bin.n += 1;
        bin.h += h;
        bin.s += s;
      }
    }

    const top = bins.reduce((a, b) => (b.n > a.n ? b : a), bins[0]);
    if (top.n === 0) return DEFAULT_PALETTE;

    const h = top.h / top.n;

    /**
     * 벽과 지붕을 **같은 색상에서** 뽑는다.
     * 예전에는 벽을 '밝은 픽셀 평균'으로 따로 구했는데, 하늘·구름이 섞여
     * 거의 무채색(#e7e2da)이 나왔다. 회색 건물에 황토 지붕이라 칙칙했다.
     * 한 색상의 밝은 톤과 진한 톤으로 맞추면 학교마다 다르면서도 산뜻하다.
     */
    const s = Math.min(0.78, Math.max(0.55, top.s / top.n));

    const [wr, wg, wb] = hslToRgb(h, Math.min(0.34, s * 0.42), 0.93);
    const [ar, ag, ab] = hslToRgb(h, Math.min(0.42, s * 0.5), 0.88);
    const [rr, rg, rb] = hslToRgb(h, s, 0.54);
    const [dr, dg, dbb] = hslToRgb(h, s, 0.45);

    return {
      wall: toHex(wr, wg, wb),
      wallWarm: toHex(ar, ag, ab),
      roof: toHex(rr, rg, rb),
      roofDark: toHex(dr, dg, dbb),
    };
  } catch {
    // canvas 가 오염되면(CORS) getImageData 가 던진다
    return DEFAULT_PALETTE;
  }
}
