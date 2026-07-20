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
const TEA = 'zz-hw-teacher';
const KID = 'zz-hw-kid';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '교사', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS] });
await adb.collection('users').doc(KID).set({ ...base, displayName: '숙제아이', role: 'student', schoolIds: [], classIds: [CLASS] });

const tokenFor = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const kidToken = await tokenFor(KID);

// 링크형 숙제를 하나 만든다
const hwRef = adb.collection(`schools/${SCHOOL}/classes/${CLASS}/homeworks`).doc('zz-hw-link');
await hwRef.set({
  title: '검증용 링크 숙제', description: '', submitType: 'link', visibility: 'class',
  dueDate: '2026-12-31', authorUid: TEA, authorName: '교사', createdAt: new Date(),
});

const submit = (body) =>
  fetch(`${BASE}/api/homework`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kidToken}` },
    body: JSON.stringify({ schoolId: SCHOOL, classId: CLASS, homeworkId: 'zz-hw-link', ...body }),
  });

console.log('[영상 주소 제출]');
let r = await submit({ linkUrl: 'https://youtu.be/dQw4w9WgXcQ' });
let j = await r.json();
ok('유튜브 주소는 제출됨', r.ok, `HTTP ${r.status}`);
let sub = (await hwRef.collection('submissions').doc(KID).get()).data();
ok('linkUrl 이 저장됨', sub?.linkUrl === 'https://youtu.be/dQw4w9WgXcQ', String(sub?.linkUrl));

console.log('\n[위험한 주소 차단]');
for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '그냥글자']) {
  r = await submit({ linkUrl: bad });
  ok(`'${bad.slice(0, 24)}' 는 거부`, r.status === 400, `HTTP ${r.status}`);
}

// 위험한 주소가 저장되지 않았는지 확인 (앞의 정상 값이 그대로 남아야 한다)
sub = (await hwRef.collection('submissions').doc(KID).get()).data();
ok('거부된 주소는 저장 안 됨', sub?.linkUrl === 'https://youtu.be/dQw4w9WgXcQ', String(sub?.linkUrl));

console.log('\n[빈 제출]');
r = await submit({});
ok('아무것도 없으면 거부', r.status === 400, `HTTP ${r.status}`);

console.log('\n[영상 파일 주소]');
r = await submit({ videoUrl: 'https://storage.googleapis.com/x/y.mp4' });
ok('videoUrl 제출됨', r.ok, `HTTP ${r.status}`);
sub = (await hwRef.collection('submissions').doc(KID).get()).data();
ok('videoUrl 이 저장됨', sub?.videoUrl === 'https://storage.googleapis.com/x/y.mp4', String(sub?.videoUrl));
ok('제출 종류가 숙제와 같음', sub?.type === 'link', String(sub?.type));

// 정리
for (const d of (await hwRef.collection('submissions').get()).docs) await d.ref.delete();
for (const d of (await hwRef.collection('nudges').get()).docs) await d.ref.delete();
await hwRef.delete();
for (const uid of [TEA, KID]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
