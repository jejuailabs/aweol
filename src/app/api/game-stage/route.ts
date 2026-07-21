import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase-admin';

/**
 * 수업자료에서 게임 재료(낱말 쌍)를 뽑는다.
 *
 * **아무것도 저장하지 않는다.** 글자를 받아 AI 를 한 번 부르고 결과만 돌려준다.
 * 스테이지로 남기는 건 선생님이 확인 화면에서 눌렀을 때 화면 쪽이 한다 —
 * 여기서 바로 저장해버리면 AI 가 잘못 읽은 것이 아이에게 그대로 간다.
 *
 * 요금: 부를 때마다 돈이 든다. 그래서 (1) 글자 수를 자르고 (2) 교직원만 부를 수
 * 있게 하고 (3) 결과를 스테이지로 구워두어 다시 열 때는 안 부른다.
 */

/** 받을 글자 수 상한. 길수록 요금이 오른다. */
const MAX_INPUT = 12000;
/** 한 스테이지에 담을 낱말 쌍 수 */
const WANT_PAIRS = 10;
const MAX_LEN = 40;

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { classId?: string; text?: string; hint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const classId = String(body.classId ?? '');
  /**
   * **이 반** 담임만. 역할만 보면 남의 반 자료로 남의 반 게임을 만들 수 있다.
   * (총관리자는 통과 — 학교 전체를 돌본다)
   */
  const allowed = user.role === 'super_admin'
    || (user.role === 'teacher' && user.classIds.includes(classId));
  if (!allowed) {
    return NextResponse.json({ error: '이 반의 게임을 만들 권한이 없어요' }, { status: 403 });
  }

  const text = String(body.text ?? '').trim().slice(0, MAX_INPUT);
  if (text.length < 30) {
    return NextResponse.json(
      { error: '자료가 너무 짧아요. 내용을 조금 더 넣어주세요.' },
      { status: 400 }
    );
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI 가 준비되지 않았어요' }, { status: 503 });

  const hint = String(body.hint ?? '').trim().slice(0, 80);

  const prompt = [
    '너는 초등학교 선생님을 돕는 도우미다.',
    '아래 수업자료를 읽고 **짝맞추기 게임**에 쓸 낱말 쌍을 뽑아라.',
    hint ? `선생님 메모: ${hint}` : '',
    '',
    'JSON 만 답하라. 다른 말은 쓰지 마라. 모양:',
    '{"title":"...","pairs":[{"a":"낱말","b":"뜻"}]}',
    '',
    `- pairs 는 최대 ${WANT_PAIRS}개.`,
    '- a 는 자료에 실제로 나오는 **낱말·용어**. 문장이 아니라 낱말이어야 한다.',
    '- b 는 그 뜻을 **초등학생이 읽을 말로** 짧게. 한 문장을 넘기지 마라.',
    `- a 와 b 모두 ${MAX_LEN}자를 넘기지 마라.`,
    '- 같은 낱말을 두 번 넣지 마라.',
    '- title 은 이 자료를 한마디로 (예: "3단원 식물의 한살이"). 15자 이내.',
    '',
    '**규칙: 자료에 없는 내용을 지어내지 마라.**',
    '뽑을 낱말이 부족하면 적게 주어라. 억지로 채우지 마라.',
    '자료가 낱말 학습에 맞지 않으면 pairs 를 빈 배열로 두어라.',
    '',
    '--- 수업자료 ---',
    text,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 웹 검색이 필요 없다 — 준 자료만 읽으면 되므로 도구를 안 붙인다(더 싸고 빠르다)
        model: process.env.OPENAI_GAME_MODEL || 'gpt-4.1-mini',
        input: prompt,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `자료를 읽지 못했어요: ${String(json?.error?.message ?? '').slice(0, 120)}` },
        { status: 502 }
      );
    }

    const out: string = (json.output ?? [])
      .flatMap((o: { content?: { type?: string; text?: string }[] }) => o.content ?? [])
      .filter((c: { type?: string }) => c.type === 'output_text')
      .map((c: { text?: string }) => c.text ?? '')
      .join('\n');

    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({ error: '자료에서 낱말을 찾지 못했어요.' }, { status: 502 });
    }

    let raw: { title?: unknown; pairs?: unknown };
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ error: '자료에서 낱말을 찾지 못했어요.' }, { status: 502 });
    }

    /**
     * AI 가 준 것을 그대로 믿지 않는다.
     * 길이·중복·빈 값을 여기서 다시 거른다 — 화면 쪽에도 검사가 있지만,
     * 서버가 통과시킨 것은 서버가 책임져야 한다.
     */
    const seen = new Set<string>();
    const pairs: { a: string; b: string }[] = [];
    for (const p of Array.isArray(raw.pairs) ? raw.pairs : []) {
      if (pairs.length >= WANT_PAIRS) break;
      const a = typeof (p as { a?: unknown })?.a === 'string' ? (p as { a: string }).a.trim() : '';
      const b = typeof (p as { b?: unknown })?.b === 'string' ? (p as { b: string }).b.trim() : '';
      if (!a || !b) continue;
      if (a.length > MAX_LEN || b.length > MAX_LEN) continue;
      if (seen.has(a)) continue;
      seen.add(a);
      pairs.push({ a, b });
    }

    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 15) : '';

    if (pairs.length < 2) {
      return NextResponse.json(
        { error: '이 자료에서는 낱말을 충분히 찾지 못했어요. 직접 적거나 다른 자료를 넣어주세요.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ title, pairs });
  } catch {
    return NextResponse.json({ error: '자료를 읽지 못했어요. 잠시 뒤 다시 해주세요.' }, { status: 502 });
  }
}
