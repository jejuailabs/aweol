/**
 * 바다 — **덮은 넓이를 잰다.**
 *
 * 이 검증은 사고가 나고 나서 생겼다.
 *
 * 처음 만든 바다는 해안선 마디마다 바다 쪽으로 2.4km 씩 밀어내 사각형을
 * 이어 붙였다. 그때 "바다 쪽 법선이 75% 북향" 이라는 숫자를 재고
 * "만과 곶이 있으니 정상" 이라며 넘어갔는데, **나머지 25% 가 육지를 쓸고
 * 지나간다**는 뜻이었다. 애월리는 애월항이 있어서 마을 전체가 바다가 됐다.
 *
 * **방향을 쟀지 넓이를 안 쟀다.** 그래서 여기서는 결과를 잰다:
 * 학교가 물에 잠겼나, 건물이 잠겼나, 길이 잠겼나, 아이가 바다에서 시작하나.
 *
 * 실행: node --experimental-strip-types scripts/verify-sea.mjs
 */
import { readFileSync } from 'fs';
import { seaMask, isSea, seaRatio, seaRects } from '../src/lib/village-sea.ts';
import { spotsOfSchool } from '../src/lib/village-spots.ts';

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const SCHOOL = 'aewol-elementary';

/** 아바타가 마을에 들어설 때 서는 자리 (VillageMapScene 의 start 와 같아야 한다) */
const START = { x: 0, z: 30 };

for (const spot of spotsOfSchool(SCHOOL)) {
  const file = spot.home ? `${SCHOOL}.json` : `${SCHOOL}-${spot.id}.json`;
  const res = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${file}`);
  if (!res.ok) { fails.push(`${spot.id}: 구운 마을을 못 받았다`); continue; }
  const v = await res.json();
  const t = spot.id;

  const m = seaMask(v.cl, v.r, 16);

  if (!(v.cl?.length > 0)) {
    ok(`${t}: 해안선이 없으면 바다도 없다`, m === null);
    continue;
  }

  const ratio = seaRatio(m);

  /**
   * **마을이 통째로 바다면 안 된다.** 이게 이번 사고의 알맹이다.
   * 바닷가 마을이라도 절반을 크게 넘기면 무언가 뒤집힌 것이다.
   */
  ok(`${t}: 마을이 통째로 바다가 아니다 (${Math.round(ratio * 100)}%)`, ratio < 0.6);
  ok(`${t}: 바다가 아예 없지도 않다`, ratio > 0.02);

  // 아이가 서는 자리
  ok(`${t}: 시작 자리가 뭍이다`, !isSea(m, START.x, START.z));

  // 집 자리라면 학교(원점)가 뭍이어야 한다
  if (spot.home) ok(`${t}: 학교 자리가 뭍이다`, !isSea(m, 0, 0));

  // 건물이 잠기면 안 된다
  const drowned = v.b.filter((b) => {
    const xs = b.p.map((p) => p[0]);
    const zs = b.p.map((p) => p[1]);
    return isSea(m, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2);
  });
  ok(`${t}: 물에 잠긴 건물이 없다`, drowned.length === 0);

  // 길이 잠기면 '막힌 느낌' 이 난다. 물가의 선착장 몇 점은 봐준다.
  let roadPts = 0;
  let roadSea = 0;
  for (const r of v.rd) for (const p of r.p) { roadPts++; if (isSea(m, p[0], p[1])) roadSea++; }
  ok(`${t}: 길이 물에 안 잠긴다 (${roadSea}/${roadPts})`, roadSea / Math.max(roadPts, 1) < 0.03);

  console.log(
    `  ${t}: 바다 ${Math.round(ratio * 100)}% · 사각형 ${seaRects(m).length}개 · `
    + `잠긴 건물 ${drowned.length} · 잠긴 길 점 ${roadSea}/${roadPts}`
  );
}

console.log(fails.length === 0 ? `\n✅ ${pass}개 통과` : `\n❌ ${fails.length}개 실패 (${pass}개 통과)`);
for (const f of fails) console.log('   -', f);
process.exit(fails.length === 0 ? 0 : 1);
