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
const KID = 'zz-track-kid';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(KID).set({ ...base, displayName: '달리기아이', role: 'student', schoolIds: [], classIds: [] });

await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const token = await cauth.currentUser.getIdToken();

const call = (method, body, tok = token) =>
  fetch(`${BASE}/api/track`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  });

console.log('[권한]');
let r = await call('POST', { schoolId: SCHOOL }, null);
ok('비로그인은 출발 불가', r.status === 401, `HTTP ${r.status}`);
r = await call('POST', {});
ok('학교 없이는 출발 불가', r.status === 400, `HTTP ${r.status}`);

console.log('\n[출발 안 하고 도착]');
await adb.doc(`schools/${SCHOOL}/trackRuns/${KID}`).delete().catch(() => {});
r = await call('PATCH', { schoolId: SCHOOL });
ok('출발 없이 도착하면 거부', r.status === 400, `HTTP ${r.status}`);

console.log('\n[너무 빠른 기록]');
r = await call('POST', { schoolId: SCHOOL });
ok('출발 성공', r.ok, `HTTP ${r.status}`);
r = await call('PATCH', { schoolId: SCHOOL });          // 바로 도착 = 1초도 안 걸림
let j = await r.json();
ok('말이 안 되는 기록은 안 남김', j.recorded === false, JSON.stringify(j).slice(0, 90));
let rec = await adb.doc(`schools/${SCHOOL}/trackRecords/${KID}`).get();
ok('순위표에도 안 들어감', !rec.exists);

console.log('\n[같은 판으로 두 번 도착]');
r = await call('PATCH', { schoolId: SCHOOL });
ok('끝난 판은 다시 못 냄', r.status === 409, `HTTP ${r.status}`);

console.log('\n[정상 기록]');
/**
 * 출발 시각을 20초 전으로 돌려 정상 완주를 흉내낸다.
 *
 * **이 PC 시계로 계산하면 안 된다.** 시간은 서버가 재는데(그게 이 기능의 요점이다)
 * 기준점을 로컬 시각으로 써넣으면, 두 시계가 어긋난 만큼 그대로 오차가 된다.
 * 실제로 이 컴퓨터는 서버보다 **8초 빨라서** 20초를 넣었는데 13초로 측정됐다.
 * 코드는 멀쩡한데 검증만 빨간 상태 — 그런 실패는 진짜 고장을 가린다.
 *
 * 그래서 **서버가 방금 찍어준 출발 시각**을 읽어와 거기서 20초를 뺀다.
 */
await call('POST', { schoolId: SCHOOL });
const runRef = adb.doc(`schools/${SCHOOL}/trackRuns/${KID}`);
const serverStart = (await runRef.get()).data()?.startedAt?.toDate?.() ?? new Date();
await runRef.set({
  uid: KID, startedAt: new Date(serverStart.getTime() - 20000), finished: false,
});
r = await call('PATCH', { schoolId: SCHOOL });
j = await r.json();
ok('정상 기록은 남음', j.recorded === true && j.isBest === true, JSON.stringify(j).slice(0, 90));
ok('걸린 시간이 20초 언저리', j.elapsedMs > 19000 && j.elapsedMs < 26000, `${j.elapsedMs}ms`);

console.log('\n[더 느린 기록은 최고 기록을 못 밀어냄]');
await call('POST', { schoolId: SCHOOL });
await adb.doc(`schools/${SCHOOL}/trackRuns/${KID}`).set({
  uid: KID, startedAt: new Date(Date.now() - 60000), finished: false,
});
r = await call('PATCH', { schoolId: SCHOOL });
j = await r.json();
ok('느린 기록은 최고 기록이 아님', j.isBest === false, JSON.stringify(j).slice(0, 60));
rec = await adb.doc(`schools/${SCHOOL}/trackRecords/${KID}`).get();
ok('최고 기록은 그대로 20초대', rec.data()?.bestMs < 30000, `${rec.data()?.bestMs}ms`);

console.log('\n[클라이언트가 기록을 직접 못 쓴다]');
const { doc: cdoc, setDoc: csetDoc } = await import('firebase/firestore');
try {
  await csetDoc(cdoc(cdb, 'schools', SCHOOL, 'trackRecords', KID), { uid: KID, name: '해커', bestMs: 1 });
  ok('기록 직접 쓰기 차단', false, '통과되면 안 됨');
} catch { ok('기록 직접 쓰기 차단', true); }
try {
  await getDoc(cdoc(cdb, 'schools', SCHOOL, 'trackRuns', KID));
  ok('출발 시각은 못 읽음', false, '통과되면 안 됨');
} catch { ok('출발 시각은 못 읽음', true); }

await signOut(cauth).catch(() => {});

// 정리
await adb.doc(`schools/${SCHOOL}/trackRecords/${KID}`).delete().catch(() => {});
await adb.doc(`schools/${SCHOOL}/trackRuns/${KID}`).delete().catch(() => {});
const logs = await adb.collection('accessLogs').where('uid', '==', KID).get();
for (const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(KID).delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
