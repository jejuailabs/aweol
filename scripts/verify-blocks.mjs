/**
 * 보이지 않는 벽 찾기.
 *
 * 건물 충돌을 **다각형을 감싸는 네모(AABB)** 로 잡고 있다.
 * 건물이 비스듬히 서 있으면 그 네모가 **빈 땅까지 덮는다** —
 * 아무것도 없는 풀밭에서 막혀 옆으로 돌아가야 하는 증상이 이것이다.
 *
 * 여기서는 "네모가 실제 건물보다 몇 배나 큰가" 를 재서 범인을 찾는다.
 *
 * 실행: node --experimental-strip-types scripts/verify-blocks.mjs
 */
import { readFileSync } from 'fs';
import { spotsOfSchool } from '../src/lib/village-spots.ts';
import { blocksOfBuildings, blocksOfPolygon } from '../src/lib/village-blocks.ts';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const SCHOOL = 'aewol-elementary';

async function loadVillage(spot) {
  const file = spot.home ? `${SCHOOL}.json` : `${SCHOOL}-${spot.id}.json`;
  const res = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${file}`);
  if (!res.ok) return null;
  return res.json();
}

/** 다각형 넓이 (신발끈 공식) */
const polyArea = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  }
  return Math.abs(a) / 2;
};

for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) continue;

  const rows = v.b.map((b) => {
    const xs = b.p.map((q) => q[0]);
    const zs = b.p.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...zs) - Math.min(...zs);
    const box = w * d;
    const real = polyArea(b.p);
    return { n: b.n ?? '(이름없음)', w, d, box, real, ratio: real > 0.5 ? box / real : 999 };
  });

  const bad = rows.filter((r) => r.ratio >= 1.6).sort((a, b) => b.box - a.box);
  const wasted = rows.reduce((s, r) => s + (r.box - r.real), 0);
  const totalBox = rows.reduce((s, r) => s + r.box, 0);

  // ---- 고친 뒤: 다각형을 작은 네모로 쪼갠 것 ----
  const blocks = blocksOfBuildings(v.b);
  const afterArea = blocks.reduce((s, b) => s + b.halfW * 2 * b.halfD * 2, 0);
  const realTotal = rows.reduce((s, r) => s + r.real, 0);
  const afterWaste = Math.max(0, afterArea - realTotal);

  console.log(`\n${spot.id} — 건물 ${rows.length}채`);
  console.log(`  [고치기 전] 막힌 넓이 ${Math.round(totalBox).toLocaleString()}㎡ 중 `
    + `${Math.round(wasted).toLocaleString()}㎡ (${Math.round((wasted / totalBox) * 100)}%) 가 빈 땅`);
  console.log(`  [고친  뒤] 막힌 넓이 ${Math.round(afterArea).toLocaleString()}㎡ 중 `
    + `${Math.round(afterWaste).toLocaleString()}㎡ (${Math.round((afterWaste / afterArea) * 100)}%) 가 빈 땅`);
  console.log(`  없앤 헛벽 ${Math.round(wasted - afterWaste).toLocaleString()}㎡ · `
    + `네모 ${rows.length}개 → ${blocks.length}개`);
  console.log(`  네모가 실제보다 1.6배 넘게 컸던 건물: ${bad.length}채`);
  for (const r of bad.slice(0, 3)) {
    console.log(`    · ${r.n}  ${Math.round(r.w)}x${Math.round(r.d)}m = ${r.ratio.toFixed(1)}배`);
  }

  // 쪼갠 네모가 건물 밖으로 크게 삐져나가면 안 된다
  const worst = v.b.map((b) => {
    const bs = blocksOfPolygon(b.p);
    const a = bs.reduce((s, q) => s + q.halfW * 2 * q.halfD * 2, 0);
    return a / Math.max(1, polyArea(b.p));
  }).sort((x, y) => y - x)[0];
  console.log(`  가장 헐렁한 건물도 실제의 ${worst.toFixed(1)}배`);
}
console.log('\n※ 1.0배면 딱 맞는다. 클수록 빈 땅을 막고 있다.');
process.exit(0);
