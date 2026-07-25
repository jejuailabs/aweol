import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, isStaffOfSchool, verifyRequestUser } from '@/lib/firebase-admin';
import { spotById } from '@/lib/village-spots';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 학교 동네를 3D 로 걸어다닐 수 있게 굽는다.
 *
 * **아이가 마을에 들어올 때마다 지도를 부르지 않는다.** 학교를 만들 때(또는
 * 선생님이 다시 만들 때) 딱 한 번 부르고, 결과를 Storage 에 파일 하나로 둔다.
 * 기억창고와 같은 패턴이다.
 *
 * 이렇게 하는 이유가 두 가지다:
 * 1. **요금** — 아이 수만큼 지도 API 를 부르면 사람이 늘수록 요금이 는다.
 * 2. **정책** — OSM 계열 무료 서비스는 앱이 주기적으로 보내는 요청을 대량 조회로
 *    보고 금지한다. "결과를 로컬에 캐시하라"가 명시적 요구사항이다.
 */

/** 학교를 중심으로 이만큼 (미터). 자리(spot)를 구울 때는 그 자리의 반경을 쓴다. */
const BASE_RADIUS = 800;
/** 이보다 촘촘한 점은 솎아낸다 — 2m 차이는 아이 눈에 안 보인다 */
const SIMPLIFY_M = 2;

const M_PER_DEG_LAT = 111320;

type XZ = [number, number];

interface OsmEl {
  type: string;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export interface VillageData {
  /** 학교 좌표 (원점) */
  c: [number, number];
  r: number;
  /** 건물: 바닥 다각형 + 높이 + 이름 */
  /** `k` = 무엇인가 (amenity·historic·tourism). 관공서 학습 기능의 재료다. */
  b: { p: XZ[]; h: number; n?: string; k?: string }[];
  /** 길: 폴리라인 + 폭 */
  rd: { p: XZ[]; w: number }[];
  /** 물·공원 */
  a: { p: XZ[]; k: 'water' | 'park' }[];
  /**
   * 해안선. **OSM 규칙: 진행 방향 왼쪽이 육지, 오른쪽이 바다.**
   * 이 규칙 덕에 바다가 어느 쪽인지 계산으로 나온다 — 손으로 적을 필요가 없다.
   * 바닷가 마을이 아니면 없다.
   */
  cl?: XZ[][];
  /** 시설 표시 */
  poi: { x: number; z: number; k: string; n?: string }[];
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; spotId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  const schoolId = (body.schoolId || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });
  if (!isStaffOfSchool(user, schoolId)) {
    return NextResponse.json({ error: '이 학교의 선생님만 만들 수 있습니다' }, { status: 403 });
  }

  const db = adminDb();
  const snap = await db.doc(`schools/${schoolId}`).get();
  if (!snap.exists) return NextResponse.json({ error: '학교를 찾을 수 없습니다' }, { status: 404 });
  const school = snap.data() as { lat?: number; lng?: number; name?: string };

  /**
   * 어느 자리를 굽나.
   *
   * 자리 없이 부르면 **예전 그대로 학교 둘레**를 굽는다 — 이미 구운 학교들이
   * 이 기능 때문에 다시 구워야 하는 일이 있으면 안 된다.
   * 자리를 주면 그 자리의 좌표·반경으로 굽고, 결과를 따로 둔다.
   */
  const spotId = (body.spotId || '').trim();
  const spot = spotId ? spotById(spotId) : undefined;
  if (spotId && !spot) {
    return NextResponse.json({ error: '모르는 자리예요' }, { status: 400 });
  }
  if (spot && !spot.schoolIds.includes(schoolId)) {
    return NextResponse.json({ error: '이 학교의 자리가 아니에요' }, { status: 403 });
  }

  const lat = spot ? spot.lat : Number(school.lat);
  const lng = spot ? spot.lng : Number(school.lng);
  const RADIUS = spot ? spot.radius : BASE_RADIUS;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '학교 좌표가 없습니다' }, { status: 400 });
  }

  // ---------- 지도에서 받아오기 ----------
  const query = `
[out:json][timeout:60];
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
);
out geom;`;

  let elements: OsmEl[] = [];
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // 신원을 밝히는 건 OSM 이용 정책의 요구사항이다
        'User-Agent': 'aewol-school-exhibition/1.0 (school 3D village)',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `지도를 받지 못했어요 (HTTP ${res.status}). 잠시 뒤 다시 해주세요.` },
        { status: 502 }
      );
    }
    elements = ((await res.json()) as { elements?: OsmEl[] }).elements ?? [];
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 140) }, { status: 502 });
  }

  // ---------- 걸어다닐 좌표로 ----------
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const toXZ = (la: number, lo: number): XZ => [
    Math.round((lo - lng) * mPerDegLng * 10) / 10,
    Math.round(-(la - lat) * M_PER_DEG_LAT * 10) / 10,
  ];
  const inside = (p: XZ) => Math.abs(p[0]) <= RADIUS && Math.abs(p[1]) <= RADIUS;

  /** 촘촘한 점 솎아내기 */
  const simplify = (pts: XZ[]): XZ[] => {
    if (pts.length < 3) return pts;
    const out: XZ[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const last = out[out.length - 1];
      if (Math.abs(pts[i][0] - last[0]) + Math.abs(pts[i][1] - last[1]) >= SIMPLIFY_M) {
        out.push(pts[i]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  /**
   * 반경 밖으로 나간 길은 잘라낸다.
   * **이게 없으면 마을이 7km 짜리가 된다** — Overpass 는 반경에 '걸친' 길 전체를 준다.
   */
  const clip = (pts: XZ[]): XZ[][] => {
    const runs: XZ[][] = [];
    let cur: XZ[] = [];
    for (const p of pts) {
      if (inside(p)) cur.push(p);
      else { if (cur.length >= 2) runs.push(cur); cur = []; }
    }
    if (cur.length >= 2) runs.push(cur);
    return runs;
  };

  const data: VillageData = { c: [lat, lng], r: RADIUS, b: [], rd: [], a: [], poi: [], cl: [] };

  /**
   * 해안선은 반경 밖까지 이어진다 — 길처럼 잘라내되 **더 넉넉히** 남긴다.
   * 딱 반경에서 자르면 바다가 마을 모서리에서 끊겨 보인다.
   */
  const seaEdge = RADIUS * 1.6;
  const insideSea = (p: XZ) => Math.abs(p[0]) <= seaEdge && Math.abs(p[1]) <= seaEdge;

  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      // 행정기관(amenity)·유적지(historic)·관광지(tourism) 를 한 자리에 모은다
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
      /**
       * **건물이 무엇인지도 함께 남긴다.**
       *
       * 예전에는 이름만 남기고 종류를 버렸다. 그래서 '애월읍사무소' 는
       * 이름만 있는 상자였다 — 실제로는 `amenity=townhall` 이 붙어 있는데도.
       * 우체국·경찰서·읍사무소에 들어가 하는 일을 배우게 하려면 **무엇인지**를
       * 알아야 하고, 그건 여기서 안 남기면 나중에 전 학교를 다시 구워야 한다.
       *
       * 종류는 세 군데에 흩어져 있다: 행정기관은 `amenity`, 유적지는 `historic`,
       * 관광지는 `tourism`. 없으면 아예 안 적는다(빈 값은 용량만 먹는다).
       */
      const kind = t.amenity || t.shop || t.historic || t.tourism || '';
      data.b.push({
        p: simplify(pts),
        h: Number.isFinite(levels) && levels > 0 ? Math.min(30, levels * 3) : 6,
        ...(t.name ? { n: t.name } : {}),
        ...(kind ? { k: kind } : {}),
      });
    } else if (t.natural === 'coastline') {
      /**
       * **점 차례를 그대로 지킨다.** OSM 해안선은 방향에 뜻이 있다 —
       * 진행 방향 왼쪽이 육지다. 뒤집거나 이어 붙이면 바다가 육지 쪽에 그려진다.
       */
      let cur: XZ[] = [];
      for (const p of pts) {
        if (insideSea(p)) cur.push(p);
        else { if (cur.length >= 2) data.cl!.push(simplify(cur)); cur = []; }
      }
      if (cur.length >= 2) data.cl!.push(simplify(cur));
    } else if (t.highway) {
      const big = ['primary', 'secondary', 'tertiary', 'trunk'].includes(t.highway);
      for (const run of clip(pts)) data.rd.push({ p: simplify(run), w: big ? 8 : 4 });
    } else if (t.natural === 'water' || t.leisure) {
      if (!pts.some(inside)) continue;
      data.a.push({ p: simplify(pts), k: t.natural === 'water' ? 'water' : 'park' });
    }
  }

  if (data.b.length === 0 && data.rd.length === 0) {
    return NextResponse.json(
      { error: '이 학교 주변에는 지도에 그려진 것이 거의 없어요.' },
      { status: 404 }
    );
  }

  // ---------- 파일 하나로 ----------
  let url = '';
  try {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    // 자리마다 파일이 따로다. 이름에 자리를 붙여 서로 안 덮게 한다.
    const path = spot
      ? `app-assets/villages/${schoolId}-${spot.id}.json`
      : `app-assets/villages/${schoolId}.json`;
    const file = bucket.file(path);
    await file.save(JSON.stringify(data), {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    });
    await file.makePublic();
    // 다시 만들면 같은 경로를 덮는다. 마을은 하나뿐이라 옛것을 남길 이유가 없다.
    url = `https://storage.googleapis.com/${bucket.name}/${path}?v=${Date.now()}`;
  } catch (e) {
    return NextResponse.json(
      { error: `마을을 저장하지 못했어요: ${(e as Error).message.slice(0, 120)}` },
      { status: 500 }
    );
  }

  /**
   * 자리별 주소는 `spotVillages` 아래 자리 이름으로 둔다.
   * 학교 마을(`villageUrl`)은 그대로 둔다 — 집 자리를 다시 구워도
   * 예전 주소를 보던 화면이 갑자기 빈 마을이 되면 안 된다.
   */
  await db.doc(`schools/${schoolId}`).set(
    spot ? { spotVillages: { [spot.id]: url } } : { villageUrl: url },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    spotId: spot?.id ?? null,
    villageUrl: url,
    counts: {
      buildings: data.b.length,
      roads: data.rd.length,
      areas: data.a.length,
      pois: data.poi.length,
      coast: data.cl?.length ?? 0,
    },
    named: data.b.filter((b) => b.n).map((b) => b.n),
  });
}
