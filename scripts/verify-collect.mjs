/**
 * 마을에서 줍는 것 — 배치 검증.
 *
 * **3D 는 눈으로 못 본다**(프리뷰 브라우저에서 rAF 가 안 돈다).
 * 그래서 숨긴 자리가 쓸 만한지는 여기서 숫자로 재본다.
 *
 * 막으려는 것:
 * - 건물 **안**에 있어 못 줍는 것
 * - 자리 **밖**에 있어 못 가는 것
 * - 서로 붙어 있어 한 발짝에 다 주워지는 것
 * - 자리마다 개수가 모자라 **영영 다 못 모으는 것** (상을 못 받는다)
 *
 * 실행: node --experimental-strip-types scripts/verify-collect.mjs
 */
import { readFileSync } from 'fs';
import {
  COLLECT_KINDS, PER_SPOT, PICK_RADIUS, NEAR_M, MIN_GAP, SHOW_RANGE,
  itemsOfSpot, kindOfToken, kindById,
} from '../src/lib/village-collect.ts';
import { VILLAGE_SPOTS, spotsOfSchool } from '../src/lib/village-spots.ts';

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

// ---- .env.local 에서 버킷 이름 ----
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const SCHOOL = 'aewol-elementary';

/** 구워 둔 마을을 그대로 받아 쓴다 — 실제 데이터로 재야 뜻이 있다 */
async function loadVillage(spot) {
  const file = spot.home ? `${SCHOOL}.json` : `${SCHOOL}-${spot.id}.json`;
  const res = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${file}`);
  if (!res.ok) return null;
  return res.json();
}

// ---- 표 자체 ----
ok('종류 이름에 하이픈이 없다', COLLECT_KINDS.every((k) => !k.id.includes('-')));
ok('자리 이름에 하이픈이 없다', VILLAGE_SPOTS.every((s) => !s.id.includes('-')));
ok('종류가 여덟 이상', COLLECT_KINDS.length >= 8);
ok('종류마다 배울 것이 적혀 있다', COLLECT_KINDS.every((k) => (k.note ?? '').length >= 15));
ok('id 가 겹치지 않는다', new Set(COLLECT_KINDS.map((k) => k.id)).size === COLLECT_KINDS.length);

// ---- 자리마다 실제 배치 ----
for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) { fails.push(`${spot.id}: 구운 마을을 못 받았다`); continue; }

  const items = itemsOfSpot(spot.id, v.r, v.b, v.cl);
  const t = spot.id;

  ok(`${t}: ${PER_SPOT}개가 다 놓인다 (${items.length})`, items.length === PER_SPOT);

  // 건물 안에 있으면 못 줍는다
  const boxes = v.b.map((b) => {
    const xs = b.p.map((p) => p[0]);
    const zs = b.p.map((p) => p[1]);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minZ: Math.min(...zs), maxZ: Math.max(...zs),
    };
  });
  const inBuilding = items.filter((it) =>
    boxes.some((b) => it.x >= b.minX && it.x <= b.maxX && it.z >= b.minZ && it.z <= b.maxZ));
  ok(`${t}: 건물 안에 있는 것이 없다`, inBuilding.length === 0);

  // 자리 밖이면 못 간다
  ok(`${t}: 다 자리 안에 있다`, items.every((it) => Math.abs(it.x) <= v.r && Math.abs(it.z) <= v.r));

  // 발밑에 있으면 걷기도 전에 주워진다
  ok(`${t}: 시작 자리 발밑에는 없다`, items.every((it) => Math.hypot(it.x, it.z) >= 6));

  // 서로 붙어 있으면 한 발짝에 다 주워진다
  let minGap = Infinity;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z);
      if (d < minGap) minGap = d;
    }
  }
  ok(`${t}: 서로 넉넉히 떨어져 있다 (${Math.round(minGap)}m)`, minGap > PICK_RADIUS * 4);

  /*
    **가까운 데서부터, 걷는 내내 나와야 한다.**
    예전에는 앞마당을 통째로 비우고 아무 데나 흩뿌려서, 첫 개를 만나기까지
    한참 걸었고 그 뒤로도 띄엄띄엄이었다. 몹과 같은 기준으로 잰다.
  */
  const dists = items.map((it) => Math.hypot(it.x, it.z)).sort((a, b) => a - b);
  ok(`${t}: 첫 개가 가깝다 (${Math.round(dists[0])}m)`, dists[0] <= NEAR_M * 1.8);
  let maxStep = dists[0];
  for (let i = 1; i < dists.length; i++) maxStep = Math.max(maxStep, dists[i] - dists[i - 1]);
  ok(`${t}: 중간에 텅 빈 구간이 없다 (가장 먼 간격 ${Math.round(maxStep)}m)`, maxStep <= SHOW_RANGE * 1.6);

  // 기록에서 종류를 되찾을 수 있어야 도감이 채워진다
  ok(`${t}: 기록에서 종류를 되찾는다`,
    items.every((it) => kindById(kindOfToken(it.id))?.id === it.kind.id));

  // 같은 씨앗이면 늘 같은 자리 — 아니면 "저기 소라 있어" 가 통하지 않는다
  const again = itemsOfSpot(spot.id, v.r, v.b, v.cl);
  ok(`${t}: 두 번 계산해도 같은 자리`,
    again.every((a, i) => a.id === items[i].id && a.x === items[i].x && a.z === items[i].z));

  // 바닷가 것은 해안선 가까이 (해안선이 있는 자리에서만)
  const shore = items.filter((it) => it.kind.shore);
  if ((v.cl?.length ?? 0) > 0 && shore.length > 0) {
    const pts = v.cl.flat();
    // 코드가 바닷가로 치는 거리와 **같은 값**이어야 한다 (village-collect.ts 의 atShore)
    const far = shore.filter((it) =>
      Math.min(...pts.map((p) => Math.hypot(p[0] - it.x, p[1] - it.z))) > 55);
    ok(`${t}: 바닷가 것은 바닷가에 있다`, far.length === 0);
  }

  console.log(
    `  ${t}: ${items.length}개 · 첫 개 ${Math.round(dists[0])}m · `
    + `간격 최대 ${Math.round(maxStep)}m · 서로 최소 ${Math.round(minGap)}m · `
    + `종류 ${new Set(items.map((i) => i.kind.id)).size}가지`
  );
}

/**
 * **도감을 채울 수 있어야 한다.**
 *
 * 자리마다 여덟 개씩이라 한 자리에서는 종류가 다 안 나온다. 그건 괜찮다 —
 * 여러 자리를 다녀야 채워지는 것이 도감의 뜻이다.
 * 다만 **어느 자리에도 안 나오는 종류가 있으면 영영 못 채운다.** 막다른 길이다.
 */
const everywhere = new Set();
for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) continue;
  for (const it of itemsOfSpot(spot.id, v.r, v.b, v.cl)) everywhere.add(it.kind.id);
}
const never = COLLECT_KINDS.filter((k) => !everywhere.has(k.id)).map((k) => k.name);
ok(
  `모든 종류가 어딘가에는 있다${never.length ? ` — 없는 것: ${never.join(', ')}` : ''}`,
  never.length === 0
);
console.log(`  도감: ${everywhere.size} / ${COLLECT_KINDS.length} 종류를 모을 수 있다`);

console.log(fails.length === 0 ? `\n✅ ${pass}개 통과` : `\n❌ ${fails.length}개 실패 (${pass}개 통과)`);
for (const f of fails) console.log('   -', f);
process.exit(fails.length === 0 ? 0 : 1);
