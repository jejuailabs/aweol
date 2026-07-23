// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { getDatabase as getAdminRtdb } from 'firebase-admin/database';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getDatabase, ref, set, update, get, remove, goOffline } from 'firebase/database';

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
  // 판을 치우는 데 필요하다 (아래 wipeRoom 참고)
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
});
const adb = getAdminDb();
const clientApp = initializeApp({
  databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const cauth = getAuth(clientApp);


let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

const SCHOOL = 'aewol-elementary';
const ROOM = 'zz-tag-room';
const A = 'zz-tag-a';
const B = 'zz-tag-b';
const C = 'zz-tag-c';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
for (const [uid, nm] of [[A, 'A'], [B, 'B'], [C, 'C']]) {
  await adb.collection('users').doc(uid).set({ ...base, displayName: nm, role: 'student', schoolIds: [], classIds: [] });
}

const rdb = getDatabase(clientApp);
const itRef = ref(rdb, `games/${SCHOOL}/${ROOM}/it`);
const stateRef = ref(rdb, `games/${SCHOOL}/${ROOM}/state`);
const scoreRef = (uid) => ref(rdb, `games/${SCHOOL}/${ROOM}/scores/${uid}`);

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};

/**
 * 지난 검증 흔적 지우기 — **반드시 관리자 권한으로.**
 *
 * 예전에는 클라이언트로 지웠는데, 그 시점에는 아직 로그인 전이라 규칙
 * (`auth != null`)에 막혀 **조용히 실패했다**(`.catch(() => {})`).
 * 그러면 지난 판의 술래(`it`)가 남고, 규칙이 `!data.exists() || data.val() === auth.uid`
 * 이므로 다음 실행은 첫 줄부터 PERMISSION_DENIED 로 무너진다.
 *
 * **한 번 중간에 끊기면 그 뒤로는 영원히 실패한다.** 실제로 그렇게 됐었다 —
 * 배치로 돌리다 타임아웃으로 끊긴 실행이 `it: 'zz-tag-c'` 를 남겼다.
 * 그래서 치우기는 규칙을 타지 않는 관리자 권한으로 한다.
 */
const wipeRoom = () => getAdminRtdb().ref(`games/${SCHOOL}/${ROOM}`).remove();
await wipeRoom();

console.log('[비로그인]');
try { await set(itRef, A); ok('비로그인은 술래를 못 정함', false, 'BAD'); }
catch { ok('비로그인은 술래를 못 정함', true); }

console.log('MARKER_START');
await asUser(A);
try {
  await set(stateRef, { status: 'playing', endsAt: Date.now() + 60000, startedBy: A });
  await set(itRef, A);
  ok('아무도 술래가 아닐 때는 술래가 될 수 있음', true);
} catch (e) { ok('아무도 술래가 아닐 때는 술래가 될 수 있음', false, String(e).slice(0, 60)); }

console.log('MARKER_CORE');
// 핵심 — 술래가 아닌 사람이 남을 술래로 만들면 안 된다
await asUser(B);
try { await set(itRef, C); ok('술래가 아니면 남을 술래로 못 만듦', false, 'BAD'); }
catch { ok('술래가 아니면 남을 술래로 못 만듦', true); }
try { await set(itRef, B); ok('스스로 술래가 되지도 못함', false, 'BAD'); }
catch { ok('스스로 술래가 되지도 못함', true); }

// 술래 본인은 넘길 수 있다
await asUser(A);
try { await set(itRef, B); ok('술래는 술래를 넘길 수 있음', true); }
catch (e) { ok('술래는 술래를 넘길 수 있음', false, String(e).slice(0, 60)); }
ok('술래가 실제로 바뀜', (await get(itRef)).val() === B, String((await get(itRef)).val()));

// 넘긴 뒤에는 더 못 넘긴다
try { await set(itRef, C); ok('넘긴 사람은 더 못 넘김', false, 'BAD'); }
catch { ok('넘긴 사람은 더 못 넘김', true); }

console.log('MARKER_SCORE');
await asUser(A);
try { await update(scoreRef(A), { n: 'A', c: 1 }); ok('내 점수는 쓸 수 있음', true); }
catch (e) { ok('내 점수는 쓸 수 있음', false, String(e).slice(0, 60)); }
try { await update(scoreRef(B), { n: 'B', c: 99 }); ok('남의 점수는 못 씀', false, 'BAD'); }
catch { ok('남의 점수는 못 씀', true); }
try { await update(scoreRef(A), { n: 'A', c: 9999 }); ok('말도 안 되는 점수 거부', false, 'BAD'); }
catch { ok('말도 안 되는 점수 거부', true); }
try { await update(scoreRef(A), { n: 'A', c: 1, evil: 'x' }); ok('정해진 칸 외에는 못 씀', false, 'BAD'); }
catch { ok('정해진 칸 외에는 못 씀', true); }

console.log('MARKER_END');
// 끝나고도 **관리자 권한으로** 치운다 — 남기면 다음 실행이 첫 줄부터 막힌다
await getAdminRtdb().ref(`games/${SCHOOL}/${ROOM}`).remove().catch(() => {});
await signOut(cauth).catch(() => {});
goOffline(rdb);

for (const uid of [A, B, C]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
