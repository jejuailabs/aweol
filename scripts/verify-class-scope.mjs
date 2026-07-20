// 교사 권한이 '담당 반' 안에서만 통하는지 검증.
// 같은 학교의 다른 반은 남의 반이다 — 명부도, 제출물도, 출제도 막혀야 한다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, getDocs, getDoc, doc, collection } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
const MINE = '3-1';   // 담당 반
const OTHER = '3-2';  // 같은 학교 다른 반
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

const TEA = 'zz-cls-teacher';   // 3-1 담임
const SA = 'zz-cls-super';

await adb.collection('users').doc(TEA).set({
  displayName: '3-1담임', role: 'teacher', pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [SCHOOL], classIds: [MINE], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});
await adb.collection('users').doc(SA).set({
  displayName: '총관리자', role: 'super_admin', pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [], classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});

// 두 반과 명부 한 줄씩
for (const cid of [MINE, OTHER]) {
  await adb.doc(`schools/${SCHOOL}/classes/${cid}`).set({
    schoolId: SCHOOL, grade: '3', classNumber: Number(cid.split('-')[1]), year: '2026',
    teacherUid: '', teacherName: '', motto: '', introText: '', isArchived: false, memberUids: [],
  }, { merge: true });
  await adb.doc(`schools/${SCHOOL}/classes/${cid}/students/zz-s`).set({
    number: 1, name: `${cid}학생`, code: null, linkedUid: null, linkedAt: null,
  });
}

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const asUser = (uid) => getAdminAuth().createCustomToken(uid).then((t) => signInWithCustomToken(cauth, t));

const teaToken = await tokenFor(TEA);
const saToken = await tokenFor(SA);

console.log('[명부 — 규칙]');
await asUser(TEA);
try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${MINE}/students`));
  ok('담당 반 명부는 읽을 수 있음', true);
} catch (e) { ok('담당 반 명부는 읽을 수 있음', false, String(e).slice(0, 60)); }

try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${OTHER}/students`));
  ok('같은 학교 다른 반 명부는 못 읽음', false, '통과되면 안 됨');
} catch { ok('같은 학교 다른 반 명부는 못 읽음', true); }

try {
  await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${OTHER}/students/zz-s`));
  ok('다른 반 명부 단건도 차단', false, '통과되면 안 됨');
} catch { ok('다른 반 명부 단건도 차단', true); }
await signOut(cauth);

await asUser(SA);
try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${OTHER}/students`));
  ok('총관리자는 모든 반을 봄', true);
} catch (e) { ok('총관리자는 모든 반을 봄', false, String(e).slice(0, 60)); }
await signOut(cauth);

console.log('\n[출제 — API]');
const quiz = (token, classId) =>
  fetch(`${BASE}/api/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      schoolId: SCHOOL, classId, title: '반 범위 검증',
      questions: [{ type: 'choice', prompt: '1+1?', choices: ['1', '2'], answerIndex: 1 }],
    }),
  });

let r = await quiz(teaToken, MINE);
const madeQuiz = await r.json();
ok('담당 반에는 출제 가능', r.ok, `HTTP ${r.status}`);

r = await quiz(teaToken, OTHER);
ok('다른 반에는 출제 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[학생코드 발급 — API]');
r = await fetch(`${BASE}/api/student-code`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teaToken}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: OTHER, studentDocId: 'zz-s' }),
});
ok('다른 반 학생코드 발급 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[숙제 채점 — API]');
r = await fetch(`${BASE}/api/homework`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teaToken}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: OTHER, homeworkId: 'x', studentUid: 'y', check: true }),
});
ok('다른 반 숙제 채점 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[칠판 전체 지우기 — API]');
r = await fetch(`${BASE}/api/blackboard?schoolId=${SCHOOL}&classId=${OTHER}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${teaToken}` },
});
ok('다른 반 칠판 지우기 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[틀린그림 — API]');
r = await fetch(`${BASE}/api/spot-game`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teaToken}` },
  body: JSON.stringify({
    schoolId: SCHOOL, classId: OTHER, title: 'x',
    originalDataUrl: 'data:image/png;base64,AA', variantDataUrl: 'data:image/png;base64,AA',
    spots: [{ x: 0.5, y: 0.5, r: 0.07 }],
  }),
});
ok('다른 반 틀린그림 출제 불가', r.status === 403, `HTTP ${r.status}`);

console.log('\n[학교 정보 수정 — 총관리자만]');
const form = new FormData();
form.set('schoolId', SCHOOL);
form.set('name', '교사가 바꾼 이름');
r = await fetch(`${BASE}/api/school`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${teaToken}` }, body: form,
});
ok('교사는 학교 이름을 못 바꿈', r.status === 403, `HTTP ${r.status}`);

console.log('\n[승인 시 담당 반 부여]');
const APP = 'zz-cls-applicant';
await adb.collection('users').doc(APP).set({
  displayName: '신청자', role: null, pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [], classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});
const appToken = await tokenFor(APP);

const apply = (body) =>
  fetch(`${BASE}/api/role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appToken}` },
    body: JSON.stringify(body),
  });

r = await apply({ role: 'teacher', schoolId: SCHOOL });
ok('학년·반 없이 신청 불가', r.status === 400, `HTTP ${r.status}`);

r = await apply({ role: 'teacher', schoolId: SCHOOL, grade: 9, classNumber: 1 });
ok('없는 학년은 거부', r.status === 400, `HTTP ${r.status}`);

r = await apply({ role: 'teacher', schoolId: SCHOOL, grade: 3, classNumber: 99 });
ok('범위 밖 반은 거부', r.status === 400, `HTTP ${r.status}`);

// 범위 안이지만 실제로 없는 반 (학교는 학년당 4반까지 만들어져 있다)
r = await apply({ role: 'teacher', schoolId: SCHOOL, grade: 3, classNumber: 15 });
ok('없는 반은 거부', r.status === 404, `HTTP ${r.status}`);

r = await apply({ role: 'teacher', schoolId: SCHOOL, grade: 3, classNumber: 2 });
ok('학년·반을 적으면 신청됨', r.ok, `HTTP ${r.status}`);

r = await fetch(`${BASE}/api/role`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saToken}` },
  body: JSON.stringify({ uid: APP, approve: true }),
});
const approved = (await adb.collection('users').doc(APP).get()).data();
ok('승인 시 담당 반이 부여됨', JSON.stringify(approved?.classIds) === JSON.stringify([OTHER]),
  JSON.stringify(approved?.classIds));
ok('학교도 함께 부여됨', JSON.stringify(approved?.schoolIds) === JSON.stringify([SCHOOL]));
ok('담임이 비어 있던 반에 배정됨',
  (await adb.doc(`schools/${SCHOOL}/classes/${OTHER}`).get()).data()?.teacherUid === APP);

// 정리
if (madeQuiz.quizId) {
  const qr = adb.doc(`schools/${SCHOOL}/classes/${MINE}/quizzes/${madeQuiz.quizId}`);
  for (const c of ['questions', 'answerKeys', 'submissions']) {
    const s = await qr.collection(c).get();
    for (const d of s.docs) await d.ref.delete();
  }
  await qr.delete();
}
await adb.doc(`schools/${SCHOOL}/classes/${OTHER}`).set({ teacherUid: '', teacherName: '' }, { merge: true });
for (const cid of [MINE, OTHER]) await adb.doc(`schools/${SCHOOL}/classes/${cid}/students/zz-s`).delete();
for (const uid of [TEA, SA, APP]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
