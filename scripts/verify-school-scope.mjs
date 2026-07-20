// 교사 권한 학교 종속 검증: 남의 학교 명부·제출물·출제가 전부 막히는지
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, getDocs, getDoc, doc, collection } from 'firebase/firestore';

const HOME = 'aewol-elementary';        // 우리 학교
const OTHER = 'zz-other-school';        // 남의 학교 (검증용으로 만들었다 지운다)
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

const HOME_TEACHER = 'zz-scope-home-teacher';
const OTHER_TEACHER = 'zz-scope-other-teacher';
const SA = 'zz-scope-superadmin';

// 남의 학교와 그 학교 명부 한 줄
await adb.collection('schools').doc(OTHER).set({
  name: '남의초등학교', lat: 33.4, lng: 126.5, imageUrl: '', tagline: '',
  gradeCount: 6, classPerGrade: 1, assets: [], createdBy: SA, isArchived: false,
});
await adb.doc(`schools/${OTHER}/classes/${CLASS}`).set({
  schoolId: OTHER, grade: '3', classNumber: 1, year: '2026',
  teacherUid: '', teacherName: '', motto: '', introText: '', isArchived: false, memberUids: [],
});
await adb.doc(`schools/${OTHER}/classes/${CLASS}/students/zz-s1`).set({
  number: 1, name: '남의반학생', code: 'ZZZZZZ', linkedUid: null, linkedAt: null,
});
await adb.doc(`schools/${HOME}/classes/${CLASS}/students/zz-s2`).set({
  number: 99, name: '우리반학생', code: 'YYYYYY', linkedUid: null, linkedAt: null,
});

const mk = (uid, name, role, schoolIds) =>
  adb.collection('users').doc(uid).set({
    displayName: name, role, pendingRole: null, pendingSchoolId: null,
    schoolIds, classIds: [], children: [], stamps: 0,
    avatarCustom: { hat: null, accessory: null }, avatarId: null,
    preferences: { theme: 'light' },
  });

await mk(HOME_TEACHER, '우리학교교사', 'teacher', [HOME]);
await mk(OTHER_TEACHER, '남의학교교사', 'teacher', [OTHER]);
await mk(SA, '총관리자', 'super_admin', []);

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const asUser = (uid) =>
  getAdminAuth().createCustomToken(uid).then((t) => signInWithCustomToken(cauth, t));

console.log('[명부 열람 — 규칙]');
await asUser(HOME_TEACHER);
try {
  await getDocs(collection(cdb, `schools/${HOME}/classes/${CLASS}/students`));
  ok('우리 학교 명부는 볼 수 있음', true);
} catch (e) { ok('우리 학교 명부는 볼 수 있음', false, String(e).slice(0, 60)); }

try {
  await getDocs(collection(cdb, `schools/${OTHER}/classes/${CLASS}/students`));
  ok('남의 학교 명부는 못 봄', false, '통과되면 안 됨');
} catch { ok('남의 학교 명부는 못 봄', true); }

try {
  await getDoc(doc(cdb, `schools/${OTHER}/classes/${CLASS}/students/zz-s1`));
  ok('남의 학교 명부 단건도 차단', false, '통과되면 안 됨');
} catch { ok('남의 학교 명부 단건도 차단', true); }

console.log('\n[다른 사람 계정 열람]');
try {
  await getDoc(doc(cdb, 'users', OTHER_TEACHER));
  ok('교사는 남의 계정 문서 못 읽음', false, '통과되면 안 됨');
} catch { ok('교사는 남의 계정 문서 못 읽음', true); }
await signOut(cauth);

console.log('\n[총관리자는 전부 가능]');
await asUser(SA);
try {
  await getDocs(collection(cdb, `schools/${OTHER}/classes/${CLASS}/students`));
  ok('총관리자는 남의 학교도 봄', true);
} catch (e) { ok('총관리자는 남의 학교도 봄', false, String(e).slice(0, 60)); }
await signOut(cauth);

console.log('\n[API — 남의 학교에 출제]');
const homeToken = await tokenFor(HOME_TEACHER);
const otherToken = await tokenFor(OTHER_TEACHER);

const quizPost = (token, schoolId) =>
  fetch(`${BASE}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      schoolId, classId: CLASS, title: '범위 검증 퀴즈',
      questions: [{ type: 'choice', prompt: '1+1?', choices: ['1', '2'], answerIndex: 1 }],
    }),
  });

let r = await quizPost(homeToken, HOME);
const homeQuiz = await r.json();
ok('우리 학교에는 출제 가능', r.ok, `HTTP ${r.status}`);

r = await quizPost(otherToken, HOME);
ok('남의 학교에는 출제 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[API — 남의 학교 학생코드 발급]');
r = await fetch(`${BASE}/api/student-code`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
  body: JSON.stringify({ schoolId: HOME, classId: CLASS, studentDocId: 'zz-s2' }),
});
ok('남의 학교 학생코드 발급 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[API — 남의 학교 숙제 채점]');
r = await fetch(`${BASE}/api/homework`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
  body: JSON.stringify({ schoolId: HOME, classId: CLASS, homeworkId: 'whatever', studentUid: 'x', check: true }),
});
ok('남의 학교 숙제 채점 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[API — 남의 학교 칠판 지우기]');
r = await fetch(`${BASE}/api/blackboard?schoolId=${HOME}&classId=${CLASS}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${otherToken}` },
});
ok('남의 학교 칠판 전체 지우기 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[API — 남의 학교 퀴즈 삭제]');
if (homeQuiz.quizId) {
  r = await fetch(`${BASE}/api/quiz?schoolId=${HOME}&classId=${CLASS}&quizId=${homeQuiz.quizId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${otherToken}` },
  });
  ok('남의 학교 퀴즈 삭제 불가', r.status === 403, `HTTP ${r.status}`);

  r = await fetch(`${BASE}/api/quiz?schoolId=${HOME}&classId=${CLASS}&quizId=${homeQuiz.quizId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${homeToken}` },
  });
  ok('우리 학교 퀴즈는 삭제 가능', r.ok, `HTTP ${r.status}`);
}

console.log('\n[승인 시 학교가 함께 부여되는지]');
const APPLICANT = 'zz-scope-applicant';
await adb.collection('users').doc(APPLICANT).set({
  displayName: '신청자', role: null, pendingRole: null, pendingSchoolId: null,
  schoolIds: [], classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});
const appToken = await tokenFor(APPLICANT);

r = await fetch(`${BASE}/api/role`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
  body: JSON.stringify({ role: 'teacher' }),
});
ok('학교 없이 교사 신청 불가', r.status === 400, `HTTP ${r.status}`);

r = await fetch(`${BASE}/api/role`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
  body: JSON.stringify({ role: 'teacher', schoolId: 'zz-nope' }),
});
ok('없는 학교로 신청 불가', r.status === 404, `HTTP ${r.status}`);

r = await fetch(`${BASE}/api/role`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
  body: JSON.stringify({ role: 'teacher', schoolId: OTHER }),
});
ok('학교를 고르면 신청됨', r.ok, `HTTP ${r.status}`);

const saToken = await tokenFor(SA);
r = await fetch(`${BASE}/api/role`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
  body: JSON.stringify({ uid: APPLICANT, approve: true }),
});
const approved = (await adb.collection('users').doc(APPLICANT).get()).data();
ok('승인 시 schoolIds 에 학교가 들어감', JSON.stringify(approved?.schoolIds) === JSON.stringify([OTHER]),
  JSON.stringify(approved?.schoolIds));
ok('전역 권한이 아님 (우리 학교는 빠져 있음)', !(approved?.schoolIds || []).includes(HOME));

// 정리
for (const uid of [HOME_TEACHER, OTHER_TEACHER, SA, APPLICANT]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}
const quizzes = await adb.collection(`schools/${HOME}/classes/${CLASS}/quizzes`).get();
for (const d of quizzes.docs) {
  for (const c of ['questions', 'answerKeys', 'submissions']) {
    const s = await d.ref.collection(c).get();
    for (const x of s.docs) await x.ref.delete();
  }
  await d.ref.delete();
}
await adb.doc(`schools/${HOME}/classes/${CLASS}/students/zz-s2`).delete();
await adb.doc(`schools/${OTHER}/classes/${CLASS}/students/zz-s1`).delete();
await adb.doc(`schools/${OTHER}/classes/${CLASS}`).delete();
await adb.collection('schools').doc(OTHER).delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
