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
const TEA = 'zz-pet-teacher';
const KID = 'zz-pet-kid';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '교사', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(KID).set({ ...base, displayName: '아이', role: 'student', schoolIds: [], classIds: [] });

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};

const PET = doc(cdb, 'schools', SCHOOL, 'pet', 'main');
await adb.doc(`schools/${SCHOOL}/pet/main`).delete().catch(() => {});

console.log('[동물 들이기]');
await asUser(KID);
try {
  await setDoc(PET, { kind: 'dog', name: '멍멍', fedAt: serverTimestamp(), wateredAt: serverTimestamp(), pettedAt: serverTimestamp(), careCount: 0, lastCarerName: '' });
  ok('아이는 동물을 못 들임', false, '통과되면 안 됨');
} catch { ok('아이는 동물을 못 들임', true); }

await asUser(TEA);
try {
  await setDoc(PET, { kind: 'dog', name: '멍멍', fedAt: serverTimestamp(), wateredAt: serverTimestamp(), pettedAt: serverTimestamp(), careCount: 0, lastCarerName: '' });
  ok('교사는 동물을 들임', true);
} catch (e) { ok('교사는 동물을 들임', false, String(e).slice(0, 60)); }

console.log('\n[돌보기]');
await asUser(KID);
try {
  await updateDoc(PET, { kind: 'dog', name: '멍멍', fedAt: serverTimestamp(), careCount: 1, lastCarerName: '아이' });
  ok('아이도 먹이를 줄 수 있음', true);
} catch (e) { ok('아이도 먹이를 줄 수 있음', false, String(e).slice(0, 60)); }

// 여기가 핵심 — 연타로 숫자를 부풀리지 못해야 한다
try {
  await updateDoc(PET, { kind: 'dog', name: '멍멍', careCount: 9999, lastCarerName: '아이' });
  ok('돌본 횟수를 한꺼번에 못 올림', false, '통과되면 안 됨');
} catch { ok('돌본 횟수를 한꺼번에 못 올림', true); }

try {
  await updateDoc(PET, { kind: 'dog', name: '멍멍', careCount: 0, lastCarerName: '아이' });
  ok('돌본 횟수를 되돌리지도 못함', false, '통과되면 안 됨');
} catch { ok('돌본 횟수를 되돌리지도 못함', true); }

try {
  await updateDoc(PET, { kind: 'dog', name: '내맘대로', careCount: 2, lastCarerName: '아이' });
  ok('아이는 이름을 못 바꿈', false, '통과되면 안 됨');
} catch { ok('아이는 이름을 못 바꿈', true); }

try {
  await updateDoc(PET, { kind: 'cat', name: '멍멍', careCount: 2, lastCarerName: '아이' });
  ok('아이는 종류를 못 바꿈', false, '통과되면 안 됨');
} catch { ok('아이는 종류를 못 바꿈', true); }

try {
  await deleteDoc(PET);
  ok('아이는 동물을 못 내보냄', false, '통과되면 안 됨');
} catch { ok('아이는 동물을 못 내보냄', true); }

await asUser(TEA);
try {
  await updateDoc(PET, { name: '해피' });
  ok('교사는 이름을 바꿈', true);
} catch (e) { ok('교사는 이름을 바꿈', false, String(e).slice(0, 60)); }

await signOut(cauth).catch(() => {});
const finalPet = (await adb.doc(`schools/${SCHOOL}/pet/main`).get()).data();
ok('돌본 횟수가 1로 남음 (부풀리기 실패)', finalPet?.careCount === 1, String(finalPet?.careCount));
ok('이름은 교사가 바꾼 값', finalPet?.name === '해피', String(finalPet?.name));

// 정리
await adb.doc(`schools/${SCHOOL}/pet/main`).delete().catch(() => {});
for (const uid of [TEA, KID]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
