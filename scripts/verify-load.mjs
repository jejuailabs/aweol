/**
 * 로딩·렌더 부담 재보기.
 *
 * **3D 는 눈으로 못 본다**(프리뷰 브라우저에 Firebase 가 안 붙는다).
 * 그래서 "몇 개를 그리게 되나" 를 여기서 숫자로 센다.
 *
 * 재는 것:
 * - 마을에 들어설 때 한꺼번에 만들어지는 물체 수 (첫 화면이 늦는 원인)
 * - 서 있는 자리에서 실제로 그려지는 수 (매 프레임 훑는 비용)
 * - 거리 컬링이 얼마나 걷어내나
 *
 * 실행: node --experimental-strip-types scripts/verify-load.mjs
 */
import { readFileSync } from 'fs';
import { MOBS_PER_SPOT, SHOW_RANGE as MOB_RANGE, mobsOfSpot } from '../src/lib/village-mobs.ts';
import { PER_SPOT, SHOW_RANGE as ITEM_RANGE, itemsOfSpot } from '../src/lib/village-collect.ts';
import { spotsOfSchool } from '../src/lib/village-spots.ts';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const SCHOOL = 'aewol-elementary';

/** 에셋 한 종류가 몇 덩어리인가 (VillageMapScene 의 VillageProps 를 눈으로 세어 옮긴 값) */
const PROP_MESHES = {
  tree: 4, palm: 7, lamp: 3, bench: 4, flower: 3, hydrant: 3, rock: 1, bush: 2,
  sign: 3, bin: 2, fence: 4, wall: 3, garden: 5, hay: 2, scare: 5, dol: 4,
  cat: 5, chick: 4, gazebo: 7,
};
/** 몹 한 마리가 몇 덩어리인가 (MobBody.tsx) */
const MOB_MESHES = 9;
/** 에셋이 보이는 거리 (VillageMapScene 의 PROP_RANGE) */
const PROP_RANGE = 380;

async function loadVillage(spot) {
  const file = spot.home ? `${SCHOOL}.json` : `${SCHOOL}-${spot.id}.json`;
  const res = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${file}`);
  if (!res.ok) return null;
  return res.json();
}

/** VillageProps 의 씨앗 배치를 그대로 옮겨 온다 (수를 세려면 같은 자리여야 한다) */
function propsOf(radius, buildings) {
  const bboxes = buildings.map((b) => {
    const xs = b.p.map((p) => p[0]);
    const zs = b.p.map((p) => p[1]);
    return {
      minX: Math.min(...xs) - 3, maxX: Math.max(...xs) + 3,
      minZ: Math.min(...zs) - 3, maxZ: Math.max(...zs) + 3,
    };
  });
  const blocked = (x, z) =>
    bboxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)
    || (Math.abs(x) < 26 && Math.abs(z) < 34);
  const seeded = (i) => {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h ^ 0x12345, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = [];
  const R = radius * 0.9;
  const KINDS = [
    [0.30, 'tree'], [0.40, 'palm'], [0.46, 'lamp'], [0.51, 'bench'], [0.57, 'flower'],
    [0.60, 'hydrant'], [0.65, 'rock'], [0.70, 'bush'], [0.73, 'sign'], [0.76, 'bin'],
    [0.80, 'fence'], [0.83, 'wall'], [0.87, 'garden'], [0.90, 'hay'], [0.92, 'scare'],
    [0.94, 'dol'], [0.965, 'cat'], [0.985, 'chick'], [2, 'gazebo'],
  ];
  for (let i = 0; i < 380; i++) {
    const x = (seeded(i * 3) - 0.5) * R * 2;
    const z = (seeded(i * 3 + 1) - 0.5) * R * 2;
    if (blocked(x, z)) continue;
    const roll = seeded(i * 3 + 2);
    out.push({ kind: KINDS.find(([t]) => roll < t)[1], x, z });
  }
  return out;
}

const meshesOf = (props) =>
  props.reduce((n, p) => n + (PROP_MESHES[p.kind] ?? 3), 0);

console.log('마을에 들어설 때 만들어지는 덩어리 수 (적을수록 첫 화면이 빠르다)\n');

for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) { console.log(`  ${spot.id}: 구운 마을을 못 받았다`); continue; }

  const props = propsOf(v.r, v.b);
  const mobs = mobsOfSpot(spot.id, v.r, v.b, v.cl);
  const items = itemsOfSpot(spot.id, v.r, v.b, v.cl);

  /** 한가운데(학교 앞)에 섰을 때 걸러지는 수 */
  const near = (list, range) =>
    list.filter((o) => Math.hypot(o.x, o.z) <= range).length;

  const shownProps = props.filter((p) => Math.hypot(p.x, p.z) <= PROP_RANGE);

  const before = meshesOf(props) + mobs.length * MOB_MESHES + items.length;
  const after = meshesOf(shownProps)
    + near(mobs, MOB_RANGE) * MOB_MESHES
    + near(items, ITEM_RANGE);

  console.log(`  ${spot.id} (반지름 ${v.r}m)`);
  console.log(`    에셋   ${props.length}개 → 가까운 것 ${shownProps.length}개  (${Math.round((1 - shownProps.length / props.length) * 100)}% 덜 그림)`);
  console.log(`    몹     ${mobs.length}마리 → ${near(mobs, MOB_RANGE)}마리`);
  console.log(`    주울것 ${items.length}개 → ${near(items, ITEM_RANGE)}개`);
  console.log(`    덩어리 ${before}개 → ${after}개  (${Math.round((1 - after / before) * 100)}% 줄었다)`);
  console.log('');
}

console.log('※ 서 있는 자리에 따라 달라진다 — 마을 한가운데(학교 앞) 기준이다.');
process.exit(0);
