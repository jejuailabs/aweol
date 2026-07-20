import { NextRequest, NextResponse } from 'next/server';
import { adminDb, verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 문항 해설.
 *
 * 두 가지를 지킨다.
 * 1) **제출한 사람만** 볼 수 있다. 안 그러면 풀기 전에 해설을 열어 정답을 알아낸다.
 * 2) 한 번 만든 해설은 문항에 저장해 반 전체가 재사용한다. 25명이 각자 부르면
 *    같은 답을 25번 사는 셈이라 비용이 문항 수가 아니라 학생 수만큼 늘어난다.
 */

const MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';

function isStaff(role: string | null) {
  return role === 'teacher' || role === 'super_admin';
}

async function generate(input: {
  prompt: string;
  type: string;
  choices: string[];
  answerIndex: number | null;
  acceptable: string[];
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return '';

  const answerLine =
    input.type === 'choice' && input.answerIndex !== null
      ? `정답: ${input.answerIndex + 1}번 (${input.choices[input.answerIndex] ?? ''})`
      : input.type === 'short'
        ? `정답: ${input.acceptable.join(', ')}`
        : '이 문제는 정해진 정답이 없는 서술형입니다.';

  const choiceLines = input.choices.length
    ? `\n보기:\n${input.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : '';

  const user = [
    `문제: ${input.prompt}${choiceLines}`,
    answerLine,
    '',
    input.type === 'essay'
      ? '이 문제를 생각할 때 어떤 점을 살펴보면 좋은지 알려주세요. 모범답안을 그대로 주지는 마세요.'
      : '왜 그 답이 맞는지 설명해 주세요.',
  ].join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content:
              '너는 초등학교 선생님이야. 초등학생이 읽고 이해할 수 있게 쉬운 말로 설명해. ' +
              '3~5문장으로 짧게, 존댓말로, 다정하게 써. 어려운 한자어나 영어는 피하고, ' +
              '아이를 나무라거나 "틀렸어요" 같은 말은 쓰지 마. 필요하면 짧은 예를 하나 들어줘.',
          },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) return '';
    const json = await res.json();
    return (json.choices?.[0]?.message?.content || '').trim();
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: { schoolId?: string; classId?: string; quizId?: string; questionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, quizId, questionId } = body;
  if (!schoolId || !classId || !quizId || !questionId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc(quizId);

  // 풀기 전에 해설을 열어 정답을 알아내는 걸 막는다
  if (!isStaff(user.role)) {
    const mine = await quizRef.collection('submissions').doc(user.uid).get();
    if (!mine.exists) {
      return NextResponse.json({ error: '먼저 퀴즈를 풀어야 볼 수 있어요' }, { status: 403 });
    }
  }

  const qRef = quizRef.collection('questions').doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) return NextResponse.json({ error: '문제를 찾을 수 없습니다' }, { status: 404 });
  const q = qSnap.data() as {
    prompt: string; type: string; choices?: string[];
    explanation?: string; aiExplanation?: string;
  };

  // 선생님이 직접 적어둔 해설이 언제나 우선
  if (q.explanation) {
    return NextResponse.json({ ok: true, explanation: q.explanation, source: 'teacher' });
  }
  // 이미 만들어 둔 게 있으면 그대로 (반 전체가 같은 걸 본다)
  if (q.aiExplanation) {
    return NextResponse.json({ ok: true, explanation: q.aiExplanation, source: 'ai-cached' });
  }

  const key = await quizRef.collection('answerKeys').doc(questionId).get();
  const k = key.data() || {};

  const text = await generate({
    prompt: q.prompt,
    type: q.type,
    choices: q.choices || [],
    answerIndex: typeof k.answerIndex === 'number' ? k.answerIndex : null,
    acceptable: (k.acceptable as string[]) || [],
  });

  if (!text) {
    return NextResponse.json({ error: '설명을 만들지 못했어요. 잠시 뒤에 다시 눌러주세요' }, { status: 503 });
  }

  await qRef.set({ aiExplanation: text }, { merge: true });
  return NextResponse.json({ ok: true, explanation: text, source: 'ai' });
}
