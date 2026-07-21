import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 오늘의 급식 (NEIS 학교급식식단정보).
 *
 * **급식은 전 학년이 같다.** 그래서 반 알림판이 아니라 학교 현관에 붙인다.
 *
 * NEIS 는 하루에 한 번만 부른다. 아이가 현관에 들어올 때마다 부르면
 * 사람 수만큼 남의 서버를 두드리는 셈이고, 급식표는 하루에 한 번 바뀌면 그만이다.
 * 받아온 것은 학교 문서에 그대로 얹어두고 날짜가 같으면 다시 안 부른다.
 */

/** 이 코드가 있어야 급식을 받아올 수 있다 */
interface NeisIds {
  office: string;   // 시도교육청코드 (제주 T10)
  school: string;   // 표준학교코드
}

function todayYmd(): string {
  // 급식은 한국 날짜 기준이다. 서버가 어디 있든 KST 로 계산한다.
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

/** 학교 이름으로 NEIS 코드를 찾는다 (학교당 한 번) */
async function findNeisIds(name: string): Promise<NeisIds | null> {
  const url =
    'https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=5&SCHUL_NM=' +
    encodeURIComponent(name);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'aewol-school-exhibition/1.0' } });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const info = j.schoolInfo as [unknown, { row?: Record<string, string>[] }] | undefined;
    const row = info?.[1]?.row?.[0];
    if (!row?.SD_SCHUL_CODE || !row?.ATPT_OFCDC_SC_CODE) return null;
    return { office: row.ATPT_OFCDC_SC_CODE, school: row.SD_SCHUL_CODE };
  } catch {
    return null;
  }
}

/** 급식 한 끼를 읽기 좋은 줄로 */
function cleanDishes(raw: string): string[] {
  return raw
    .split('<br/>')
    .map((s) =>
      s
        // 알레르기 번호와 * 표시는 아이가 읽을 것이 아니다
        .replace(/\([0-9.,\s]*\)/g, '')
        .replace(/[*]/g, '')
        .trim()
    )
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const schoolId = (req.nextUrl.searchParams.get('schoolId') || '').trim();
  if (!schoolId) return NextResponse.json({ error: '학교가 필요합니다' }, { status: 400 });

  const db = adminDb();
  const ref = db.doc(`schools/${schoolId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: '학교를 찾을 수 없습니다' }, { status: 404 });

  const school = snap.data() as {
    name?: string;
    neis?: NeisIds;
    meal?: { date: string; dishes: string[]; kcal: string };
  };
  const ymd = todayYmd();

  // 오늘 것을 이미 받아뒀으면 그대로 준다 (NEIS 를 다시 안 부른다)
  if (school.meal?.date === ymd) {
    return NextResponse.json({ ...school.meal, cached: true });
  }

  let ids = school.neis;
  if (!ids?.school) {
    const found = await findNeisIds(school.name || schoolId);
    if (!found) {
      return NextResponse.json(
        { error: '학교를 급식 정보에서 찾지 못했어요. 학교 이름을 확인해 주세요.', date: ymd, dishes: [] },
        { status: 404 }
      );
    }
    ids = found;
    await ref.set({ neis: ids }, { merge: true });
  }

  const url =
    'https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=5' +
    `&ATPT_OFCDC_SC_CODE=${ids.office}&SD_SCHUL_CODE=${ids.school}&MLSV_YMD=${ymd}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'aewol-school-exhibition/1.0' } });
    const j = (await res.json()) as Record<string, unknown>;
    const info = j.mealServiceDietInfo as [unknown, { row?: Record<string, string>[] }] | undefined;
    // 중식이 없으면(방학·주말) 빈 것으로 저장한다 — 그래야 하루 종일 다시 안 부른다
    const row = info?.[1]?.row?.find((r) => r.MMEAL_SC_NM === '중식') ?? info?.[1]?.row?.[0];

    const meal = {
      date: ymd,
      dishes: row?.DDISH_NM ? cleanDishes(row.DDISH_NM) : [],
      kcal: row?.CAL_INFO ?? '',
    };
    await ref.set({ meal }, { merge: true });
    return NextResponse.json({ ...meal, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 120), date: ymd, dishes: [] },
      { status: 502 }
    );
  }
}
