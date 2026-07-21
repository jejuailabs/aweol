import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, isStaffOfSchool, verifyRequestUser } from '@/lib/firebase-admin';

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

/** 학교를 중심으로 이만큼 (미터) */
const RADIUS = 400;
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
  b: { p: XZ[]; h: number; n?: string }[];
  /** 길: 폴리라인 + 폭 */
  rd: { p: XZ[]; w: number }[];
  /** 물·공원 */
  a: { p: XZ[]; k: 'water' | 'park' }[];
  /** 시설 표시 */
  poi: { x: number; z: number; k: string; n?: string }[];
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string };
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
  const lat = Number(school.lat);
  const lng = Number(school.lng);
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
  way["leisure"](around:${RADIUS},${lat},${lng});
  node["amenity"](around:${RADIUS},${lat},${lng});
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

  const data: VillageData = { c: [lat, lng], r: RADIUS, b: [], rd: [], a: [], poi: [] };

  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      if (t.amenity && e.lat != null && e.lon != null) {
        const [x, z] = toXZ(e.lat, e.lon);
        if (inside([x, z])) data.poi.push({ x, z, k: t.amenity, ...(t.name ? { n: t.name } : {}) });
      }
      continue;
    }
    if (!e.geometry?.length) continue;
    const pts = e.geometry.map((g) => toXZ(g.lat, g.lon));

    if (t.building) {
      if (!pts.some(inside)) continue;
      const levels = Number(t['building:levels']);
      data.b.push({
        p: simplify(pts),
        h: Number.isFinite(levels) && levels > 0 ? Math.min(30, levels * 3) : 6,
        ...(t.name ? { n: t.name } : {}),
      });
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
    const path = `app-assets/villages/${schoolId}.json`;
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

  await db.doc(`schools/${schoolId}`).set({ villageUrl: url }, { merge: true });

  return NextResponse.json({
    ok: true,
    villageUrl: url,
    counts: {
      buildings: data.b.length,
      roads: data.rd.length,
      areas: data.a.length,
      pois: data.poi.length,
    },
    named: data.b.filter((b) => b.n).map((b) => b.n),
  });
}
