// 자리(spot) 마을을 굽는다 — 어드민 단추(/admin/{schoolId})와 **같은 일**
//
// 굽는 규칙은 `src/app/api/village/route.ts` 와 한 글자도 달라선 안 된다.
// 다르면 아이 화면이 자리마다 다르게 그려진다.
//
//   node scripts/bake-village-spots.mjs                 (전부)
//   node scripts/bake-village-spots.mjs gwakji          (한 자리만)
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ---- .env.local 파싱 (다른 스크립트와 같은 방식) ----
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const SCHOOL_ID = process.env.SCHOOL_ID || 'aewol-elementary';
const SIMPLIFY_M = 2;
const M_PER_DEG_LAT = 111320;

/**
 * **`src/lib/village-spots.ts` 와 같아야 한다.**
 * 스크립트는 TS 를 못 읽으니 여기 베껴 둔다 — 표를 고치면 여기도 고칠 것.
 */
const SPOTS = [
  /**
   * **집 자리는 좌표를 여기 안 적는다.** 학교 문서의 좌표를 그대로 써야 한다 —
   * 마을 원점이 곧 학교 자리라서, 다른 좌표로 구우면 **학교가 엉뚱한 데 선다.**
   */
  /*
    **반경은 `src/lib/village-spots.ts` 와 같아야 한다.**

    여기 값으로 굽고 화면은 저 표를 보므로, 어긋나면 걸어다닐 수 있는 넓이와
    실제로 구워진 넓이가 달라진다.

    애월리를 1,200m 로 넓힌 이유: 진짜 관공서를 실측해 보니
    (`scripts/verify-civic.mjs`) 도서관 939m, 식당 985m, 카페 845m 로
    800m 밖이었다. 안 들어오니 그동안 학교 옆에 **가짜 건물**을 세웠다.
  */
  { id: 'aewol', name: '애월리(학교 둘레)', home: true, radius: 1200 },
  { id: 'handam', name: '한담해변', lat: 33.4610, lng: 126.3105, radius: 600 },
  { id: 'gwakji', name: '곽지과물해변', lat: 33.4513, lng: 126.3047, radius: 800 },
];

/** Overpass 는 공짜 공용 서버라 자주 붐빈다(504). 거울을 돌려가며 되묻는다. */
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

async function overpass(lat, lng, RADIUS) {
  /*
    **다각형 관공서는 종류를 좁혀서 받는다.**

    `way["amenity"]` 를 그냥 열어두면 주차장·벤치·쓰레기통까지 다 딸려 와서,
    1,200m 반경에서는 60초 제한을 넘겨 통째로 실패했다(실측: fetch failed).
    필요한 것만 집어 물으면 가볍고, 어차피 쓰는 것도 이것뿐이다.

    제한 시간도 늘린다 — 반경이 넓어지면 서버가 그만큼 오래 판다.
  */
  const CIVIC = 'townhall|post_office|police|library|clinic|doctors|pharmacy'
    + '|fire_station|community_centre|bank|cafe|restaurant|fast_food';
  const query = `
[out:json][timeout:180];
(
  way["building"](around:${RADIUS},${lat},${lng});
  way["highway"](around:${RADIUS},${lat},${lng});
  way["natural"="water"](around:${RADIUS},${lat},${lng});
  way["natural"="coastline"](around:${RADIUS},${lat},${lng});
  way["leisure"](around:${RADIUS},${lat},${lng});
  node["amenity"](around:${RADIUS},${lat},${lng});
  node["shop"](around:${RADIUS},${lat},${lng});
  node["historic"](around:${RADIUS},${lat},${lng});
  node["tourism"](around:${RADIUS},${lat},${lng});
  way["amenity"~"^(${CIVIC})$"](around:${RADIUS},${lat},${lng});
  way["shop"~"^(convenience|supermarket|bakery)$"](around:${RADIUS},${lat},${lng});
  way["office"="government"](around:${RADIUS},${lat},${lng});
);
out geom;`;

  let lastErr = '';
  for (let i = 0; i < 6; i++) {
    try {
      /*
        **기다리는 시간을 우리가 정한다.**
        안 정하면 node 기본값에 끌려가 `fetch failed` 한 줄만 남는다 —
        서버가 죽은 건지 내가 못 기다린 건지 알 수가 없다.
        서버 제한(180초)보다 넉넉히 준다.
      */
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 210_000);
      try {
        const res = await fetch(MIRRORS[i % MIRRORS.length], {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'aewol-school-exhibition/1.0 (school 3D village)',
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: ctl.signal,
        });
        if (res.ok) return (await res.json()).elements ?? [];
        lastErr = `HTTP ${res.status}`;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e.name === 'AbortError' ? '210초 안에 응답 없음' : String(e.message).slice(0, 80);
    }
    process.stdout.write(`(${i + 1}번째 실패: ${lastErr}, 다시) `);
    await new Promise((r) => setTimeout(r, 6000 + i * 5000));
  }
  throw new Error(`Overpass 실패 (${lastErr})`);
}

function build(elements, lat, lng, RADIUS) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const toXZ = (la, lo) => [
    Math.round((lo - lng) * mPerDegLng * 10) / 10,
    Math.round(-(la - lat) * M_PER_DEG_LAT * 10) / 10,
  ];
  const inside = (p) => Math.abs(p[0]) <= RADIUS && Math.abs(p[1]) <= RADIUS;

  const simplify = (pts) => {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const last = out[out.length - 1];
      if (Math.abs(pts[i][0] - last[0]) + Math.abs(pts[i][1] - last[1]) >= SIMPLIFY_M) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  // 반경 밖으로 나간 길은 잘라낸다 — 없으면 마을이 7km 짜리가 된다
  const clip = (pts) => {
    const runs = [];
    let cur = [];
    for (const p of pts) {
      if (inside(p)) cur.push(p);
      else { if (cur.length >= 2) runs.push(cur); cur = []; }
    }
    if (cur.length >= 2) runs.push(cur);
    return runs;
  };

  const data = { c: [lat, lng], r: RADIUS, b: [], rd: [], a: [], poi: [], cl: [] };

  // 해안선은 길보다 넉넉히 남긴다 — 딱 반경에서 자르면 바다가 모서리에서 끊긴다
  const seaEdge = RADIUS * 1.6;
  const insideSea = (p) => Math.abs(p[0]) <= seaEdge && Math.abs(p[1]) <= seaEdge;

  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      const kind = t.amenity || t.shop || t.historic || t.tourism;
      if (kind && e.lat != null && e.lon != null) {
        const [x, z] = toXZ(e.lat, e.lon);
        if (inside([x, z])) data.poi.push({ x, z, k: kind, ...(t.name ? { n: t.name } : {}) });
      }
      continue;
    }
    if (!e.geometry?.length) continue;
    const pts = e.geometry.map((g) => toXZ(g.lat, g.lon));

    if (t.building) {
      if (!pts.some(inside)) continue;
      const levels = Number(t['building:levels']);
      const kind = t.amenity || t.shop || t.historic || t.tourism || '';
      data.b.push({
        p: simplify(pts),
        h: Number.isFinite(levels) && levels > 0 ? Math.min(30, levels * 3) : 6,
        ...(t.name ? { n: t.name } : {}),
        ...(kind ? { k: kind } : {}),
      });
    } else if (t.natural === 'coastline') {
      // **점 차례를 지킨다** — 진행 방향 왼쪽이 육지다. 뒤집으면 바다가 뭍에 그려진다
      let cur = [];
      for (const p of pts) {
        if (insideSea(p)) cur.push(p);
        else { if (cur.length >= 2) data.cl.push(simplify(cur)); cur = []; }
      }
      if (cur.length >= 2) data.cl.push(simplify(cur));
    } else if (t.highway) {
      const big = ['primary', 'secondary', 'tertiary', 'trunk'].includes(t.highway);
      for (const run of clip(pts)) data.rd.push({ p: simplify(run), w: big ? 8 : 4 });
    } else if (t.amenity || t.shop || t.office) {
      /*
        **건물 태그가 없는 관공서 다각형** — 자리만이라도 남긴다.
        담벼락으로 둘러친 우체국 부지처럼 amenity 만 있고 building 이 없는
        다각형이 있다. 버리면 그 우체국은 없는 것이 되고, 없으니까 화면이
        학교 옆에 가짜로 세웠다. 가운데 점을 시설(poi)로 남긴다 —
        모양은 몰라도 자리는 진짜다.
      */
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      if (!inside([cx, cz])) continue;
      data.poi.push({
        x: cx, z: cz,
        k: t.amenity || t.shop || t.office,
        ...(t.name ? { n: t.name } : {}),
      });
    } else if (t.natural === 'water' || t.leisure) {
      if (!pts.some(inside)) continue;
      data.a.push({ p: simplify(pts), k: t.natural === 'water' ? 'water' : 'park' });
    }
  }
  return data;
}

// ---- 실행 ----
const only = process.argv[2];
const targets = only ? SPOTS.filter((s) => s.id === only) : SPOTS;
if (targets.length === 0) {
  console.error(`모르는 자리: ${only} (아는 것: ${SPOTS.map((s) => s.id).join(', ')})`);
  process.exit(1);
}

/**
 * **모듈 방식으로 가져온다.** `import admin from 'firebase-admin'` 은 ESM 에서
 * `admin.credential` 이 undefined 라 `cert` 를 못 찾는다(다른 스크립트도 이 방식).
 */
const app = initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
  storageBucket: bucketName,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

const schoolSnap = await db.doc(`schools/${SCHOOL_ID}`).get();
if (!schoolSnap.exists) {
  console.error(`학교를 찾을 수 없어요: ${SCHOOL_ID}`);
  process.exit(1);
}
const school = schoolSnap.data();

for (const spot of targets) {
  // 집 자리는 **학교 좌표**를 쓴다 (원점이 곧 학교 자리다)
  const lat = spot.home ? Number(school.lat) : spot.lat;
  const lng = spot.home ? Number(school.lng) : spot.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.log(`${spot.name} — 좌표가 없어 건너뜀`);
    continue;
  }

  process.stdout.write(`${spot.name} 굽는 중... `);
  const els = await overpass(lat, lng, spot.radius);
  const data = build(els, lat, lng, spot.radius);

  if (data.b.length === 0 && data.rd.length === 0) {
    console.log('지도에 그려진 것이 거의 없어 건너뜀');
    continue;
  }

  /**
   * 집 자리는 **예전 경로·필드를 그대로 쓴다.**
   * 새 경로로 바꾸면 이 기능 이전 주소를 보던 화면이 빈 마을이 된다.
   */
  const path = spot.home
    ? `app-assets/villages/${SCHOOL_ID}.json`
    : `app-assets/villages/${SCHOOL_ID}-${spot.id}.json`;
  const file = bucket.file(path);
  await file.save(JSON.stringify(data), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
  });
  await file.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${path}?v=${Date.now()}`;

  await db.doc(`schools/${SCHOOL_ID}`).set(
    spot.home ? { villageUrl: url } : { spotVillages: { [spot.id]: url } },
    { merge: true }
  );

  const named = data.b.filter((b) => b.n).map((b) => b.n);
  console.log(
    `건물 ${data.b.length}채, 길 ${data.rd.length}조각, 시설 ${data.poi.length}곳,`
    + ` 해안선 ${data.cl.length}줄`
    + (named.length ? ` — ${named.slice(0, 3).join(', ')} …` : '')
  );

  // Overpass 를 몰아치면 막힌다. 한 자리 굽고 잠깐 쉰다.
  await new Promise((r) => setTimeout(r, 4000));
}
console.log('끝');
process.exit(0);
