import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getClientIp, verifyRequestUser } from '@/lib/firebase-admin';
import {
  isShortAnswerCorrect, parseYoutubeId,
  MAX_QUESTIONS, MAX_CHOICES, MAX_PROMPT, MAX_ANSWER_TEXT,
} from '@/lib/quiz-utils';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 퀴즈 출제와 제출.
 *
 * 핵심은 **정답이 클라이언트로 내려가지 않는 것**이다.
 * 문항(questions)과 정답(answerKeys)을 다른 컬렉션에 나눠 두고, 규칙에서 answerKeys 는
 * 교직원만 읽게 막았다. 채점도 여기서 한다 — 클라이언트가 채점하면 정답을 알아야 하니까.
 */

function isStaff(role: string | null) {
  return role === 'teacher' || role === 'super_admin';
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

interface IncomingQuestion {
  type?: string;
  prompt?: string;
  media?: string;
  imageUrl?: string;
  youtube?: string;
  choices?: unknown;
  answerIndex?: unknown;
  acceptable?: unknown;
  explanation?: string;
}

/** 교사: 퀴즈 출제 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isStaff(user.role)) {
    return NextResponse.json({ error: '선생님만 낼 수 있습니다' }, { status: 403 });
  }

  let body: {
    schoolId?: string; classId?: string;
    title?: string; description?: string; visibility?: string;
    questions?: IncomingQuestion[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId } = body;
  if (!schoolId || !classId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const title = str(body.title, 100);
  if (!title) return NextResponse.json({ error: '제목을 넣어주세요' }, { status: 400 });

  const incoming = Array.isArray(body.questions) ? body.questions : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: '문제를 하나 이상 넣어주세요' }, { status: 400 });
  }
  if (incoming.length > MAX_QUESTIONS) {
    return NextResponse.json({ error: `문제는 ${MAX_QUESTIONS}개까지예요` }, { status: 400 });
  }

  // 저장하기 전에 전부 검사한다. 반쯤 만들어진 퀴즈가 남으면 아이 화면이 깨진다.
  const prepared: {
    question: Record<string, unknown>;
    answer: { answerIndex: number | null; acceptable: string[] };
  }[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const q = incoming[i];
    const no = i + 1;
    const type = q.type === 'choice' || q.type === 'short' || q.type === 'essay' ? q.type : null;
    if (!type) return NextResponse.json({ error: `${no}번 문제 유형이 잘못됐어요` }, { status: 400 });

    const prompt = str(q.prompt, MAX_PROMPT);
    if (!prompt) return NextResponse.json({ error: `${no}번 문제의 지문이 비었어요` }, { status: 400 });

    const youtubeId = q.media === 'youtube' ? parseYoutubeId(str(q.youtube, 200)) : '';
    if (q.media === 'youtube' && !youtubeId) {
      return NextResponse.json({ error: `${no}번 문제의 유튜브 주소를 알아볼 수 없어요` }, { status: 400 });
    }
    const imageUrl = q.media === 'image' ? str(q.imageUrl, 1000) : '';
    if (q.media === 'image' && !imageUrl) {
      return NextResponse.json({ error: `${no}번 문제의 사진이 없어요` }, { status: 400 });
    }
    const media = youtubeId ? 'youtube' : imageUrl ? 'image' : 'none';

    let choices: string[] = [];
    let answerIndex: number | null = null;
    let acceptable: string[] = [];

    if (type === 'choice') {
      choices = (Array.isArray(q.choices) ? q.choices : [])
        .map((c) => str(c, 200))
        .filter(Boolean)
        .slice(0, MAX_CHOICES);
      if (choices.length < 2) {
        return NextResponse.json({ error: `${no}번 문제의 보기를 2개 이상 넣어주세요` }, { status: 400 });
      }
      const idx = typeof q.answerIndex === 'number' ? q.answerIndex : -1;
      if (idx < 0 || idx >= choices.length) {
        return NextResponse.json({ error: `${no}번 문제의 정답을 골라주세요` }, { status: 400 });
      }
      answerIndex = idx;
    }

    if (type === 'short') {
      acceptable = (Array.isArray(q.acceptable) ? q.acceptable : [])
        .map((a) => str(a, 100))
        .filter(Boolean)
        .slice(0, 10);
      if (acceptable.length === 0) {
        return NextResponse.json({ error: `${no}번 문제의 정답을 적어주세요` }, { status: 400 });
      }
    }

    prepared.push({
      question: {
        order: i,
        type,
        prompt,
        media,
        imageUrl,
        youtubeId,
        choices,
        explanation: str(q.explanation, 1000),
        aiExplanation: '',
      },
      answer: { answerIndex, acceptable },
    });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc();

  const batch = db.batch();
  batch.set(quizRef, {
    title,
    description: str(body.description, 1000),
    visibility: body.visibility === 'teacher' ? 'teacher' : 'class',
    questionCount: prepared.length,
    authorUid: user.uid,
    authorName: user.displayName,
    createdAt: FieldValue.serverTimestamp(),
  });
  prepared.forEach((p, i) => {
    const qId = `q${String(i).padStart(2, '0')}`;
    batch.set(quizRef.collection('questions').doc(qId), p.question);
    batch.set(quizRef.collection('answerKeys').doc(qId), p.answer);
  });
  await batch.commit();

  return NextResponse.json({ ok: true, quizId: quizRef.id, questionCount: prepared.length });
}

/** 학생: 퀴즈 제출 (채점은 여기서) */
export async function PUT(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!user.role) return NextResponse.json({ error: '역할이 지정되지 않았습니다' }, { status: 403 });

  let body: {
    schoolId?: string; classId?: string; quizId?: string;
    answers?: { questionId?: string; choiceIndex?: unknown; text?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const { schoolId, classId, quizId } = body;
  if (!schoolId || !classId || !quizId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  if (!isStaff(user.role) && !user.classIds.includes(classId)) {
    return NextResponse.json({ error: '이 반의 퀴즈가 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc(quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) return NextResponse.json({ error: '퀴즈를 찾을 수 없습니다' }, { status: 404 });
  const quiz = quizSnap.data() as { visibility: string };

  const [qSnap, kSnap] = await Promise.all([
    quizRef.collection('questions').get(),
    quizRef.collection('answerKeys').get(),
  ]);
  const questions = new Map(qSnap.docs.map((d) => [d.id, d.data()]));
  const keys = new Map(kSnap.docs.map((d) => [d.id, d.data()]));

  const given = new Map(
    (Array.isArray(body.answers) ? body.answers : [])
      .filter((a) => typeof a.questionId === 'string')
      .map((a) => [a.questionId as string, a])
  );

  const answers: {
    questionId: string; type: string; choiceIndex: number | null; text: string; correct: boolean | null;
  }[] = [];
  let correctCount = 0;
  let gradedCount = 0;

  // 안 푼 문제도 빈 답으로 남긴다. 그래야 교사 화면에서 "안 풀었음"이 드러난다.
  for (const [qId, q] of [...questions.entries()].sort(
    (a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)
  )) {
    const a = given.get(qId);
    const type = q.type as string;
    const key = keys.get(qId) || {};

    let choiceIndex: number | null = null;
    let text = '';
    let correct: boolean | null = null;

    if (type === 'choice') {
      choiceIndex = typeof a?.choiceIndex === 'number' ? a.choiceIndex : null;
      correct = choiceIndex !== null && choiceIndex === key.answerIndex;
      gradedCount++;
      if (correct) correctCount++;
    } else if (type === 'short') {
      text = typeof a?.text === 'string' ? a.text.trim().slice(0, 200) : '';
      correct = isShortAnswerCorrect(text, (key.acceptable as string[]) || []);
      gradedCount++;
      if (correct) correctCount++;
    } else {
      // 서술형은 채점하지 않는다. 초등학생 글을 기계가 맞다/틀리다 하면 안 된다.
      text = typeof a?.text === 'string' ? a.text.trim().slice(0, MAX_ANSWER_TEXT) : '';
      correct = null;
    }

    answers.push({ questionId: qId, type, choiceIndex, text, correct });
  }

  await quizRef.collection('submissions').doc(user.uid).set({
    studentUid: user.uid,
    studentName: user.displayName,
    answers,
    correctCount,
    gradedCount,
    publicToClass: quiz.visibility === 'class',
    submittedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('accessLogs').add({
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
    action: '퀴즈 제출',
    classId,
    detail: quizId,
    ip: getClientIp(req.headers),
    userAgent: req.headers.get('user-agent') || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
  });

  // 아이에게 점수를 보여주지는 않지만, 문항별 정오는 알려줘야 해설을 볼 수 있다
  return NextResponse.json({
    ok: true,
    results: answers.map((a) => ({ questionId: a.questionId, correct: a.correct })),
  });
}

/** 교사: 퀴즈 삭제 */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isStaff(user.role)) {
    return NextResponse.json({ error: '선생님만 지울 수 있습니다' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId') || '';
  const classId = searchParams.get('classId') || '';
  const quizId = searchParams.get('quizId') || '';
  if (!schoolId || !classId || !quizId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc(quizId);

  for (const sub of ['questions', 'answerKeys', 'submissions']) {
    const snap = await quizRef.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await quizRef.delete();

  return NextResponse.json({ ok: true });
}
