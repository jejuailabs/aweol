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
const CLASS = '3-1';
const TEA = 'zz-read-teacher';
const KID_A = 'zz-read-kidA';
const KID_B = 'zz-read-kidB';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '담임', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS] });
await adb.collection('users').doc(KID_A).set({ ...base, displayName: '아이A', role: 'student', schoolIds: [], classIds: [CLASS] });
await adb.collection('users').doc(KID_B).set({ ...base, displayName: '아이B', role: 'student', schoolIds: [], classIds: [CLASS] });

const HW = 'zz-read-hw';
const hwRef = adb.doc(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}`);
await hwRef.set({
  title: '읽음 검증 숙제', description: '', submitType: 'text', visibility: 'class',
  dueDate: null, authorUid: TEA, authorName: '담임', createdAt: new Date(),
});

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};
const readsCol = collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/reads`);
const readDoc = (uid) => doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/reads`, uid);

console.log('[읽음 남기기]');
await asUser(KID_A);
try {
  await setDoc(readDoc(KID_A), { studentUid: KID_A, readAt: serverTimestamp() });
  ok('본인 읽음은 남길 수 있음', true);
} catch (e) { ok('본인 읽음은 남길 수 있음', false, String(e).slice(0, 60)); }

try {
  await setDoc(readDoc(KID_B), { studentUid: KID_B, readAt: serverTimestamp() });
  ok('남의 이름으로는 못 남김', false, '통과되면 안 됨');
} catch { ok('남의 이름으로는 못 남김', true); }

console.log('\n[한 번만 쓴다]');
const first = (await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/reads/${KID_A}`).get()).data();
try {
  await setDoc(readDoc(KID_A), { studentUid: KID_A, readAt: serverTimestamp() });
  ok('두 번째 쓰기는 막힘', false, '통과되면 안 됨');
} catch { ok('두 번째 쓰기는 막힘', true); }
const again = (await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/reads/${KID_A}`).get()).data();
ok('처음 본 시각이 그대로', first?.readAt?.toMillis() === again?.readAt?.toMillis());

console.log('\n[누가 볼 수 있나]');
try {
  await getDoc(readDoc(KID_A));
  ok('내 읽음 기록은 내가 봄', true);
} catch (e) { ok('내 읽음 기록은 내가 봄', false, String(e).slice(0, 60)); }

await asUser(KID_B);
try {
  await getDoc(readDoc(KID_A));
  ok('다른 아이 읽음은 못 봄', false, '통과되면 안 됨');
} catch { ok('다른 아이 읽음은 못 봄', true); }
try {
  await getDocs(readsCol);
  ok('아이는 전체 목록을 못 봄', false, '통과되면 안 됨');
} catch { ok('아이는 전체 목록을 못 봄', true); }

await asUser(TEA);
try {
  const all = await getDocs(readsCol);
  ok('담임은 전체를 봄', all.size === 1, `${all.size}건`);
} catch (e) { ok('담임은 전체를 봄', false, String(e).slice(0, 60)); }

try {
  await deleteDoc(readDoc(KID_A));
  ok('담임은 지울 수 있음', true);
} catch (e) { ok('담임은 지울 수 있음', false, String(e).slice(0, 60)); }

await signOut(cauth).catch(() => {});

// 정리
for (const d of (await adb.collection(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}/reads`).get()).docs) await d.ref.delete();
await hwRef.delete();
for (const uid of [TEA, KID_A, KID_B]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
