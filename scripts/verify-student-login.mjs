/**
 * 아이 로그인 검증 — **이름 + 반 비밀번호**.
 *
 * 여기서 보려는 것:
 * 1. 서버가 발급한 토큰으로 **실제로 로그인이 되는가** (커스텀 토큰을 jose 로 직접
 *    서명하므로, 형식이 조금만 어긋나도 Firebase 가 거절한다)
 * 2. 틀린 비밀번호·없는 이름은 막히는가
 * 3. 동명이인이 A·B 로 갈리는가
 * 4. 반 비밀번호를 **아이가 못 읽고 못 바꾸는가** (읽히면 반 전체가 열린다)
 * 5. 들어온 기록이 이름과 함께 남는가
 *
 * 실행: BASE_URL=https://aweol.vercel.app node scripts/verify-student-login.mjs
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInWithCustomToken as signIn, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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
const CLASS = 'zz-login-3-8';
const PASSWORD = 'orum77';
const TEACHER = 'zz-login-teacher';
const OTHER_TEACHER = 'zz-login-other';

// ---- 판 깔기 ----
await adb.doc(`schools/${SCHOOL}/classes/${CLASS}`).set({
  schoolId: SCHOOL, grade: '3', classNumber: 8, year: '2026',
  teacherUid: TEACHER, teacherName: '로그인검증담임', motto: '', introText: '',
  isArchived: false, memberUids: [],
});
// 동명이인 둘 + 혼자인 이름 하나
const ROSTER = [
  { id: 'student-1', number: 1, name: '김민준' },
  { id: 'student-2', number: 2, name: '김민준' },
  { id: 'student-3', number: 3, name: '이서연' },
];
for (const s of ROSTER) {
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/students/${s.id}`).set({
    number: s.number, name: s.name, code: null, linkedUid: null, linkedAt: null,
  });
}
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEACHER).set({ ...base, displayName: '로그인검증담임', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS] });
await adb.collection('users').doc(OTHER_TEACHER).set({ ...base, displayName: '남의반담임', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });

const tokenFor = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signIn(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const login = (body) =>
  fetch(`${BASE}/api/student-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

console.log('[반 비밀번호 정하기 — 담임만]');
let r = await fetch(`${BASE}/api/student-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(OTHER_TEACHER)}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: CLASS, password: PASSWORD }),
});
ok('남의 반 담임은 못 정한다', r.status === 403, `HTTP ${r.status}`);

r = await fetch(`${BASE}/api/student-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(TEACHER)}` },
  body: JSON.stringify({ schoolId: SCHOOL, classId: CLASS, password: PASSWORD }),
});
ok('담임은 정할 수 있다', r.ok, `HTTP ${r.status}`);

console.log('\n[아이 로그인]');
r = await login({ schoolId: SCHOOL, classId: CLASS, name: '이서연', password: 'aniya99' });
ok('틀린 비밀번호는 막힌다', r.status === 401, `HTTP ${r.status}`);

r = await login({ schoolId: SCHOOL, classId: CLASS, name: '없는아이', password: PASSWORD });
ok('명부에 없는 이름은 막힌다', r.status === 401, `HTTP ${r.status}`);
ok('없는 이름과 틀린 비밀번호의 답이 같다 (명부가 새지 않는다)',
  String((await r.json()).error).includes('이름이나 비밀번호'));

r = await login({ schoolId: SCHOOL, classId: CLASS, name: '김민준', password: PASSWORD });
const dupJson = await r.json();
ok('동명이인은 그냥 이름으로 못 들어간다', r.status === 401, `HTTP ${r.status}`);
ok('무엇을 하면 되는지 알려준다', String(dupJson.error).includes('A'), String(dupJson.error).slice(0, 40));

r = await login({ schoolId: SCHOOL, classId: CLASS, name: '김민준A', password: PASSWORD });
const aJson = await r.json();
ok('김민준A 는 들어간다', r.ok, `HTTP ${r.status}`);
ok('토큰을 받았다', !!aJson.token);

/**
 * **여기가 이 검증의 핵심이다.**
 * 커스텀 토큰을 `firebase-admin/auth` 없이 jose 로 직접 서명하므로,
 * 형식이 조금만 어긋나도 Firebase 가 거절한다. 실제로 교환해봐야 안다.
 */
let signedIn = '';
try {
  await signOut(cauth).catch(() => {});
  const cred = await signInWithCustomToken(cauth, aJson.token);
  signedIn = cred.user.uid;
} catch (e) {
  signedIn = `실패: ${String(e.code || e).slice(0, 60)}`;
}
ok('그 토큰으로 진짜 로그인이 된다', signedIn.startsWith('stu-'), signedIn);

// 띄어쓰기와 앞뒤 공백을 다르게 보지 않는다 (아이가 '이 서연' 이라고 친다)
r = await login({ schoolId: SCHOOL, classId: CLASS, name: ' 이 서연 ', password: PASSWORD });
ok('띄어 쓴 이름도 들어간다', r.ok, `HTTP ${r.status}`);

console.log('\n[들어온 뒤 — 계정이 제대로 섰나]');
const kidUid = signedIn;
const kidDoc = (await adb.collection('users').doc(kidUid).get()).data();
ok('역할이 student', kidDoc?.role === 'student', String(kidDoc?.role));
ok('이름이 명부 이름 (A 가 안 붙는다)', kidDoc?.displayName === '김민준', String(kidDoc?.displayName));
ok('우리 반에 들어가 있다', (kidDoc?.classIds || []).includes(CLASS), JSON.stringify(kidDoc?.classIds));
const linked = (await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/students/student-1`).get()).data();
ok('명부에 계정이 이어졌다', linked?.linkedUid === kidUid, String(linked?.linkedUid));

const logs = await adb.collection('accessLogs').where('uid', '==', kidUid).get();
ok('들어온 기록이 이름과 함께 남는다',
  logs.docs.some((d) => d.data().action === '학생 로그인' && d.data().displayName === '김민준'),
  `${logs.size}건`);

console.log('\n[반 비밀번호는 아이가 못 본다]');
await signOut(cauth).catch(() => {});
await signInWithCustomToken(cauth, aJson.token);
let readDenied = false;
try {
  const s = await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/settings/studentLogin`));
  readDenied = !s.exists();
} catch { readDenied = true; }
ok('아이는 반 비밀번호를 못 읽는다', readDenied);

let writeDenied = false;
try {
  await setDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/settings/studentLogin`), { password: 'haha' });
} catch { writeDenied = true; }
ok('아이는 반 비밀번호를 못 바꾼다', writeDenied);

await signOut(cauth).catch(() => {});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(TEACHER));
let teacherRead = false;
try {
  const s = await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/settings/studentLogin`));
  teacherRead = s.exists() && s.data().password === PASSWORD;
} catch { teacherRead = false; }
ok('담임은 반 비밀번호를 볼 수 있다 (다시 알려줘야 하니까)', teacherRead);

await signOut(cauth).catch(() => {});

// ---- 치우기 ----
for (const s of ROSTER) {
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/students/${s.id}`).delete().catch(() => {});
}
await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/settings/studentLogin`).delete().catch(() => {});
await adb.doc(`schools/${SCHOOL}/classes/${CLASS}`).delete().catch(() => {});
for (const uid of [TEACHER, OTHER_TEACHER, kidUid]) {
  if (!uid || uid.startsWith('실패')) continue;
  const l = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(uid).delete().catch(() => {});
}
// 이서연도 들어왔으므로 그 계정도 치운다
const seoyeon = `stu-${SCHOOL}-${CLASS}-student-3`.replace(/[^a-zA-Z0-9_-]/g, '-');
const l2 = await adb.collection('accessLogs').where('uid', '==', seoyeon).get();
for (const d of l2.docs) await d.ref.delete();
await adb.collection('users').doc(seoyeon).delete().catch(() => {});

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
