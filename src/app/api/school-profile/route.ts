import { NextRequest, NextResponse } from 'next/server';
import { isStaffOfSchool, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 학교 조사 — 이 학교 선생님과 총관리자.
 *
 * 학교 만들기 화면에서는 아직 학교가 없으니 schoolId 가 없다.
 * 그때는 총관리자만 부를 수 있다.
 *
 * **여기서 찾을 수 있는 것과 없는 것이 갈린다** (실측):
 * - 개교연도, 소재지, 공립/사립 → 부동산·학교정보 사이트에 있어서 잘 찾는다.
 * - 교훈·교화(꽃)·교목(나무) → 학교 공식 홈페이지에만 있는데, 초등학교 홈페이지는
 *   대부분 프레임/자바스크립트라 검색 도구가 본문을 못 읽는다. 거의 못 찾는다.
 *
 * 그래서 **못 찾은 항목은 빈 칸으로 돌려준다.** 남의 학교 교화를 그럴듯하게
 * 지어내면 그 학교 아이들이 틀린 정보를 자기 학교 것으로 배우게 된다.
 * 빈 칸은 학교가 직접 채운다.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI 키가 설정되지 않았습니다' }, { status: 500 });

  let body: { name?: string; address?: string; schoolId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const schoolId = (body.schoolId || '').trim();
  const allowed = schoolId ? isStaffOfSchool(user, schoolId) : user.role === 'super_admin';
  if (!allowed) {
    return NextResponse.json({ error: '이 학교의 선생님만 사용할 수 있습니다' }, { status: 403 });
  }

  const name = (body.name || '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: '학교 이름이 필요합니다' }, { status: 400 });
  const address = (body.address || '').trim().slice(0, 80);

  const prompt = [
    `대한민국 초등학교 "${name}"${address ? ` (${address})` : ''} 를 웹에서 조사한다.`,
    '학교 공식 홈페이지, 학교알리미(schoolinfo.go.kr), 나무위키, 뉴스, 지역 소개 자료를 찾아본다.',
    '',
    '**검색을 여러 번 해도 된다.** 한 번 찾아보고 없다고 끝내지 말고,',
    '학교 이름·지역명·"개교"·"교화"·"교목" 을 바꿔가며 여러 번 찾아봐라.',
    '',
    '찾아본 뒤 마지막에 아래 JSON 을 한 번만 출력한다.',
    '{"founded":"","motto":"","flower":"","tree":"","note":"","sources":[]}',
    '',
    '- founded: 개교 연도. 숫자 4자리만 (예: "1923").',
    '- motto: 교훈.',
    '- flower: 교화(상징 꽃) 이름만 (예: "동백꽃").',
    '- tree: 교목(상징 나무) 이름만 (예: "팽나무").',
    '- note: 이 학교만의 특징 한두 문장. 초등학생이 읽을 말투로.',
    '- sources: 실제로 근거를 본 주소만. 열어봤지만 내용이 없던 주소는 빼라.',
    '',
    '**규칙: 근거를 찾지 못한 항목은 빈 문자열 "" 로 둔다.**',
    '그럴듯하게 추측해서 채우지 마라. 다른 학교 정보를 가져다 쓰지 마라.',
    '비어 있는 편이 틀린 것보다 낫다.',
  ].join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_SEARCH_MODEL || 'gpt-4.1',
        tools: [{ type: 'web_search' }],
        input: prompt,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `조사 실패: ${JSON.stringify(json?.error?.message ?? json).slice(0, 160)}` },
        { status: 502 }
      );
    }

    // Responses API 는 웹 검색 호출과 답변이 output 배열에 섞여 온다
    const text: string = (json.output ?? [])
      .flatMap((o: { content?: { type?: string; text?: string }[] }) => o.content ?? [])
      .filter((c: { type?: string }) => c.type === 'output_text')
      .map((c: { text?: string }) => c.text ?? '')
      .join('\n');

    // 서술 뒤에 JSON 이 붙어 오므로 **마지막** 중괄호 덩어리를 집는다
    const m = text.match(/\{[^{}]*"sources"[\s\S]*?\}\s*\}?\s*$/) ?? text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({ error: '조사 결과를 읽지 못했어요. 직접 적어주세요.' }, { status: 502 });
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ error: '조사 결과를 읽지 못했어요. 직접 적어주세요.' }, { status: 502 });
    }

    // null·"모름"·"확인 불가" 같은 답을 전부 빈 칸으로 눕힌다
    const clean = (v: unknown, max: number) => {
      const t = typeof v === 'string' ? v.trim() : '';
      if (!t || /^(null|없음|미상|모름|알\s*수\s*없|확인\s*(안|불))/i.test(t)) return '';
      return t.slice(0, max);
    };

    const profile = {
      founded: clean(raw.founded, 4).replace(/[^0-9]/g, '').slice(0, 4),
      motto: clean(raw.motto, 60),
      flower: clean(raw.flower, 20),
      tree: clean(raw.tree, 20),
      note: clean(raw.note, 200),
      sources: Array.isArray(raw.sources)
        ? raw.sources.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 5)
        : [],
    };

    const missing = (['founded', 'motto', 'flower', 'tree'] as const).filter((k) => !profile[k]);
    return NextResponse.json({ profile, missing });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 160) }, { status: 500 });
  }
}
