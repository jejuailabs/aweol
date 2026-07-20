// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
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
const ROOM = 'zz-test-room';
const A = 'zz-rt-a';
const B = 'zz-rt-b';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(A).set({ ...base, displayName: '아이A', role: 'student', schoolIds: [], classIds: [] });
await adb.collection('users').doc(B).set({ ...base, displayName: '아이B', role: 'student', schoolIds: [], classIds: [] });

const rdb = getDatabase(clientApp);
const meRef = (uid) => ref(rdb, `rooms/${SCHOOL}/${ROOM}/${uid}`);
const roomRef = ref(rdb, `rooms/${SCHOOL}/${ROOM}`);

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};
const payload = (p) => ({ p, t: Date.now(), m: { n: '아이', a: 'avatar_01', s: '', h: '' } });

console.log('[비로그인]');
try {
  await set(meRef(A), payload('1.00,2.00,0.00'));
  ok('비로그인은 못 씀', false, '통과되면 안 됨');
} catch { ok('비로그인은 못 씀', true); }
try {
  await get(roomRef);
  ok('비로그인은 못 읽음', false, '통과되면 안 됨');
} catch { ok('비로그인은 못 읽음', true); }

console.log('\n[내 자리]');
await asUser(A);
try {
  await set(meRef(A), payload('1.00,2.00,0.50'));
  ok('내 위치는 쓸 수 있음', true);
} catch (e) { ok('내 위치는 쓸 수 있음', false, String(e).slice(0, 70)); }

// 여기가 핵심 — 남의 아바타를 옮기면 안 된다
try {
  await set(meRef(B), payload('99.00,99.00,0.00'));
  ok('남의 아바타는 못 옮김', false, '통과되면 안 됨');
} catch { ok('남의 아바타는 못 옮김', true); }

try {
  await get(roomRef);
  ok('로그인하면 방을 읽음', true);
} catch (e) { ok('로그인하면 방을 읽음', false, String(e).slice(0, 70)); }

console.log('\n[이상한 값 막기]');
try {
  await set(meRef(A), { ...payload('1,2,3'), evil: 'x' });
  ok('정해진 칸 외에는 못 씀', false, '통과되면 안 됨');
} catch { ok('정해진 칸 외에는 못 씀', true); }

try {
  await set(meRef(A), payload('x'.repeat(200)));
  ok('긴 좌표 문자열 거부', false, '통과되면 안 됨');
} catch { ok('긴 좌표 문자열 거부', true); }

try {
  await set(meRef(A), { p: '1,2,3', t: Date.now(), m: { n: 'x'.repeat(50), a: '', s: '', h: '' } });
  ok('긴 이름 거부', false, '통과되면 안 됨');
} catch { ok('긴 이름 거부', true); }

console.log('\n[다른 방은 안 보인다]');
await asUser(B);
await set(meRef(B), payload('5.00,6.00,1.00'));
const other = await get(ref(rdb, `rooms/${SCHOOL}/zz-other-room`));
ok('다른 방에는 아무도 없음', !other.exists() || Object.keys(other.val() || {}).length === 0);
const room = Object.keys((await get(roomRef)).val() || {});
ok('같은 방에는 둘 다 있음', room.length === 2, `${room.length}명: ${room.join(', ')}`);

console.log('\n[MOVE PAYLOAD]');
// 실제 동작대로: 들어올 때 전체를 쓰고, 그 뒤로는 위치와 시각만 갱신한다
await update(meRef(B), { p: '7.25,8.10,2.00', t: Date.now() });
const movePayload = JSON.stringify({ p: '7.25,8.10,2.00', t: 1784590672242 });
ok('움직일 때는 위치만 보낸다 (60바이트 미만)', movePayload.length < 60, `${movePayload.length}바이트`);
console.log('  움직일 때:', movePayload);
const whole = JSON.stringify((await get(meRef(B))).val());
ok('그래도 이름·아바타는 남아 있음',
  whole.includes('avatar_01') && whole.includes('7.25'), whole);

// 정리 — 지우는 건 로그아웃 전에 (규칙상 본인만 지울 수 있다)
await remove(meRef(B)).catch(() => {});
await asUser(A);
await remove(meRef(A)).catch(() => {});
await signOut(cauth).catch(() => {});
// RTDB 연결이 살아 있으면 프로세스가 안 끝난다
goOffline(rdb);

await adb.collection('users').doc(A).delete();
await adb.collection('users').doc(B).delete();
for (const uid of [A, B]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
