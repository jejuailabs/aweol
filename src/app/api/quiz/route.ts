import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { adminDb, getClientIp, verifyRequestUser, isStaffOfSchool, isTeacherOfClass } from '@/lib/firebase-admin';
import { getShopItem, STAMP_PER_HOMEWORK } from '@/lib/shop-catalog';
import { storagePathFromUrl } from '@/lib/storage-path';
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

type Prepared = {
  question: Record<string, unknown>;
  answer: { answerIndex: number | null; acceptable: string[] };
};

/**
 * 문항을 전부 검사해 저장 형태로 바꾼다.
 * 하나라도 잘못되면 문자열(에러 메시지)을 돌려주고, 호출부는 통째로 거부한다.
 * 반쯤 만들어진 퀴즈가 남으면 아이 화면이 깨진다.
 */
function prepareQuestions(incoming: IncomingQuestion[]): Prepared[] | string {
  const prepared: Prepared[] = [];

  for (let i = 0; i < incoming.length; i++) {
    const q = incoming[i];
    const no = i + 1;
    const type = q.type === 'choice' || q.type === 'short' || q.type === 'essay' ? q.type : null;
    if (!type) return `${no}번 문제 유형이 잘못됐어요`;

    const prompt = str(q.prompt, MAX_PROMPT);
    if (!prompt) return `${no}번 문제의 지문이 비었어요`;

    const youtubeId = q.media === 'youtube' ? parseYoutubeId(str(q.youtube, 200)) : '';
    if (q.media === 'youtube' && !youtubeId) return `${no}번 문제의 유튜브 주소를 알아볼 수 없어요`;
    const imageUrl = q.media === 'image' ? str(q.imageUrl, 1000) : '';
    if (q.media === 'image' && !imageUrl) return `${no}번 문제의 사진이 없어요`;
    const media = youtubeId ? 'youtube' : imageUrl ? 'image' : 'none';

    let choices: string[] = [];
    let answerIndex: number | null = null;
    let acceptable: string[] = [];

    if (type === 'choice') {
      choices = (Array.isArray(q.choices) ? q.choices : [])
        .map((c) => str(c, 200))
        .filter(Boolean)
        .slice(0, MAX_CHOICES);
      if (choices.length < 2) return `${no}번 문제의 보기를 2개 이상 넣어주세요`;
      const idx = typeof q.answerIndex === 'number' ? q.answerIndex : -1;
      if (idx < 0 || idx >= choices.length) return `${no}번 문제의 정답을 골라주세요`;
      answerIndex = idx;
    }

    if (type === 'short') {
      acceptable = (Array.isArray(q.acceptable) ? q.acceptable : [])
        .map((a) => str(a, 100))
        .filter(Boolean)
        .slice(0, 10);
      if (acceptable.length === 0) return `${no}번 문제의 정답을 적어주세요`;
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
  return prepared;
}

/** 교사: 퀴즈 출제 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
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
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '담당하는 반이 아닙니다' }, { status: 403 });
  }

  const title = str(body.title, 100);
  if (!title) return NextResponse.json({ error: '제목을 넣어주세요' }, { status: 400 });

  const incoming = Array.isArray(body.questions) ? body.questions : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: '문제를 하나 이상 넣어주세요' }, { status: 400 });
  }
  if (incoming.length > MAX_QUESTIONS) {
    return NextResponse.json({ error: `문제는 ${MAX_QUESTIONS}개까지예요` }, { status: 400 });
  }

  const prepared = prepareQuestions(incoming);
  if (typeof prepared === 'string') {
    return NextResponse.json({ error: prepared }, { status: 400 });
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
  if (!isStaffOfSchool(user, schoolId) && !user.classIds.includes(classId)) {
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
    // 서술형처럼 채점이 안 되는 답에 선생님이 남기는 반응 (문항 id → { comment, stamp })
    feedback: {},
    checked: false,
    checkedAt: null,
    stamp: null,
    awarded: false,
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

/**
 * 교사: 퀴즈 수정 / 답안에 도장·코멘트.
 *
 * - action 'edit'  : 제목·설명·공개범위, 필요하면 문항까지 통째로 교체한다.
 * - action 'grade' : 채점이 안 되는 서술형 답에 선생님이 반응해 준다.
 *                    숙제와 같은 방식 — 검사완료하면 아이에게 도장 1개.
 */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  let body: {
    action?: string;
    schoolId?: string; classId?: string; quizId?: string;
    title?: string; description?: string; visibility?: string;
    questions?: IncomingQuestion[]; force?: boolean;
    studentUid?: string; questionId?: string; comment?: string;
    check?: boolean; stampId?: string;
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
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '담당하는 반이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc(quizId);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) return NextResponse.json({ error: '퀴즈를 찾을 수 없습니다' }, { status: 404 });

  // ---------- 퀴즈 수정 ----------
  if (body.action === 'edit') {
    const meta: Record<string, unknown> = {};
    const title = str(body.title, 100);
    if (title) meta.title = title;
    if (typeof body.description === 'string') meta.description = str(body.description, 1000);
    if (body.visibility === 'class' || body.visibility === 'teacher') meta.visibility = body.visibility;

    const incoming = Array.isArray(body.questions) ? body.questions : null;

    // 문항을 안 건드리면 제목·설명만 고치고 끝 (제출물에 영향이 없다)
    if (!incoming) {
      if (Object.keys(meta).length === 0) {
        return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
      }
      await quizRef.set(meta, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (incoming.length === 0) {
      return NextResponse.json({ error: '문제를 하나 이상 넣어주세요' }, { status: 400 });
    }
    if (incoming.length > MAX_QUESTIONS) {
      return NextResponse.json({ error: `문제는 ${MAX_QUESTIONS}개까지예요` }, { status: 400 });
    }

    const prepared = prepareQuestions(incoming);
    if (typeof prepared === 'string') {
      return NextResponse.json({ error: prepared }, { status: 400 });
    }

    // 이미 푼 아이가 있는데 문제를 바꾸면 그 답은 사라진 문제에 대한 답이 된다.
    // 조용히 지우지 않고 한 번 물어본다.
    const subs = await quizRef.collection('submissions').get();
    if (subs.size > 0 && body.force !== true) {
      return NextResponse.json(
        {
          error: `이미 ${subs.size}명이 풀었어요. 문제를 바꾸면 그 답안은 지워져요.`,
          needsConfirm: true,
          submissionCount: subs.size,
        },
        { status: 409 }
      );
    }

    const [oldQ, oldK] = await Promise.all([
      quizRef.collection('questions').get(),
      quizRef.collection('answerKeys').get(),
    ]);

    const batch = db.batch();
    oldQ.docs.forEach((d) => batch.delete(d.ref));
    oldK.docs.forEach((d) => batch.delete(d.ref));
    subs.docs.forEach((d) => batch.delete(d.ref));
    batch.set(quizRef, { ...meta, questionCount: prepared.length }, { merge: true });
    prepared.forEach((p, i) => {
      const qId = `q${String(i).padStart(2, '0')}`;
      batch.set(quizRef.collection('questions').doc(qId), p.question);
      batch.set(quizRef.collection('answerKeys').doc(qId), p.answer);
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      questionCount: prepared.length,
      clearedSubmissions: subs.size,
    });
  }

  // ---------- 답안에 도장·코멘트 ----------
  if (body.action === 'grade') {
    const studentUid = body.studentUid || '';
    if (!studentUid) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

    const subRef = quizRef.collection('submissions').doc(studentUid);
    const subSnap = await subRef.get();
    // 없는 제출물에 merge 하면 유령 문서가 생겨 현황판 집계가 틀어진다
    if (!subSnap.exists) {
      return NextResponse.json({ error: '제출물을 찾을 수 없습니다' }, { status: 404 });
    }

    const patchDoc: Record<string, unknown> = {};

    // 문항별 코멘트는 answers 배열 원소를 고치는 대신 map 에 따로 쌓는다.
    // 배열을 읽고-고쳐-쓰면 두 문항을 동시에 채점할 때 한쪽이 덮인다.
    if (typeof body.comment === 'string' && body.questionId) {
      patchDoc[`feedback.${body.questionId}.comment`] = body.comment.trim().slice(0, 500);
    }

    let stamp: { itemId: string; emoji: string; label: string } | null = null;
    if (typeof body.stampId === 'string' && body.stampId) {
      const item = getShopItem(body.stampId);
      if (!item || item.category !== 'stamp') {
        return NextResponse.json({ error: '없는 도장이에요' }, { status: 404 });
      }
      const owned = await db
        .collection('users').doc(user.uid)
        .collection('inventory').doc(item.id).get();
      if (!owned.exists) {
        return NextResponse.json({ error: '가지고 있지 않은 도장이에요' }, { status: 403 });
      }
      stamp = { itemId: item.id, emoji: item.emoji, label: item.label };
    }

    if (typeof body.check === 'boolean') {
      patchDoc.checked = body.check;
      patchDoc.checkedAt = body.check ? FieldValue.serverTimestamp() : null;
      if (body.check && stamp) patchDoc.stamp = stamp;
      if (!body.check) patchDoc.stamp = null;
    } else if (stamp && body.questionId) {
      // 문항 하나에만 도장을 찍는 경우
      patchDoc[`feedback.${body.questionId}.stamp`] = stamp;
    }

    if (Object.keys(patchDoc).length === 0) {
      return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
    }

    await subRef.update(patchDoc);

    // 검사완료 첫 순간에만 도장을 준다. 재검사로 두 번 주지 않는다.
    let awarded = 0;
    if (body.check === true && subSnap.data()?.awarded !== true) {
      const studentRef = db.collection('users').doc(studentUid);
      try {
        await db.runTransaction(async (tx) => {
          const u = await tx.get(studentRef);
          if (!u.exists) throw new Error('NO_USER');
          const after = ((u.data()?.stamps as number) ?? 0) + STAMP_PER_HOMEWORK;
          tx.set(studentRef, { stamps: after }, { merge: true });
          tx.set(studentRef.collection('stampLedger').doc(), {
            amount: STAMP_PER_HOMEWORK,
            reason: `퀴즈 검사 — ${(quizSnap.data()?.title as string) || quizId}`,
            refId: quizId,
            byName: user.displayName,
            balanceAfter: after,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(subRef, { awarded: true }, { merge: true });
        });
        awarded = STAMP_PER_HOMEWORK;
      } catch {
        // 지급에 실패해도 검사완료 자체는 유지한다 (선생님 손을 다시 빌리지 않는다)
        awarded = 0;
      }
    }

    return NextResponse.json({ ok: true, awarded });
  }

  return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
}

/** 교사: 퀴즈 삭제 */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('schoolId') || '';
  const classId = searchParams.get('classId') || '';
  const quizId = searchParams.get('quizId') || '';
  if (!schoolId || !classId || !quizId) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }
  if (!isTeacherOfClass(user, schoolId, classId)) {
    return NextResponse.json({ error: '담당하는 반이 아닙니다' }, { status: 403 });
  }

  const db = adminDb();
  const quizRef = db
    .collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('quizzes').doc(quizId);

  // 문항에 붙은 사진도 함께 지운다. 문서만 지우면 Storage 에 그림만 남아 요금이 샌다.
  const qSnap = await quizRef.collection('questions').get();
  await Promise.all(
    qSnap.docs.map(async (d) => {
      const path = storagePathFromUrl((d.data().imageUrl as string) || '');
      if (!path) return;
      // 퀴즈가 올린 것만 (공용 이미지는 건드리지 않는다)
      if (!path.startsWith('quiz/')) return;
      await getStorage()
        .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
        .file(path)
        .delete()
        .catch(() => {});
    })
  );

  for (const sub of ['questions', 'answerKeys', 'submissions']) {
    const snap = await quizRef.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await quizRef.delete();

  return NextResponse.json({ ok: true });
}
