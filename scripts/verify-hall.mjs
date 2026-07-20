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
const SA = 'zz-hall-super';
const TEA = 'zz-hall-teacher';
const KID_A = 'zz-hall-kidA';
const KID_B = 'zz-hall-kidB';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(SA).set({ ...base, displayName: '총관리자', role: 'super_admin', schoolIds: [], classIds: [] });
await adb.collection('users').doc(TEA).set({ ...base, displayName: '교사', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(KID_A).set({ ...base, displayName: '아이A', role: 'student', schoolIds: [], classIds: [] });
await adb.collection('users').doc(KID_B).set({ ...base, displayName: '아이B', role: 'student', schoolIds: [], classIds: [] });

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};

const NOTICES = collection(cdb, 'schools', SCHOOL, 'hallNotices');
const SUGG = collection(cdb, 'schools', SCHOOL, 'suggestions');

console.log('[현관 공지]');
await asUser(KID_A);
try {
  await getDocs(NOTICES);
  ok('공지는 누구나 읽음', true);
} catch (e) { ok('공지는 누구나 읽음', false, String(e).slice(0, 60)); }
try {
  await addDoc(NOTICES, { title: '아이가 쓴 공지', body: '', authorUid: KID_A, authorName: 'A', createdAt: serverTimestamp() });
  ok('아이는 공지를 못 씀', false, '통과되면 안 됨');
} catch { ok('아이는 공지를 못 씀', true); }

await asUser(TEA);
let noticeId = null;
try {
  const r = await addDoc(NOTICES, { title: '검증 공지', body: '내용', authorUid: TEA, authorName: '교사', createdAt: serverTimestamp() });
  noticeId = r.id;
  ok('이 학교 교사는 공지를 씀', true);
} catch (e) { ok('이 학교 교사는 공지를 씀', false, String(e).slice(0, 60)); }

console.log('\n[건의함 — 공개가 아니다]');
await asUser(KID_A);
let suggA = null;
try {
  const r = await addDoc(SUGG, { body: 'A의 건의', authorUid: KID_A, authorName: 'A', reply: null, repliedBy: null, createdAt: serverTimestamp() });
  suggA = r.id;
  ok('아이는 건의를 낼 수 있음', true);
} catch (e) { ok('아이는 건의를 낼 수 있음', false, String(e).slice(0, 60)); }

try {
  await addDoc(SUGG, { body: '남의 이름으로', authorUid: KID_B, authorName: 'B', reply: null, repliedBy: null, createdAt: serverTimestamp() });
  ok('남의 이름으로는 못 냄', false, '통과되면 안 됨');
} catch { ok('남의 이름으로는 못 냄', true); }

try {
  await addDoc(SUGG, { body: '자문자답', authorUid: KID_A, authorName: 'A', reply: '이미 답변됨', repliedBy: KID_A, createdAt: serverTimestamp() });
  ok('낼 때 답변을 미리 못 채움', false, '통과되면 안 됨');
} catch { ok('낼 때 답변을 미리 못 채움', true); }

try {
  const own = await getDocs(query(SUGG, where('authorUid', '==', KID_A)));
  ok('내 건의는 내가 봄', own.size >= 1, `${own.size}건`);
} catch (e) { ok('내 건의는 내가 봄', false, String(e).slice(0, 60)); }

// 여기가 핵심 — 다른 아이 건의가 보이면 안 된다
await asUser(KID_B);
try {
  await getDoc(doc(cdb, 'schools', SCHOOL, 'suggestions', suggA));
  ok('다른 아이 건의는 못 읽음', false, '통과되면 안 됨');
} catch { ok('다른 아이 건의는 못 읽음', true); }
try {
  await getDocs(SUGG);
  ok('아이는 건의 전체 목록을 못 봄', false, '통과되면 안 됨');
} catch { ok('아이는 건의 전체 목록을 못 봄', true); }
try {
  await updateDoc(doc(cdb, 'schools', SCHOOL, 'suggestions', suggA), { reply: '아이가 단 답변' });
  ok('아이는 답변을 못 닮', false, '통과되면 안 됨');
} catch { ok('아이는 답변을 못 닮', true); }
try {
  await deleteDoc(doc(cdb, 'schools', SCHOOL, 'suggestions', suggA));
  ok('남의 건의는 못 지움', false, '통과되면 안 됨');
} catch { ok('남의 건의는 못 지움', true); }

await asUser(TEA);
try {
  const all = await getDocs(SUGG);
  ok('교사는 건의 전체를 봄', all.size >= 1, `${all.size}건`);
} catch (e) { ok('교사는 건의 전체를 봄', false, String(e).slice(0, 60)); }
try {
  await updateDoc(doc(cdb, 'schools', SCHOOL, 'suggestions', suggA), { reply: '답변합니다', repliedBy: TEA });
  ok('교사는 답변을 닮', true);
} catch (e) { ok('교사는 답변을 닮', false, String(e).slice(0, 60)); }

await signOut(cauth).catch(() => {});

// 정리
// 검증이 만든 건 검증용 계정이 쓴 것뿐이다. 중간에 죽어도 남지 않게 통째로 훑는다.
const testUids = [SA, TEA, KID_A, KID_B];
for (const col of ['suggestions', 'hallNotices']) {
  const snap = await adb.collection(`schools/${SCHOOL}/${col}`).get();
  for (const d of snap.docs) {
    if (testUids.includes(d.data().authorUid)) await d.ref.delete();
  }
}
for (const uid of [SA, TEA, KID_A, KID_B]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
