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
/** 반 만들기는 이제 학교관리자만 한다 */
const ADM = 'zz-cls-make-admin';
const ADM_OUT = 'zz-cls-make-admin-other';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '만드는선생님', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(OUT).set({ ...base, displayName: '남의학교', role: 'teacher', schoolIds: ['other-school'], classIds: [] });
await adb.collection('users').doc(ADM).set({ ...base, displayName: '학교관리자', role: 'school_admin', schoolIds: [SCHOOL], classIds: [] });
await adb.collection('users').doc(ADM_OUT).set({ ...base, displayName: '남의학교관리자', role: 'school_admin', schoolIds: ['other-school'], classIds: [] });

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

console.log('[권한 — 반 만들기는 학교관리자만]');
let r = await call(null, { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('비로그인 거부', r.status === 401, `HTTP ${r.status}`);
r = await call(await tokenFor(OUT), { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('남의 학교 선생님 거부', r.status === 403, `HTTP ${r.status}`);
// 담임이 자기 반을 임의로 늘리면 학년·반 구성이 실제 학교와 어긋난다
r = await call(await tokenFor(TEA), { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('이 학교 일반 선생님도 거부', r.status === 403, `HTTP ${r.status}`);
ok('무엇을 하면 되는지 알려줌',
  String((await r.json()).error || '').includes('학교관리자'), '');
r = await call(await tokenFor(ADM_OUT), { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('남의 학교 학교관리자 거부', r.status === 403, `HTTP ${r.status}`);

const admToken = await tokenFor(ADM);

console.log('\n[잘못 입력]');
for (const [g, c, why] of [[0, 1, '0학년'], [7, 1, '7학년'], [3, 0, '0반'], [3, 99, '99반'], ['셋', 1, '숫자 아님']]) {
  r = await call(admToken, { schoolId: SCHOOL, grade: g, classNumber: c });
  const j = await r.json();
  ok(`${why} 거부`, r.status === 400, `HTTP ${r.status} ${String(j.error || '').slice(0, 30)}`);
}

console.log('\n[이미 있는 반 — 절대 덮이면 안 된다]');
const before = (await adb.doc(`schools/${SCHOOL}/classes/3-4`).get()).data();
r = await call(admToken, { schoolId: SCHOOL, grade: 3, classNumber: 4, motto: '덮어쓰기 시도' });
const j409 = await r.json();
ok('이미 있으면 409', r.status === 409, `HTTP ${r.status}`);
// 이건 '오류'가 아니라 '안내'다. 화면이 색을 나눌 수 있게 코드가 와야 한다.
ok('안내 코드가 옴 (오류가 아님)', j409.code === 'ALREADY_EXISTS', String(j409.code));
ok('error 가 아니라 message 로 옴', !j409.error && !!j409.message, JSON.stringify(j409).slice(0, 70));
// 3-4 는 이름만 적혀 있고 계정 연결은 안 된 반이다. 그 사실을 그대로 알려줘야 한다.
ok('적혀 있는 담임 이름을 알려줌', String(j409.message || '').includes('최선생님'), String(j409.message).slice(0, 70));
ok('계정 연결이 안 됐다고 알려줌', String(j409.message || '').includes('연결'), String(j409.message).slice(0, 70));
ok('다음에 뭘 할지 알려줌', !!j409.hint, String(j409.hint));
const after = (await adb.doc(`schools/${SCHOOL}/classes/3-4`).get()).data();
ok('3-4 담임이 그대로', after?.teacherName === before?.teacherName, `${before?.teacherName} → ${after?.teacherName}`);
ok('3-4 급훈이 그대로', after?.motto === before?.motto, `${before?.motto} → ${after?.motto}`);
ok('만든 사람 담당 반에 3-4 가 안 들어감',
  !((await adb.collection('users').doc(ADM).get()).data()?.classIds || []).includes('3-4'),
  JSON.stringify((await adb.collection('users').doc(ADM).get()).data()?.classIds));

console.log('\n[담임 없는 반 — 만들기가 아니라 배정으로 안내]');
await adb.doc(`schools/${SCHOOL}/classes/6-11`).set({
  schoolId: SCHOOL, grade: '6', classNumber: 11, year: '2026',
  teacherUid: '', teacherName: '', motto: '', introText: '', isArchived: false, memberUids: [],
});
r = await call(admToken, { schoolId: SCHOOL, grade: 6, classNumber: 11 });
const jEmpty = await r.json();
ok('담임 없는 반도 409', r.status === 409, `HTTP ${r.status}`);
ok('담임이 없다고 알려줌', String(jEmpty.message || '').includes('담임이 없는'), String(jEmpty.message));
ok('담임 배정을 안내함', String(jEmpty.hint || '').includes('담임 배정'), String(jEmpty.hint));
ok('가로채지 못함 — 담임은 여전히 빈칸',
  (await adb.doc(`schools/${SCHOOL}/classes/6-11`).get()).data()?.teacherUid === '');
await adb.doc(`schools/${SCHOOL}/classes/6-11`).delete().catch(() => {});

console.log('\n[없는 반 만들기]');
await adb.doc(`schools/${SCHOOL}/classes/5-9`).delete().catch(() => {});
r = await call(admToken, { schoolId: SCHOOL, grade: 5, classNumber: 9, motto: '검증용 급훈' });
ok('학교관리자는 만들 수 있음', r.ok, `HTTP ${r.status}`);
const made = (await adb.doc(`schools/${SCHOOL}/classes/5-9`).get()).data();
/**
 * **만든 사람이 담임이 되면 안 된다.** 학교관리자가 학교의 반을 한꺼번에 세우는데
 * 만든 사람을 담임으로 박으면 온 학교의 담임이 그 한 사람이 된다.
 * 담임은 교사 승인 때 빈 반에 채워진다.
 */
ok('담임은 비어 있음', made?.teacherUid === '', `"${made?.teacherUid}"`);
ok('급훈이 들어감', made?.motto === '검증용 급훈', String(made?.motto));
ok('만든 사람 담당 반에 안 들어감',
  !((await adb.collection('users').doc(ADM).get()).data()?.classIds || []).includes('5-9'),
  JSON.stringify((await adb.collection('users').doc(ADM).get()).data()?.classIds));

console.log('\n[같은 반 두 번]');
r = await call(admToken, { schoolId: SCHOOL, grade: 5, classNumber: 9 });
ok('두 번째는 409', r.status === 409, `HTTP ${r.status}`);

console.log('\n[규칙 — 화면을 거치지 않고 직접 써도 막힌다]');
await signOut(cauth).catch(() => {});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(TEA));
let denied = false;
try {
  await setDoc(doc(cdb, `schools/${SCHOOL}/classes/5-8`), {
    schoolId: SCHOOL, grade: '5', classNumber: 8, year: '2026',
    teacherUid: TEA, teacherName: '만드는선생님', motto: '', introText: '',
    isArchived: false, memberUids: [TEA],
  });
} catch { denied = true; }
ok('일반 선생님의 직접 반 생성 거부', denied);
await adb.doc(`schools/${SCHOOL}/classes/5-8`).delete().catch(() => {});

await signOut(cauth).catch(() => {});

// 정리
await adb.doc(`schools/${SCHOOL}/classes/5-9`).delete().catch(() => {});
for (const uid of [TEA, OUT, ADM, ADM_OUT]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
