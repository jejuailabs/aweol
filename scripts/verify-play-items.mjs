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

const KID = 'zz-play-kid';
const BASE_URL_ = process.env.BASE_URL || 'http://localhost:3000';
await adb.collection('users').doc(KID).set({
  displayName: '놀이아이', role: 'student',
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [], classIds: [], children: [], stamps: 10,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});

await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const token = await cauth.currentUser.getIdToken();
const shop = (body) => fetch(`${BASE_URL_}/api/shop`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const inv = (id) => adb.doc(`users/${KID}/inventory/${id}`).get().then((d) => d.data());
const stampsOf = () => adb.doc(`users/${KID}`).get().then((d) => d.data()?.stamps);

console.log('[MARK 사기]');
let r = await shop({ action: 'buy', itemId: 'play-shoes' });
ok('놀이 아이템을 살 수 있음', r.ok, `HTTP ${r.status}`);
ok('개수가 1', (await inv('play-shoes'))?.count === 1, String((await inv('play-shoes'))?.count));
ok('도장이 2 깎임 (10 -> 8)', (await stampsOf()) === 8, String(await stampsOf()));

r = await shop({ action: 'buy', itemId: 'play-shoes' });
ok('같은 걸 또 살 수 있음 (소모품)', r.ok, `HTTP ${r.status}`);
ok('개수가 2', (await inv('play-shoes'))?.count === 2, String((await inv('play-shoes'))?.count));

console.log('[MARK 꾸미기는 하나만]');
r = await shop({ action: 'buy', itemId: 'hat-cap' });
ok('모자 구입', r.ok, `HTTP ${r.status}`);
r = await shop({ action: 'buy', itemId: 'hat-cap' });
ok('모자는 두 번 못 삼', r.status === 409, `HTTP ${r.status}`);

console.log('[MARK 쓰기]');
r = await shop({ action: 'use', itemId: 'play-shoes' });
let j = await r.json();
ok('쓰면 하나 줄어듦', r.ok && j.left === 1, JSON.stringify(j));
ok('저장된 개수도 1', (await inv('play-shoes'))?.count === 1, String((await inv('play-shoes'))?.count));

r = await shop({ action: 'use', itemId: 'play-shoes' });
j = await r.json();
ok('마지막 하나를 쓰면 0', r.ok && j.left === 0, JSON.stringify(j));
ok('다 쓰면 줄이 지워짐', (await inv('play-shoes')) === undefined);

// 핵심 — 없는데 계속 쓸 수 있으면 산 아이만 손해다
r = await shop({ action: 'use', itemId: 'play-shoes' });
ok('없으면 못 씀', r.status === 409, `HTTP ${r.status}`);

console.log('[MARK 이상한 요청]');
r = await shop({ action: 'use', itemId: 'hat-cap' });
ok('꾸미기 아이템은 못 씀', r.status === 400, `HTTP ${r.status}`);
r = await shop({ action: 'use', itemId: 'no-such' });
ok('없는 물건은 못 씀', r.status === 400, `HTTP ${r.status}`);

console.log('[MARK 도장 부족]');
await adb.doc(`users/${KID}`).set({ stamps: 1 }, { merge: true });
r = await shop({ action: 'buy', itemId: 'play-shield' });
ok('도장 모자라면 못 삼', r.status === 400, `HTTP ${r.status}`);

console.log('[MARK 쟁이기 상한]');
await adb.doc(`users/${KID}`).set({ stamps: 999 }, { merge: true });
await adb.doc(`users/${KID}/inventory/play-shield`).set({
  itemId: 'play-shield', category: 'play', paid: 3, count: 20,
});
r = await shop({ action: 'buy', itemId: 'play-shield' });
ok('20개 넘게는 못 삼', r.status === 409, `HTTP ${r.status}`);

await signOut(cauth).catch(() => {});
for (const d of (await adb.collection(`users/${KID}/inventory`).get()).docs) await d.ref.delete();
for (const d of (await adb.collection(`users/${KID}/stampLedger`).get()).docs) await d.ref.delete();
const logs = await adb.collection('accessLogs').where('uid', '==', KID).get();
for (const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(KID).delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
