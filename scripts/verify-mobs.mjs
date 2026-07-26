/**
 * 마을 정화 — 배치·문제 검증.
 *
 * **3D 는 눈으로 못 본다**(프리뷰 브라우저에서 Firebase 가 안 붙어 구운 마을이 안 온다).
 * 그래서 베러 갈 수 있는 자리인지는 여기서 숫자로 재본다.
 *
 * 막으려는 것:
 * - 건물 **안**에 있어 못 베는 것
 * - 자리 **밖**에 있어 못 가는 것
 * - 서로 붙어 있어 한 번 휘두르면 둘이 맞는 것
 * - 자리마다 개수가 모자라 **영영 다 못 치우는 것** (상을 못 받는다)
 * - 우두머리가 **하나도 없는 자리** (문제 푸는 재미가 통째로 빠진다)
 * - 학년을 걸렀을 때 **문제가 안 나오는 학년** (막다른 길이다)
 *
 * 실행: node --experimental-strip-types scripts/verify-mobs.mjs
 */
import { readFileSync } from 'fs';
import {
  MOB_KINDS, MOBS_PER_SPOT, ATTACK_RANGE, mobsOfSpot, mobKindOfToken, mobKindById,
} from '../src/lib/village-mobs.ts';
import { VILLAGE_SPOTS, spotsOfSchool } from '../src/lib/village-spots.ts';
import { pickBellQuestions, isCorrect, answerText } from '../src/lib/goldenbell.ts';

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

async function loadVillage(spot) {
  const file = spot.home ? `${SCHOOL}.json` : `${SCHOOL}-${spot.id}.json`;
  const res = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${file}`);
  if (!res.ok) return null;
  return res.json();
}

// ---- 표 자체 ----
ok('종류 이름에 하이픈이 없다', MOB_KINDS.every((k) => !k.id.includes('-')));
ok('자리 이름에 하이픈이 없다', VILLAGE_SPOTS.every((s) => !s.id.includes('-')));
ok('id 가 겹치지 않는다', new Set(MOB_KINDS.map((k) => k.id)).size === MOB_KINDS.length);
ok('종류마다 배울 것이 적혀 있다', MOB_KINDS.every((k) => (k.note ?? '').length >= 20));
ok('체력이 1 이상이다', MOB_KINDS.every((k) => k.hp >= 1 && k.hp <= 5));
ok('우두머리가 둘 이상 있다', MOB_KINDS.filter((k) => k.tier === 'boss').length >= 2);
ok('졸개가 다섯 이상 있다', MOB_KINDS.filter((k) => k.tier === 'normal').length >= 5);

// ---- 자리마다 실제 배치 ----
for (const spot of spotsOfSchool(SCHOOL)) {
  const v = await loadVillage(spot);
  if (!v) { fails.push(`${spot.id}: 구운 마을을 못 받았다`); continue; }

  const mobs = mobsOfSpot(spot.id, v.r, v.b, v.cl);
  const t = spot.id;

  ok(`${t}: ${MOBS_PER_SPOT}마리가 다 놓인다 (${mobs.length})`, mobs.length === MOBS_PER_SPOT);

  const bosses = mobs.filter((m) => m.kind.tier === 'boss');
  ok(`${t}: 우두머리가 둘이다 (${bosses.length})`, bosses.length === 2);

  // 건물 안에 있으면 못 벤다
  const boxes = v.b.map((b) => {
    const xs = b.p.map((p) => p[0]);
    const zs = b.p.map((p) => p[1]);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minZ: Math.min(...zs), maxZ: Math.max(...zs),
    };
  });
  const inBuilding = mobs.filter((m) =>
    boxes.some((b) => m.x >= b.minX && m.x <= b.maxX && m.z >= b.minZ && m.z <= b.maxZ));
  ok(`${t}: 건물 안에 있는 것이 없다`, inBuilding.length === 0);

  ok(`${t}: 다 자리 안에 있다`, mobs.every((m) => Math.abs(m.x) <= v.r && Math.abs(m.z) <= v.r));

  if (spot.home) {
    ok(`${t}: 학교 앞마당에는 없다`,
      mobs.every((m) => Math.abs(m.x) >= 26 || Math.abs(m.z) >= 34));
  }

  /*
    한 번 휘두를 때 둘이 같이 맞으면 안 된다.
    칼이 닿는 거리(ATTACK_RANGE)의 갑절보다는 떨어져 있어야 한다.
  */
  let minGap = Infinity;
  for (let i = 0; i < mobs.length; i++) {
    for (let j = i + 1; j < mobs.length; j++) {
      const d = Math.hypot(mobs[i].x - mobs[j].x, mobs[i].z - mobs[j].z);
      if (d < minGap) minGap = d;
    }
  }
  ok(`${t}: 한 번에 둘이 안 맞는다 (${Math.round(minGap)}m)`, minGap > ATTACK_RANGE * 2);

  // 기록에서 종류를 되찾을 수 있어야 도감이 채워진다
  ok(`${t}: 기록에서 종류를 되찾는다`,
    mobs.every((m) => mobKindById(mobKindOfToken(m.id))?.id === m.kind.id));

  ok(`${t}: id 가 겹치지 않는다`, new Set(mobs.map((m) => m.id)).size === mobs.length);

  // 같은 씨앗이면 늘 같은 자리
  const again = mobsOfSpot(spot.id, v.r, v.b, v.cl);
  ok(`${t}: 두 번 계산해도 같은 자리`,
    again.every((a, i) => a.id === mobs[i].id && a.x === mobs[i].x && a.z === mobs[i].z));

  // 줍는 것과 겹쳐 서면 안 된다 — 씨앗을 달리 탄 이유가 이것이다
  const { itemsOfSpot } = await import('../src/lib/village-collect.ts');
  const items = itemsOfSpot(spot.id, v.r, v.b, v.cl);
  const stacked = mobs.filter((m) =>
    items.some((it) => Math.hypot(it.x - m.x, it.z - m.z) < 6));
  ok(`${t}: 주울 것과 겹쳐 서지 않는다`, stacked.length === 0);

  // 바닷가 것은 해안선 가까이
  const shore = mobs.filter((m) => m.kind.shore);
  if ((v.cl?.length ?? 0) > 0 && shore.length > 0) {
    const pts = v.cl.flat();
    const far = shore.filter((m) =>
      Math.min(...pts.map((p) => Math.hypot(p[0] - m.x, p[1] - m.z))) > 32);
    ok(`${t}: 바닷가 것은 바닷가에 있다`, far.length === 0);
  }

  console.log(
    `  ${t}: ${mobs.length}마리 (우두머리 ${bosses.length}) · 가장 가까운 둘 ${Math.round(minGap)}m · `
    + `종류 ${new Set(mobs.map((m) => m.kind.id)).size}가지`
  );
}

/**
 * **우두머리 문제가 학년마다 나와야 한다.**
 *
 * 문제은행을 학년으로 거르는데(±2학년), 어느 학년에서 걸러낸 것이 비면
 * 그 학년 아이는 우두머리를 영영 못 잡는다. 막다른 길이다.
 */
for (let g = 1; g <= 6; g++) {
  const qs = pickBellQuestions(12345 + g, 1, g);
  ok(`${g}학년 문제가 나온다`, qs.length === 1 && !!qs[0]?.q);
  if (qs[0]) {
    // 정답 판정이 실제로 통해야 한다 — 안 통하면 맞혀도 껍질이 안 깨진다
    const q = qs[0];
    const given = q.kind === 'choice' ? q.answer : q.answer[0];
    ok(`${g}학년 문제의 정답이 정답으로 채점된다`, isCorrect(q, given));
    ok(`${g}학년 문제에 정답 풀이가 있다`, (q.why ?? '').length > 5 && !!answerText(q));
  }
}

console.log(fails.length === 0 ? `\n✅ ${pass}개 통과` : `\n❌ ${fails.length}개 실패 (${pass}개 통과)`);
for (const f of fails) console.log('   -', f);
process.exit(fails.length === 0 ? 0 : 1);
