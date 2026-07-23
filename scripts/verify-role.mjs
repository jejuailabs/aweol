// 역할 승인 게이트 검증: 자기지정 차단, 승인 전 무권한, 승인 후 교직원
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, updateDoc, setDoc, getDocs, collection } from 'firebase/firestore';

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

const NEW = 'zz-role-newbie';   // 막 가입한 사람
const SA = 'zz-role-superadmin';

const newRef = adb.collection('users').doc(NEW);
await newRef.set({
  displayName: '역할검증신규', role: null, pendingRole: null, classIds: [], children: [],
  stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: null,
  preferences: { theme: 'light' },
});
await adb.collection('users').doc(SA).set({
  displayName: '역할검증총관리자', role: 'super_admin', pendingRole: null, classIds: [], children: [],
  stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: null,
  preferences: { theme: 'light' },
});

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const role = (method, token, body) =>
  fetch(`${BASE}/api/role`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const roleOf = async (uid) => (await adb.collection('users').doc(uid).get()).data()?.role ?? null;

console.log('[클라이언트 자기지정 차단]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(NEW));
try {
  await updateDoc(doc(cdb, 'users', NEW), { role: 'teacher' });
  ok('users 문서에 role 직접 못 씀', false, '통과되면 안 됨');
} catch { ok('users 문서에 role 직접 못 씀', true); }

try {
  await updateDoc(doc(cdb, 'users', NEW), { pendingRole: 'teacher' });
  ok('pendingRole 도 직접 못 씀', false, '통과되면 안 됨');
} catch { ok('pendingRole 도 직접 못 씀', true); }

try {
  await updateDoc(doc(cdb, 'users', NEW), { classIds: [CLASS] });
  ok('classIds 직접 못 씀 (남의 반 잠입 차단)', false, '통과되면 안 됨');
} catch { ok('classIds 직접 못 씀 (남의 반 잠입 차단)', true); }

// 문서를 통째로 새로 만들면서 role 을 심는 경로
try {
  await setDoc(doc(cdb, 'users', NEW), {
    displayName: '위조', role: 'teacher', pendingRole: null, classIds: [], children: [],
    stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: null,
    preferences: { theme: 'light' },
  });
  ok('문서 통째 덮어쓰기로도 못 심음', false, '통과되면 안 됨');
} catch { ok('문서 통째 덮어쓰기로도 못 심음', true); }

try {
  await updateDoc(doc(cdb, 'users', NEW), { avatarId: 'avatar_02' });
  ok('평범한 프로필 수정은 여전히 허용', true);
} catch (e) { ok('평범한 프로필 수정은 여전히 허용', false, String(e).slice(0, 70)); }
await signOut(cauth);

console.log('\n[신청]');
const newToken = await tokenFor(NEW);
let r = await role('POST', newToken, { role: 'super_admin' });
ok('총관리자는 신청 못 함', r.status === 400, `HTTP ${r.status}`);

/**
 * 교사 신청에는 **학교와 반**이 함께 와야 한다.
 * 권한이 그 반 안에서만 통하므로, 반이 없으면 승인해도 할 수 있는 일이 없다.
 * (이 스크립트가 한동안 학교·반을 안 보내서 400 만 맞고 있었다)
 */
r = await role('POST', newToken, {
  role: 'teacher',
  schoolId: SCHOOL,
  grade: Number(CLASS.split('-')[0]),
  classNumber: Number(CLASS.split('-')[1]),
});
let j = await r.json();
ok('교사 신청 접수됨', r.ok && j.pending === true, `pending=${j.pending}`);
ok('신청만으로는 권한 없음 (role=null)', (await roleOf(NEW)) === null, `role=${await roleOf(NEW)}`);
ok('pendingRole 에 기록됨', (await newRef.get()).data()?.pendingRole === 'teacher');

console.log('\n[승인 권한]');
r = await role('PATCH', newToken, { uid: NEW, approve: true });
ok('본인이 자기 신청 승인 못 함', r.status === 403, `HTTP ${r.status}`);
ok('여전히 권한 없음', (await roleOf(NEW)) === null, `role=${await roleOf(NEW)}`);

console.log('\n[승인 대기 중 실제 권한 확인]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(NEW));
try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/students`));
  ok('승인 전에는 명부 못 봄', false, '통과되면 안 됨');
} catch { ok('승인 전에는 명부 못 봄', true); }
await signOut(cauth);

console.log('\n[슈퍼관리자 승인]');
const saToken = await tokenFor(SA);
r = await role('PATCH', saToken, { uid: NEW, approve: true });
ok('총관리자는 승인 가능', r.ok, `HTTP ${r.status}`);
ok('role 이 teacher 로 올라감', (await roleOf(NEW)) === 'teacher', `role=${await roleOf(NEW)}`);
ok('pendingRole 정리됨', ((await newRef.get()).data()?.pendingRole ?? null) === null);

await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(NEW));
try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/students`));
  ok('승인 후에는 명부 열람 가능', true);
} catch (e) { ok('승인 후에는 명부 열람 가능', false, String(e).slice(0, 70)); }
await signOut(cauth);

console.log('\n[중복·재신청]');
/**
 * 교사 신청에는 **학교와 반**이 함께 와야 한다.
 * 권한이 그 반 안에서만 통하므로, 반이 없으면 승인해도 할 수 있는 일이 없다.
 * (이 스크립트가 한동안 학교·반을 안 보내서 400 만 맞고 있었다)
 */
r = await role('POST', newToken, {
  role: 'teacher',
  schoolId: SCHOOL,
  grade: Number(CLASS.split('-')[0]),
  classNumber: Number(CLASS.split('-')[1]),
});
ok('이미 역할 있으면 재신청 거부', r.status === 409, `HTTP ${r.status}`);

r = await role('PATCH', saToken, { uid: NEW, approve: true });
ok('신청 중이 아닌 계정은 승격 불가', r.status === 409, `HTTP ${r.status}`);

console.log('\n[거절]');
await newRef.set({ role: null, pendingRole: 'teacher' }, { merge: true });
r = await role('PATCH', saToken, { uid: NEW, reject: true });
ok('거절 처리됨', r.ok, `HTTP ${r.status}`);
ok('거절 후 권한 없음', (await roleOf(NEW)) === null && ((await newRef.get()).data()?.pendingRole ?? null) === null);

// 정리
for (const uid of [NEW, SA]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
