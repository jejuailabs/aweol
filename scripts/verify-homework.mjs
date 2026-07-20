// 숙제 API 검증: 제출, 검사완료 토글, 콕 찌르기, 권한, 클라이언트 직접 쓰기 차단
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
const CLASS = '3-1';
const HW = 'zz-verify-hw';
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

const STU = 'zz-hw-student';
const STU2 = 'zz-hw-student2';
const TEA = 'zz-hw-teacher';

await adb.collection('users').doc(STU).set({ displayName: '숙제검증학생', role: 'student', classIds: [CLASS], children: [] });
await adb.collection('users').doc(STU2).set({ displayName: '숙제검증학생2', role: 'student', classIds: [CLASS], children: [] });
await adb.collection('users').doc(TEA).set({ displayName: '숙제검증교사', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS], children: [] });

const hwRef = adb.doc(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}`);
await hwRef.set({
  title: '검증용 숙제', description: '', submitType: 'text', visibility: 'class',
  dueDate: null, authorUid: TEA, authorName: '숙제검증교사',
});

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const call = (method, token, body) =>
  fetch(`${BASE}/api/homework`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const base = { schoolId: SCHOOL, classId: CLASS, homeworkId: HW };
const subRef = hwRef.collection('submissions').doc(STU);
const nudgeRef = hwRef.collection('nudges').doc(STU);

console.log('[제출]');
const stuToken = await tokenFor(STU);
let r = await call('POST', stuToken, { ...base, text: '검증용 제출입니다' });
ok('학생 제출 허용', r.ok, `HTTP ${r.status}`);
let d = (await subRef.get()).data();
ok('제출 직후 checked=false', d?.checked === false, `checked=${d?.checked}`);

console.log('\n[콕 찌르기]');
const teaToken = await tokenFor(TEA);
r = await call('PATCH', teaToken, { ...base, studentUid: STU2, nudge: true, studentName: '숙제검증학생2' });
ok('교사 콕 찌르기 허용', r.ok, `HTTP ${r.status}`);
let n = (await hwRef.collection('nudges').doc(STU2).get()).data();
ok('찌르기 문서 생성 (count=1)', n?.count === 1, `count=${n?.count}`);
await call('PATCH', teaToken, { ...base, studentUid: STU2, nudge: true, studentName: '숙제검증학생2' });
n = (await hwRef.collection('nudges').doc(STU2).get()).data();
ok('다시 찌르면 count 증가', n?.count === 2, `count=${n?.count}`);

r = await call('PATCH', stuToken, { ...base, studentUid: STU2, nudge: true });
ok('학생의 찌르기 차단', r.status === 403, `HTTP ${r.status}`);

console.log('\n[검사완료]');
r = await call('PATCH', teaToken, { ...base, studentUid: STU, check: true });
ok('교사 검사완료 허용', r.ok, `HTTP ${r.status}`);
d = (await subRef.get()).data();
ok('checked=true, checkedAt 기록', d?.checked === true && !!d?.checkedAt, `checkedAt=${!!d?.checkedAt}`);

r = await call('PATCH', teaToken, { ...base, studentUid: STU, check: false });
d = (await subRef.get()).data();
ok('검사완료 취소', d?.checked === false && d?.checkedAt === null);

r = await call('PATCH', stuToken, { ...base, studentUid: STU, check: true });
ok('학생의 검사완료 차단', r.status === 403, `HTTP ${r.status}`);

r = await call('PATCH', teaToken, { ...base, studentUid: 'zz-nobody', check: true });
ok('없는 제출물 검사 시 404 (유령 문서 방지)', r.status === 404, `HTTP ${r.status}`);
ok('유령 문서 생성 안 됨', !(await hwRef.collection('submissions').doc('zz-nobody').get()).exists);

console.log('\n[찔린 뒤 제출하면 표시 해제]');
await call('PATCH', teaToken, { ...base, studentUid: STU, nudge: true, studentName: '숙제검증학생' });
ok('찌르기 문서 있음', (await nudgeRef.get()).exists);
await call('PATCH', teaToken, { ...base, studentUid: STU, check: true });
await call('POST', stuToken, { ...base, text: '다시 제출합니다' });
ok('재제출 시 찌르기 해제', !(await nudgeRef.get()).exists);
d = (await subRef.get()).data();
ok('재제출 시 검사완료 초기화', d?.checked === false, `checked=${d?.checked}`);

console.log('\n[클라이언트 직접 쓰기·읽기 차단]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
try {
  await setDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/nudges/${STU}`), { count: 0 });
  ok('찌르기 직접 쓰기 차단', false, '통과되면 안 됨');
} catch { ok('찌르기 직접 쓰기 차단', true); }

try {
  await setDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/submissions/${STU}`), { checked: true });
  ok('제출물 직접 쓰기 차단', false, '통과되면 안 됨');
} catch { ok('제출물 직접 쓰기 차단', true); }

try {
  await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/nudges/${STU2}`));
  ok('남의 찌르기 읽기 차단', false, '통과되면 안 됨');
} catch { ok('남의 찌르기 읽기 차단', true); }

try {
  const own = await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/nudges/${STU}`));
  ok('본인 찌르기 읽기 허용', true, own.exists() ? '문서 있음' : '문서 없음(정상)');
} catch { ok('본인 찌르기 읽기 허용', false, '거부됨'); }

await signOut(cauth);

// 정리
for (const c of ['submissions', 'nudges']) {
  const s = await hwRef.collection(c).get();
  for (const doc of s.docs) await doc.ref.delete();
}
await hwRef.delete();
for (const uid of [STU, STU2, TEA]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
