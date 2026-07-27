/**
 * 마을 관공서가 **진짜 그 자리에 있나.**
 *
 * 지금은 400m(구울 때 반경) 안에 못 찾으면 학교 둘레에 **가짜 건물**을 세운다.
 * 우리 동네를 배우는 화면에서 우체국 자리를 지어내면 안 배우느니만 못하다.
 *
 * 여기서는 OSM 에 **실제로** 무엇이 어디 있는지 넓게 물어본다.
 * 얼마나 먼지 알아야 "지도를 넓힐지 / 워프로 갈지" 를 정할 수 있다.
 *
 * 실행: node --experimental-strip-types scripts/verify-civic.mjs
 */
import { CIVIC_PLACES } from '../src/lib/civic-places.ts';
import { VILLAGE_SPOTS, spotsOfSchool } from '../src/lib/village-spots.ts';

const SCHOOL = 'aewol-elementary';
/** 얼마나 넓게 물어볼까 */
const R = 6000;

const home = spotsOfSchool(SCHOOL).find((s) => s.home) ?? VILLAGE_SPOTS[0];
const { lat, lng } = home;
console.log(`기준: ${home.name} (${lat}, ${lng}) — 반경 ${R / 1000}km\n`);

const query = `
[out:json][timeout:90];
(
  nwr["amenity"~"^(townhall|post_office|police|library|bank|clinic|doctors|pharmacy|fire_station|community_centre)$"](around:${R},${lat},${lng});
  nwr["office"="government"](around:${R},${lat},${lng});
  nwr["shop"="convenience"](around:${R},${lat},${lng});
  nwr["amenity"~"^(cafe|restaurant|fast_food)$"](around:${R},${lat},${lng});
);
out center tags;`;

/** Overpass 는 공짜 공용 서버라 자주 붐빈다(504). 거울을 돌려가며 되묻는다. */
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
async function ask() {
  let last = '';
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(MIRRORS[i % MIRRORS.length], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'aewol-school-exhibition/1.0 (verify civic places)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (r.ok) return r.json();
      last = `HTTP ${r.status}`;
    } catch (e) { last = String(e.message).slice(0, 60); }
    process.stdout.write(`(${i + 1}번째 실패: ${last}, 다시) `);
    await new Promise((r) => setTimeout(r, 5000 + i * 4000));
  }
  console.log(`\nOverpass 를 못 불렀다 (${last})`);
  process.exit(1);
}
const json = await ask();

const M_PER_DEG = 111320;
const cosLat = Math.cos((lat * Math.PI) / 180);
const toXZ = (la, ln) => [(ln - lng) * M_PER_DEG * cosLat, -(la - lat) * M_PER_DEG];
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const dirOf = (x, z) => DIRS[Math.round((Math.atan2(x, -z) * 180 / Math.PI + 360) % 360 / 45) % 8];

/** civic-places 의 이름 규칙을 그대로 옮겨 온다 */
const NAME_RULES = [
  ['townhall', ['읍사무소', '면사무소', '동주민센터', '주민센터', '행정복지센터', '시청', '군청', '구청']],
  ['post_office', ['우체국']],
  ['police', ['경찰서', '파출소', '지구대', '치안센터']],
  ['library', ['도서관']],
  ['nonghyup', ['농협', '축협', '농업협동조합']],
  ['health', ['보건지소', '보건진료소', '보건소', '보건의료원']],
  ['convenience', ['편의점', 'CU', 'GS25', '세븐일레븐', '이마트24', '미니스톱']],
  ['cafe', ['카페', '커피', '빵집', '베이커리', 'cafe', 'coffee']],
  ['restaurant', ['식당', '음식점', '분식', '횟집', '국수', '해장국', '갈비', '치킨', '피자']],
];
const TAG_KIND = {
  townhall: 'townhall', post_office: 'post_office', police: 'police', library: 'library',
  clinic: 'health', doctors: 'health', convenience: 'convenience',
  cafe: 'cafe', restaurant: 'restaurant', fast_food: 'restaurant', bakery: 'cafe',
};

const fails = [];
let checked = 0;
const found = new Map();
for (const e of json.elements ?? []) {
  const t = e.tags ?? {};
  const name = (t['name:ko'] || t.name || '').trim();
  const la = e.lat ?? e.center?.lat;
  const ln = e.lon ?? e.center?.lon;
  if (!la || !ln) continue;

  const flat = name.replace(/\s+/g, '');
  let kind = NAME_RULES.find(([, ws]) => ws.some((w) => flat.includes(w)))?.[0];
  if (!kind) kind = TAG_KIND[t.amenity] ?? TAG_KIND[t.shop];
  if (!kind) continue;

  const [x, z] = toXZ(la, ln);
  const d = Math.hypot(x, z);
  const cur = found.get(kind);
  if (!cur || d < cur.d) found.set(kind, { name: name || '(이름없음)', d, x, z });
}

console.log('종류'.padEnd(18), '가장 가까운 실제 위치'.padEnd(30), '거리·방향');
console.log('-'.repeat(74));
for (const p of CIVIC_PLACES) {
  const f = found.get(p.kind);
  if (!f) {
    console.log(`${p.emoji} ${p.label}`.padEnd(20), '❌ 6km 안에 없다');
    continue;
  }
  const far = f.d > 400;
  console.log(
    `${p.emoji} ${p.label}`.padEnd(20),
    f.name.slice(0, 26).padEnd(28),
    `${Math.round(f.d)}m ${dirOf(f.x, f.z)}${far ? '  ⚠️ 마을(400m) 밖' : ''}`
  );
}

// ---- 구워둔 마을에서 실제로 찾아지는가 ----
const { readFileSync } = await import('fs');
const { civicKindOf } = await import('../src/lib/civic-places.ts');
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const vr = await fetch(`https://storage.googleapis.com/${bucket}/app-assets/villages/${SCHOOL}.json`);
if (vr.ok) {
  const v = await vr.json();
  const inBuildings = new Set();
  for (const b of v.b) { const k = civicKindOf(b); if (k) inBuildings.add(k); }
  const poiNames = (v.poi ?? []).map((q) => (q.n ?? '').replace(/\s+/g, ''));

  /** poi 로도 찾아지나 — 화면이 이걸로 실제 자리에 세운다 */
  const inPois = new Set();
  for (const q of (v.poi ?? [])) {
    const k = civicKindOf({ n: q.n, k: q.k });
    if (k) inPois.add(k);
  }

  console.log(`\n구운 마을(반경 ${v.r}m) 안에서 — 건물 ${v.b.length}채, poi ${(v.poi ?? []).length}개`);
  console.log('종류'.padEnd(20), '어떻게 찾나'.padEnd(22), '실제 거리');
  console.log('-'.repeat(68));
  for (const p of CIVIC_PLACES) {
    const f = found.get(p.kind);
    const ok = inBuildings.has(p.kind);
    const viaPoi = inPois.has(p.kind);
    const how = ok ? '✅ 건물(진짜 모양)' : viaPoi ? '✅ 점(진짜 자리)' : '❌ 못 찾음';
    console.log(
      `${p.emoji} ${p.label}`.padEnd(22),
      how.padEnd(24),
      f ? `${Math.round(f.d)}m ${f.d <= v.r ? '(반경 안)' : '(반경 밖)'}` : '—'
    );
    checked++;
    /*
      **반경 안에 실제로 있는데 못 찾으면 실패다.** 그 자리는 지어내게 된다.
      반경 밖인 것은 안 세우는 것이 맞으므로 실패로 안 친다.
    */
    if (!ok && !viaPoi && f && f.d <= v.r) {
      fails.push(`${p.label}: ${Math.round(f.d)}m 에 실제로 있는데 못 찾는다 (${f.name})`);
    }
  }
  poiNames.length;
}

const maxD = Math.max(...[...found.values()].map((f) => f.d));
console.log(`\n실제로 있는 곳 중 가장 먼 것: ${Math.round(maxD)}m`);
if (fails.length === 0) {
  console.log(`\n✅ 지어낸 자리 없음 — ${checked}곳 모두 OSM 좌표 그대로다`);
} else {
  console.log(`\n❌ ${fails.length}곳이 지어낸 자리다`);
  for (const f of fails) console.log('   -', f);
}
process.exit(fails.length === 0 ? 0 : 1);
