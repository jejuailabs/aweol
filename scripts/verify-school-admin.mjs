/**
 * 학교관리자(school_admin) 등급 검증.
 *
 * 여기서 보는 것은 딱 하나다 — **중간관리자가 자기 학교 밖으로 못 나가는가.**
 * 등급을 새로 만들 때 가장 위험한 것은 "승인 권한을 받은 사람이 그 권한으로
 * 자기와 같은 등급을 계속 찍어내는 것"이라, 그것도 함께 본다.
 *
 * 실행: BASE_URL=https://aweol.vercel.app node scripts/verify-school-admin.mjs
 * (푸시 직후 바로 돌리면 구버전이 응답한다. 2~3분 기다린다)
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';

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
const OTHER = 'zz-sa-other-school';

const SA = 'zz-sa-admin';            // 우리 학교 학교관리자
const SUPER = 'zz-sa-super';         // 총관리자
const APP_T = 'zz-sa-applicant-tea'; // 우리 학교 교사 신청자
const APP_O = 'zz-sa-applicant-out'; // 남의 학교 교사 신청자
const APP_A = 'zz-sa-applicant-adm'; // 학교관리자 신청자
const KID = 'zz-sa-kid';             // 아무 상관 없는 아이

const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};

const reset = async () => {
  await adb.collection('users').doc(SA).set({ ...base, displayName: '학교관리자', role: 'school_admin', schoolIds: [SCHOOL], classIds: [] });
  await adb.collection('users').doc(SUPER).set({ ...base, displayName: '총관리자', role: 'super_admin', schoolIds: [], classIds: [] });
  await adb.collection('users').doc(KID).set({ ...base, displayName: '아이', role: 'student', schoolIds: [SCHOOL], classIds: ['3-1'] });
  await adb.collection('users').doc(APP_T).set({ ...base, displayName: '신청선생님', role: null, pendingRole: 'teacher', pendingSchoolId: SCHOOL, pendingClassId: '3-1', schoolIds: [], classIds: [] });
  await adb.collection('users').doc(APP_O).set({ ...base, displayName: '남의학교신청', role: null, pendingRole: 'teacher', pendingSchoolId: OTHER, pendingClassId: '3-1', schoolIds: [], classIds: [] });
  await adb.collection('users').doc(APP_A).set({ ...base, displayName: '관리자신청', role: null, pendingRole: 'school_admin', pendingSchoolId: SCHOOL, pendingClassId: null, schoolIds: [], classIds: [] });
};
await reset();

const tokenFor = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const patch = (tok, body) =>
  fetch(`${BASE}/api/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });

console.log('[승인 권한 — 누가 누구를]');
let saTok = await tokenFor(SA);
let r = await patch(saTok, { uid: APP_O, approve: true });
ok('학교관리자가 남의 학교 교사 승인 → 거부', r.status === 403, `HTTP ${r.status}`);
ok('남의 학교 신청자는 그대로 대기',
  (await adb.collection('users').doc(APP_O).get()).data()?.role == null);

saTok = await tokenFor(SA);
r = await patch(saTok, { uid: APP_A, approve: true });
ok('학교관리자가 학교관리자 임명 → 거부', r.status === 403, `HTTP ${r.status}`);
ok('학교관리자 신청자는 그대로 대기',
  (await adb.collection('users').doc(APP_A).get()).data()?.role == null);

saTok = await tokenFor(SA);
r = await patch(saTok, { uid: APP_T, approve: true });
ok('학교관리자가 우리 학교 교사 승인 → 통과', r.ok, `HTTP ${r.status}`);
const approved = (await adb.collection('users').doc(APP_T).get()).data();
ok('역할이 teacher 로', approved?.role === 'teacher', String(approved?.role));
ok('소속 학교가 우리 학교', JSON.stringify(approved?.schoolIds) === JSON.stringify([SCHOOL]), JSON.stringify(approved?.schoolIds));
ok('담당 반이 들어감', (approved?.classIds || []).includes('3-1'), JSON.stringify(approved?.classIds));

console.log('\n[학교관리자 임명은 총관리자만]');
const suTok = await tokenFor(SUPER);
r = await patch(suTok, { uid: APP_A, approve: true });
ok('총관리자가 학교관리자 임명 → 통과', r.ok, `HTTP ${r.status}`);
const madeSa = (await adb.collection('users').doc(APP_A).get()).data();
ok('역할이 school_admin 으로', madeSa?.role === 'school_admin', String(madeSa?.role));
ok('학교가 한 곳만', JSON.stringify(madeSa?.schoolIds) === JSON.stringify([SCHOOL]), JSON.stringify(madeSa?.schoolIds));
/** 학교관리자는 담임이 아닐 수 있다 — 반이 없어도 임명된다 */
ok('맡은 반은 비어 있음', (madeSa?.classIds || []).length === 0, JSON.stringify(madeSa?.classIds));

console.log('\n[아이는 아무것도 못 한다]');
const kidTok = await tokenFor(KID);
await reset();
r = await patch(kidTok, { uid: APP_T, approve: true });
ok('학생의 승인 시도 거부', r.status === 403, `HTTP ${r.status}`);

console.log('\n[규칙 — 남의 계정 들여다보기]');
await tokenFor(SA);
/**
 * 학교관리자에게 users 를 연 것은 **우리 학교 교사 신청자까지**다.
 * 그보다 넓게 물으면 규칙에 막혀 질의 자체가 실패해야 한다.
 */
let readOk = false;
try {
  const snap = await getDocs(query(
    collection(cdb, 'users'),
    where('pendingRole', '==', 'teacher'),
    where('pendingSchoolId', '==', SCHOOL)
  ));
  readOk = snap.docs.some((d) => d.id === APP_T);
} catch { readOk = false; }
ok('우리 학교 교사 신청자는 보인다', readOk);

let wideDenied = false;
try {
  await getDocs(collection(cdb, 'users'));
  wideDenied = false;
} catch { wideDenied = true; }
ok('users 전체 조회는 막힌다', wideDenied);

let kidDenied = false;
try {
  const d = await getDoc(doc(cdb, 'users', KID));
  kidDenied = !d.exists();
} catch { kidDenied = true; }
ok('상관없는 아이 문서는 못 읽는다', kidDenied);

let otherDenied = false;
try {
  const d = await getDoc(doc(cdb, 'users', APP_O));
  otherDenied = !d.exists();
} catch { otherDenied = true; }
ok('남의 학교 신청자 문서는 못 읽는다', otherDenied);

await signOut(cauth).catch(() => {});

// 정리
for (const uid of [SA, SUPER, APP_T, APP_O, APP_A, KID]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
