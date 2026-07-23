/**
 * 보정 API 를 **진짜 사진으로** 통과시켜 본다.
 *
 * 계산만 맞는 것으로는 부족하다. sharp 의 좌표계, EXIF 회전, 잘라낸 뒤의 축소까지
 * 한 줄로 이어져야 실제로 액자에 걸린다 — 어긋나면 여기서 드러난다.
 *
 * 실행: BASE_URL=https://aweol.vercel.app node scripts/verify-enhance-crop.mjs
 */
import sharp from 'sharp';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

/** 책상(회색) 위에 작품(무늬 있는 밝은 사각형)을 올린 사진을 만든다 */
async function makePhoto({ w, h, rect, rotateExif = 0 }) {
  const art = await sharp({
    create: { width: rect.width, height: rect.height, channels: 3, background: { r: 240, g: 235, b: 220 } },
  })
    // 민무늬면 '작품' 이 아니라 '종이' 다. 획을 몇 개 그어 그림처럼 만든다.
    .composite([
      { input: await sharp({ create: { width: Math.floor(rect.width * 0.6), height: 12, channels: 3, background: { r: 30, g: 60, b: 160 } } }).png().toBuffer(), left: 20, top: 25 },
      { input: await sharp({ create: { width: 14, height: Math.floor(rect.height * 0.5), channels: 3, background: { r: 190, g: 40, b: 40 } } }).png().toBuffer(), left: 40, top: 50 },
    ])
    .png()
    .toBuffer();

  let img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 118, g: 112, b: 105 } },
  }).composite([{ input: art, left: rect.left, top: rect.top }]);

  let buf = await img.jpeg({ quality: 92 }).toBuffer();
  if (rotateExif) {
    // 세로로 찍은 폰 사진 흉내 — 픽셀은 가로인데 EXIF 가 '돌려서 봐라' 라고 적혀 있다
    buf = await sharp(buf).withMetadata({ orientation: 6 }).jpeg({ quality: 92 }).toBuffer();
  }
  return buf;
}

const enhance = async (buf) => {
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: 'image/jpeg' }), 'a.jpg');
  const res = await fetch(`${BASE}/api/enhance`, { method: 'POST', body: fd });
  if (!res.ok) return { status: res.status };
  const out = Buffer.from(await res.arrayBuffer());
  return { status: 200, meta: await sharp(out).metadata(), out };
};

console.log('[책상 위에 놓고 찍은 사진]');
{
  const src = { w: 1200, h: 900 };
  const rect = { left: 300, top: 180, width: 560, height: 500 };
  const r = await enhance(await makePhoto({ ...src, rect }));
  ok('보정이 됐다', r.status === 200, `HTTP ${r.status}`);
  if (r.meta) {
    const shrunk = r.meta.width < src.w * 0.92;
    ok('책상이 잘려나갔다', shrunk, `${src.w}x${src.h} → ${r.meta.width}x${r.meta.height}`);
    /**
     * 작품 자체가 남아 있는지. 잘린 그림의 가로세로 비가 원래 작품(560x500)에
     * 가까워야 한다 — 엉뚱한 데를 잘랐으면 비가 어긋난다.
     */
    const want = rect.width / rect.height;
    const got = r.meta.width / r.meta.height;
    ok('작품 비율이 지켜졌다', Math.abs(got - want) < 0.2, `${got.toFixed(2)} vs ${want.toFixed(2)}`);
  }
}

console.log('\n[세로로 찍어 EXIF 회전이 붙은 사진]');
{
  const src = { w: 1200, h: 900 };
  const rect = { left: 250, top: 150, width: 600, height: 520 };
  const r = await enhance(await makePhoto({ ...src, rect, rotateExif: 6 }));
  ok('보정이 됐다', r.status === 200, `HTTP ${r.status}`);
  if (r.meta) {
    /**
     * **회전을 먼저 확정하지 않으면 여기서 엉뚱한 자리를 자른다.**
     * 돌린 뒤에는 900x1200 이 되고, 작품은 세로로 길게 서 있어야 한다.
     */
    ok('돌린 뒤 기준으로 잘렸다 (세로가 더 길다)', r.meta.height > r.meta.width,
      `${r.meta.width}x${r.meta.height}`);
  }
}

console.log('\n[이미 꽉 찬 사진 — 건드리면 획이 잘린다]');
{
  const src = { w: 1000, h: 800 };
  const rect = { left: 8, top: 8, width: 984, height: 784 };
  const r = await enhance(await makePhoto({ ...src, rect }));
  ok('보정이 됐다', r.status === 200, `HTTP ${r.status}`);
  if (r.meta) {
    ok('거의 그대로 둔다', r.meta.width >= src.w * 0.95,
      `${src.w} → ${r.meta.width}`);
  }
}

console.log('\n[온통 같은 색 — 자를 것이 없다]');
{
  const buf = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 130, g: 130, b: 130 } } })
    .jpeg().toBuffer();
  const r = await enhance(buf);
  ok('실패하지 않고 원본 크기로 돌아온다', r.status === 200 && r.meta.width === 800,
    `HTTP ${r.status} ${r.meta?.width}x${r.meta?.height}`);
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
