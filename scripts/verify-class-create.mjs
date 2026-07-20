// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';

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
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

const SCHOOL = 'aewol-elementary';
const BASE_URL_ = process.env.BASE_URL || 'http://localhost:3000';
const TEA = 'zz-cls-make-teacher';
const OUT = 'zz-cls-make-outsider';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '만드는선생님', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(OUT).set({ ...base, displayName: '남의학교', role: 'teacher', schoolIds: ['other-school'], classIds: [] });

const tokenFor = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const call = (tok, body) =>
  fetch(`${BASE_URL_}/api/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  });

const teaToken = await tokenFor(TEA);

console.log('[권한]');
let r = await call(null, { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('비로그인 거부', r.status === 401, `HTTP ${r.status}`);
r = await call(await tokenFor(OUT), { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('남의 학교 선생님 거부', r.status === 403, `HTTP ${r.status}`);

console.log('\n[잘못 입력]');
for (const [g, c, why] of [[0, 1, '0학년'], [7, 1, '7학년'], [3, 0, '0반'], [3, 99, '99반'], ['셋', 1, '숫자 아님']]) {
  r = await call(teaToken, { schoolId: SCHOOL, grade: g, classNumber: c });
  const j = await r.json();
  ok(`${why} 거부`, r.status === 400, `HTTP ${r.status} ${String(j.error || '').slice(0, 30)}`);
}

console.log('\n[이미 있는 반 — 절대 덮이면 안 된다]');
const before = (await adb.doc(`schools/${SCHOOL}/classes/3-4`).get()).data();
r = await call(teaToken, { schoolId: SCHOOL, grade: 3, classNumber: 4, motto: '덮어쓰기 시도' });
const j409 = await r.json();
ok('이미 있으면 409', r.status === 409, `HTTP ${r.status}`);
// 이건 '오류'가 아니라 '안내'다. 화면이 색을 나눌 수 있게 코드가 와야 한다.
ok('안내 코드가 옴 (오류가 아님)', j409.code === 'ALREADY_EXISTS', String(j409.code));
ok('error 가 아니라 message 로 옴', !j409.error && !!j409.message, JSON.stringify(j409).slice(0, 70));
ok('담임 이름을 알려줌', String(j409.message || '').includes('최선생님'), String(j409.message).slice(0, 60));
ok('다음에 뭘 할지 알려줌', !!j409.hint, String(j409.hint));
const after = (await adb.doc(`schools/${SCHOOL}/classes/3-4`).get()).data();
ok('3-4 담임이 그대로', after?.teacherName === before?.teacherName, `${before?.teacherName} → ${after?.teacherName}`);
ok('3-4 급훈이 그대로', after?.motto === before?.motto, `${before?.motto} → ${after?.motto}`);
ok('내 담당 반에 3-4 가 안 들어감',
  !((await adb.collection('users').doc(TEA).get()).data()?.classIds || []).includes('3-4'),
  JSON.stringify((await adb.collection('users').doc(TEA).get()).data()?.classIds));

console.log('\n[담임 없는 반 — 만들기가 아니라 배정으로 안내]');
await adb.doc(`schools/${SCHOOL}/classes/6-11`).set({
  schoolId: SCHOOL, grade: '6', classNumber: 11, year: '2026',
  teacherUid: '', teacherName: '', motto: '', introText: '', isArchived: false, memberUids: [],
});
r = await call(teaToken, { schoolId: SCHOOL, grade: 6, classNumber: 11 });
const jEmpty = await r.json();
ok('담임 없는 반도 409', r.status === 409, `HTTP ${r.status}`);
ok('담임이 없다고 알려줌', String(jEmpty.message || '').includes('담임이 없는'), String(jEmpty.message));
ok('담임 배정을 안내함', String(jEmpty.hint || '').includes('담임 배정'), String(jEmpty.hint));
ok('가로채지 못함 — 담임은 여전히 빈칸',
  (await adb.doc(`schools/${SCHOOL}/classes/6-11`).get()).data()?.teacherUid === '');
await adb.doc(`schools/${SCHOOL}/classes/6-11`).delete().catch(() => {});

console.log('\n[없는 반 만들기]');
await adb.doc(`schools/${SCHOOL}/classes/5-9`).delete().catch(() => {});
r = await call(teaToken, { schoolId: SCHOOL, grade: 5, classNumber: 9, motto: '검증용 급훈' });
const jNew = await r.json();
ok('새 반은 만들어짐', r.ok, `HTTP ${r.status}`);
const made = (await adb.doc(`schools/${SCHOOL}/classes/5-9`).get()).data();
ok('담임이 만든 사람', made?.teacherUid === TEA, String(made?.teacherName));
ok('급훈이 들어감', made?.motto === '검증용 급훈', String(made?.motto));
ok('만든 사람 담당 반에 들어감',
  ((await adb.collection('users').doc(TEA).get()).data()?.classIds || []).includes('5-9'),
  JSON.stringify((await adb.collection('users').doc(TEA).get()).data()?.classIds));

console.log('\n[같은 반 두 번]');
r = await call(teaToken, { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('두 번째는 409', r.status === 409, `HTTP ${r.status}`);

await signOut(cauth).catch(() => {});

// 정리
await adb.doc(`schools/${SCHOOL}/classes/5-9`).delete().catch(() => {});
for (const uid of [TEA, OUT]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
