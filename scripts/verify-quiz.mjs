// 퀴즈 검증: 정답 유출 차단, 서버 채점, 해설 선(先)열람 차단, 권한
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
const CLASS = '3-1';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
initAdmin({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});
const adb = getAdminDb();

const clientApp = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const cauth = getAuth(clientApp);
const cdb = getFirestore(clientApp);

let failed = 0;
const ok = (n, c, extra = '') => { console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!c) failed++; };

const STU = 'zz-quiz-student';
const TEA = 'zz-quiz-teacher';

for (const [uid, name, role] of [[STU, '퀴즈검증학생', 'student'], [TEA, '퀴즈검증교사', 'teacher']]) {
  await adb.collection('users').doc(uid).set({
    displayName: name, role, pendingRole: null, classIds: [CLASS], children: [],
    stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: null,
    preferences: { theme: 'light' },
  });
}

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const quiz = (method, token, body) =>
  fetch(`${BASE}/api/quiz`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const explain = (token, body) =>
  fetch(`${BASE}/api/quiz-explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const stuToken = await tokenFor(STU);
const teaToken = await tokenFor(TEA);

console.log('[출제 권한]');
let r = await quiz('POST', stuToken, {
  schoolId: SCHOOL, classId: CLASS, title: '학생이 낸 퀴즈',
  questions: [{ type: 'choice', prompt: 'x', choices: ['a', 'b'], answerIndex: 0 }],
});
ok('학생은 출제 못 함', r.status === 403, `HTTP ${r.status}`);

r = await quiz('POST', teaToken, {
  schoolId: SCHOOL, classId: CLASS, title: '검증용 퀴즈', visibility: 'class',
  questions: [
    { type: 'choice', prompt: '2 + 3 은?', choices: ['4', '5', '6'], answerIndex: 1 },
    { type: 'short', prompt: '무지개는 몇 색?', acceptable: ['7가지', '일곱', '7'] },
    { type: 'essay', prompt: '가장 좋아하는 계절과 그 이유를 써보세요.' },
    { type: 'choice', prompt: '영상 속 동물은?', media: 'youtube',
      youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', choices: ['고양이', '강아지'], answerIndex: 0 },
  ],
});
let j = await r.json();
ok('교사 출제 성공', r.ok, `HTTP ${r.status}`);
const QUIZ = j.quizId;
ok('문항 수 기록됨', j.questionCount === 4, `${j.questionCount}개`);

const quizRef = adb.doc(`schools/${SCHOOL}/classes/${CLASS}/quizzes/${QUIZ}`);
const ytDoc = (await quizRef.collection('questions').doc('q03').get()).data();
ok('유튜브 주소에서 id만 저장됨', ytDoc?.youtubeId === 'dQw4w9WgXcQ', ytDoc?.youtubeId);

console.log('\n[출제 검증]');
r = await quiz('POST', teaToken, {
  schoolId: SCHOOL, classId: CLASS, title: '정답 없는 객관식',
  questions: [{ type: 'choice', prompt: 'x', choices: ['a', 'b'] }],
});
ok('객관식 정답 없으면 거부', r.status === 400, `HTTP ${r.status}`);

r = await quiz('POST', teaToken, {
  schoolId: SCHOOL, classId: CLASS, title: '이상한 유튜브',
  questions: [{ type: 'choice', prompt: 'x', media: 'youtube', youtube: 'https://example.com/nope', choices: ['a', 'b'], answerIndex: 0 }],
});
ok('알 수 없는 유튜브 주소 거부', r.status === 400, `HTTP ${r.status}`);

const before = (await adb.collection(`schools/${SCHOOL}/classes/${CLASS}/quizzes`).get()).size;
r = await quiz('POST', teaToken, {
  schoolId: SCHOOL, classId: CLASS, title: '반쯤 잘못된 퀴즈',
  questions: [
    { type: 'choice', prompt: '괜찮은 문제', choices: ['a', 'b'], answerIndex: 0 },
    { type: 'short', prompt: '정답 안 적은 문제' },
  ],
});
const after = (await adb.collection(`schools/${SCHOOL}/classes/${CLASS}/quizzes`).get()).size;
ok('하나라도 잘못되면 통째로 거부 (반쪽 퀴즈 방지)', r.status === 400 && before === after, `HTTP ${r.status}, ${before}→${after}`);

console.log('\n[정답 유출 차단]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
const qDocs = await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/quizzes/${QUIZ}/questions`));
ok('학생도 문항은 읽을 수 있음', qDocs.size === 4, `${qDocs.size}개`);
const leaked = qDocs.docs.some((d) => {
  const v = d.data();
  return 'answerIndex' in v || 'acceptable' in v;
});
ok('문항 문서에 정답 필드가 없음', !leaked);

try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/quizzes/${QUIZ}/answerKeys`));
  ok('학생은 정답지 못 읽음', false, '통과되면 안 됨');
} catch { ok('학생은 정답지 못 읽음', true); }

try {
  await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/quizzes/${QUIZ}/answerKeys/q00`));
  ok('정답지 단건 조회도 차단', false, '통과되면 안 됨');
} catch { ok('정답지 단건 조회도 차단', true); }

console.log('\n[풀기 전 해설 차단]');
await signOut(cauth);
r = await explain(stuToken, { schoolId: SCHOOL, classId: CLASS, quizId: QUIZ, questionId: 'q00' });
ok('안 푼 학생은 해설 못 봄 (정답 알아내기 차단)', r.status === 403, `HTTP ${r.status}`);

console.log('\n[제출과 채점]');
r = await quiz('PUT', stuToken, {
  schoolId: SCHOOL, classId: CLASS, quizId: QUIZ,
  answers: [
    { questionId: 'q00', choiceIndex: 1 },              // 정답
    { questionId: 'q01', text: ' 일곱 ' },              // 공백 포함 정답
    { questionId: 'q02', text: '봄이요. 꽃이 피니까요.' }, // 서술형
    { questionId: 'q03', choiceIndex: 1 },              // 오답
  ],
});
j = await r.json();
ok('학생 제출 성공', r.ok, `HTTP ${r.status}`);

const sub = (await quizRef.collection('submissions').doc(STU).get()).data();
ok('객관식 정답 채점됨', sub?.answers?.[0]?.correct === true);
ok('단답형은 공백 무시하고 채점됨', sub?.answers?.[1]?.correct === true, `"${sub?.answers?.[1]?.text}"`);
ok('서술형은 채점하지 않음 (correct=null)', sub?.answers?.[2]?.correct === null, `correct=${sub?.answers?.[2]?.correct}`);
ok('오답도 기록됨', sub?.answers?.[3]?.correct === false);
ok('채점 집계 맞음 (2/3)', sub?.correctCount === 2 && sub?.gradedCount === 3, `${sub?.correctCount}/${sub?.gradedCount}`);

// 안 푼 문항도 빈 답으로 남아야 교사 화면에서 드러난다
r = await quiz('PUT', stuToken, { schoolId: SCHOOL, classId: CLASS, quizId: QUIZ, answers: [] });
const blank = (await quizRef.collection('submissions').doc(STU).get()).data();
ok('안 푼 문항도 자리를 남김', blank?.answers?.length === 4, `${blank?.answers?.length}개`);
ok('안 푼 객관식은 오답 처리', blank?.answers?.[0]?.correct === false);

console.log('\n[제출물 열람 범위]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
try {
  const own = await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/quizzes/${QUIZ}/submissions/${STU}`));
  ok('본인 제출물은 읽을 수 있음', own.exists());
} catch (e) { ok('본인 제출물은 읽을 수 있음', false, String(e).slice(0, 60)); }
await signOut(cauth);

console.log('\n[제출 후 해설]');
r = await explain(stuToken, { schoolId: SCHOOL, classId: CLASS, quizId: QUIZ, questionId: 'q00' });
j = await r.json();
ok('제출한 학생은 해설을 볼 수 있음', r.ok && !!j.explanation, `HTTP ${r.status} ${String(j.explanation || j.error).slice(0, 40)}`);

if (r.ok) {
  const cached = (await quizRef.collection('questions').doc('q00').get()).data();
  ok('해설이 문항에 캐시됨 (반 전체 재사용)', !!cached?.aiExplanation);
  const r2 = await explain(stuToken, { schoolId: SCHOOL, classId: CLASS, quizId: QUIZ, questionId: 'q00' });
  const j2 = await r2.json();
  ok('두 번째 호출은 캐시에서 나옴', j2.source === 'ai-cached', `source=${j2.source}`);
}

// 교사가 직접 쓴 해설이 우선
await quizRef.collection('questions').doc('q01').set({ explanation: '무지개는 일곱 빛깔이에요.' }, { merge: true });
r = await explain(stuToken, { schoolId: SCHOOL, classId: CLASS, quizId: QUIZ, questionId: 'q01' });
j = await r.json();
ok('교사 해설이 AI보다 우선', j.source === 'teacher', `source=${j.source}`);

console.log('\n[삭제]');
r = await fetch(`${BASE}/api/quiz?schoolId=${SCHOOL}&classId=${CLASS}&quizId=${QUIZ}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${stuToken}` },
});
ok('학생은 삭제 못 함', r.status === 403, `HTTP ${r.status}`);

r = await fetch(`${BASE}/api/quiz?schoolId=${SCHOOL}&classId=${CLASS}&quizId=${QUIZ}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${teaToken}` },
});
ok('교사는 삭제 가능', r.ok, `HTTP ${r.status}`);
ok('정답지까지 함께 지워짐', (await quizRef.collection('answerKeys').get()).size === 0);

// 정리
const leftovers = await adb.collection(`schools/${SCHOOL}/classes/${CLASS}/quizzes`).get();
for (const d of leftovers.docs) {
  for (const c of ['questions', 'answerKeys', 'submissions']) {
    const s = await d.ref.collection(c).get();
    for (const x of s.docs) await x.ref.delete();
  }
  await d.ref.delete();
}
for (const uid of [STU, TEA]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
