// 학생코드 흐름 검증: 발급 권한, 코드 사용, 중복 사용 차단, 역인덱스 비공개, 학부모 연결
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
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

const CLASS = '3-1';
const STU_DOC = 'student-901';
const TEACHER = 'zz-sc-teacher';
const STU_A = 'zz-sc-studentA';
const STU_B = 'zz-sc-studentB';
const PARENT = 'zz-sc-parent';

// 준비: 교사/학생/학부모 계정 + 명부 한 줄
await adb.collection('users').doc(TEACHER).set({ displayName: '코드검증교사', role: 'teacher', schoolIds: [SCHOOL], classIds: [], children: [] });
await adb.collection('users').doc(STU_A).set({ displayName: '학생A', role: 'student', classIds: [], children: [] });
await adb.collection('users').doc(STU_B).set({ displayName: '학생B', role: 'student', classIds: [], children: [] });
await adb.collection('users').doc(PARENT).set({ displayName: '학부모', role: 'parent', classIds: [], children: [] });
const rosterRef = adb.doc(`schools/aewol-elementary/classes/${CLASS}/students/${STU_DOC}`);
await rosterRef.set({ number: 901, name: '코드검증학생' });

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

console.log('[코드 발급]');
// 학생이 발급 시도 → 차단
let t = await tokenFor(STU_A);
let r = await fetch(`${BASE}/api/student-code`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: CLASS }),
});
ok('학생의 코드 발급 차단', r.status === 403, `HTTP ${r.status}`);

// 교사가 발급
t = await tokenFor(TEACHER);
r = await fetch(`${BASE}/api/student-code`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: CLASS }),
});
ok('교사의 코드 발급 허용', r.ok, `HTTP ${r.status}`);

const code = (await rosterRef.get()).data()?.code;
ok('명부에 코드 저장됨', !!code && code.length === 6, code || '없음');

console.log('\n[역인덱스 비공개]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU_A));
try {
  await getDocs(collection(cdb, 'schools/aewol-elementary/studentCodes'));
  ok('코드 목록 조회 차단', false, '통과되면 안 됨');
} catch { ok('코드 목록 조회 차단', true); }
try {
  await getDoc(doc(cdb, `schools/aewol-elementary/studentCodes/${code}`));
  ok('코드 단건 조회 차단', false, '통과되면 안 됨');
} catch { ok('코드 단건 조회 차단', true); }

console.log('\n[코드 사용]');
const redeem = async (uid, c) => {
  const tk = await tokenFor(uid);
  const res = await fetch(`${BASE}/api/student-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
    body: JSON.stringify({ schoolId: SCHOOL, code: c }),
  });
  return { status: res.status, json: await res.json() };
};

let res = await redeem(STU_A, 'ZZZZZZ');
ok('없는 코드 거부', res.status === 404, `HTTP ${res.status}`);

res = await redeem(STU_A, code);
ok('학생A 코드 사용 성공', res.status === 200, `${res.json.name || res.json.error}`);

const uA = (await adb.collection('users').doc(STU_A).get()).data();
ok('학생A 반 연결됨', (uA.classIds || []).includes(CLASS), JSON.stringify(uA.classIds));
ok('학생A 이름이 명부 이름으로 설정됨', uA.displayName === '코드검증학생', uA.displayName);
ok('명부에 linkedUid 기록됨', (await rosterRef.get()).data()?.linkedUid === STU_A);

res = await redeem(STU_B, code);
ok('다른 학생의 중복 사용 차단', res.status === 409, `HTTP ${res.status}`);

console.log('\n[학부모 연결]');
res = await redeem(PARENT, code);
ok('학부모 같은 코드로 자녀 연결', res.status === 200 && res.json.as === 'parent', `as=${res.json.as}`);
const uP = (await adb.collection('users').doc(PARENT).get()).data();
ok('학부모 children 에 자녀 추가됨', (uP.children || []).length === 1, JSON.stringify(uP.children));

await signOut(cauth);

// 정리
await rosterRef.delete();
if (code) await adb.doc(`schools/aewol-elementary/studentCodes/${code}`).delete().catch(() => {});
for (const u of [TEACHER, STU_A, STU_B, PARENT]) await adb.collection('users').doc(u).delete();
const logs = await adb.collection('accessLogs').where('classId', '==', CLASS).where('uid', 'in', [STU_A, PARENT]).get();
for (const d of logs.docs) await d.ref.delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
