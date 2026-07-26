/**
 * 마을에 들어설 때 서는 자리가 **땅인가.**
 *
 * 집 자리(애월리)는 (0,30)이 학교 앞이라 맞다. 그런데 **한담·곽지는 학교가 없다** —
 * 거기서도 똑같이 (0,30)에 세우면 그 자리가 바다일 수도, 건물 속일 수도 있다.
 * "자리를 옮기니 지도 밖에 나간 것 같다" 는 증상이 이것인지 여기서 재본다.
 *
 * 실행: node --experimental-strip-types scripts/verify-spawn.mjs
 */
import { readFileSync } from 'fs';
import { spotsOfSchool } from '../src/lib/village-spots.ts';
import { seaMask, isSea } from '../src/lib/village-sea.ts';
import { blocksOfBuildings } from '../src/lib/village-blocks.ts';

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

const AVATAR_R = 0.28;
const inBlock = (blocks, x, z) =>
  blocks.some((b) =>
    Math.abs(x - b.x) < b.halfW + AVATAR_R && Math.abs(z - b.z) < b.halfD + AVATAR_R);

for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) { console.log(`${spot.id}: 구운 마을을 못 받았다`); continue; }

  const blocks = blocksOfBuildings(v.b);
  const mask = (v.cl?.length ?? 0) > 0 ? seaMask(v.cl, v.r) : null;

  const X = 0;
  const Z = 30;
  const sea = mask ? isSea(mask, X, Z) : false;
  const blocked = inBlock(blocks, X, Z);

  console.log(`\n${spot.id} (${spot.name}) home=${!!spot.home} 반지름 ${v.r}m`);
  console.log(`  지금 서는 자리 (0, 30):`);
  console.log(`    바다인가   : ${sea ? '❌ 바다다' : '땅'}`);
  console.log(`    건물 속인가: ${blocked ? '❌ 건물 속이다' : '비었다'}`);

  if (sea || blocked) {
    // 가까운 땅을 찾아본다 — 고칠 때 쓸 값
    let best = null;
    for (let r = 10; r <= v.r * 0.6 && !best; r += 10) {
      for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2;
        const x = Math.round(Math.cos(th) * r);
        const z = Math.round(Math.sin(th) * r);
        if (mask && isSea(mask, x, z)) continue;
        if (inBlock(blocks, x, z)) continue;
        best = { x, z, r };
        break;
      }
    }
    console.log(`    → 가까운 땅: ${best ? `(${best.x}, ${best.z}) ${best.r}m 밖` : '못 찾음'}`);
  }
}
process.exit(0);
