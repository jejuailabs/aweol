/**
 * 자동 크롭 검증.
 *
 * **판정 코드를 베껴 쓰지 않는다** — `src/lib/auto-crop.ts` 를 그대로 불러온다
 * (달리기 판정 검증과 같은 방식). 베껴 두면 화면은 고쳤는데 검증은 옛 계산을 본다.
 *
 * 여기서 보려는 것은 "잘 자르나" 보다 **"위험할 때 안 자르나"** 다.
 * 아이 작품을 잘못 자르는 것은 안 자르는 것보다 나쁘다.
 *
 * 실행: node --experimental-strip-types scripts/verify-auto-crop.mjs
 */
import { findContentBox, scaleBox } from '../src/lib/auto-crop.ts';

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

/** 배경(책상) 위에 작품 사각형 하나를 올린 흑백 사진을 만든다 */
function makePhoto({ w, h, bg, art, rect, noise = 0 }) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inArt =
        x >= rect.left && x < rect.left + rect.width &&
        y >= rect.top && y < rect.top + rect.height;
      let v = inArt ? art : bg;
      if (noise) v += Math.round((((x * 7 + y * 13) % 17) - 8) * (noise / 8));
      g[y * w + x] = Math.max(0, Math.min(255, v));
    }
  }
  return g;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('[가운데 놓인 작품 — 책상을 잘라내야 한다]');
{
  const w = 200, h = 150;
  const rect = { left: 50, top: 30, width: 100, height: 90 };
  const box = findContentBox(makePhoto({ w, h, bg: 120, art: 235, rect }), w, h);
  ok('사각형을 찾았다', !!box, JSON.stringify(box));
  if (box) {
    // 여백(짧은 변의 2% = 3px)만큼 넉넉하게 잡히는 것이 정상이다
    ok('왼쪽이 맞다', near(box.left, rect.left, 4), `${box.left} vs ${rect.left}`);
    ok('위쪽이 맞다', near(box.top, rect.top, 4), `${box.top} vs ${rect.top}`);
    ok('너비가 맞다', near(box.width, rect.width, 8), `${box.width} vs ${rect.width}`);
    ok('높이가 맞다', near(box.height, rect.height, 8), `${box.height} vs ${rect.height}`);
    ok('원본보다 작다 (책상이 빠졌다)', box.width * box.height < w * h * 0.6);
  }
}

console.log('\n[한쪽으로 치우친 작품 — 흔한 경우다]');
{
  const w = 200, h = 150;
  const rect = { left: 10, top: 8, width: 110, height: 100 };
  const box = findContentBox(makePhoto({ w, h, bg: 90, art: 220, rect }), w, h);
  ok('찾았다', !!box, JSON.stringify(box));
  if (box) {
    ok('왼쪽 위를 물고 있다', box.left <= rect.left + 2 && box.top <= rect.top + 2);
    ok('오른쪽 빈 책상을 버렸다', box.left + box.width < w - 20, `${box.left + box.width} < ${w - 20}`);
  }
}

console.log('\n[어두운 작품 — 밝은 배경 위의 검은 그림]');
{
  const w = 200, h = 150;
  const rect = { left: 40, top: 25, width: 110, height: 95 };
  const box = findContentBox(makePhoto({ w, h, bg: 210, art: 40, rect }), w, h);
  ok('밝고 어두움이 뒤집혀도 찾는다', !!box, JSON.stringify(box));
}

console.log('\n[자르면 안 되는 사진들 — null 이 나와야 한다]');
{
  const w = 200, h = 150;
  // 1) 작품이 이미 화면을 꽉 채웠다 — 1~2% 를 깎으면 가장자리 획이 잘린다
  const full = findContentBox(
    makePhoto({ w, h, bg: 120, art: 230, rect: { left: 2, top: 2, width: 196, height: 146 } }), w, h);
  ok('꽉 찬 사진은 안 자른다', full === null, JSON.stringify(full));

  // 2) 온통 같은 색 — 찾을 것이 없다
  const flat = findContentBox(new Uint8Array(w * h).fill(128), w, h);
  ok('밋밋한 사진은 안 자른다', flat === null, JSON.stringify(flat));

  // 3) 티끌만 한 얼룩 — 여기에 맞춰 자르면 작품이 사라진다
  const speck = findContentBox(
    makePhoto({ w, h, bg: 120, art: 240, rect: { left: 98, top: 74, width: 5, height: 4 } }), w, h);
  ok('점 하나에 맞춰 자르지 않는다', speck === null, JSON.stringify(speck));

  // 4) 너무 작은 사진 — 판정 자체가 미덥지 않다
  ok('아주 작은 사진은 손대지 않는다', findContentBox(new Uint8Array(16).fill(10), 4, 4) === null);
}

console.log('\n[잡티가 있어도 흔들리지 않는다]');
{
  const w = 200, h = 150;
  const rect = { left: 45, top: 30, width: 105, height: 90 };
  const box = findContentBox(makePhoto({ w, h, bg: 120, art: 225, rect, noise: 10 }), w, h);
  ok('책상 무늬가 있어도 찾는다', !!box, JSON.stringify(box));
  if (box) ok('사각형이 화면 끝까지 늘어나지 않았다', box.width < w - 10, `${box.width} < ${w - 10}`);
}

console.log('\n[원본 좌표로 되돌리기 — 밖으로 나가면 sharp 가 통째로 실패한다]');
{
  const from = { w: 220, h: 165 };
  const to = { w: 4000, h: 3000 };
  const s = scaleBox({ left: 50, top: 30, width: 100, height: 90 }, from, to);
  ok('비율대로 늘어난다', near(s.left, 909, 3) && near(s.width, 1818, 5), JSON.stringify(s));
  ok('원본 안에 있다', s.left + s.width <= to.w && s.top + s.height <= to.h, JSON.stringify(s));

  // 가장자리를 물고 있는 사각형도 밖으로 나가면 안 된다
  const edge = scaleBox({ left: 0, top: 0, width: from.w, height: from.h }, from, to);
  ok('가장자리도 안 넘친다', edge.left + edge.width <= to.w && edge.top + edge.height <= to.h,
    JSON.stringify(edge));
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
