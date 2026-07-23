/**
 * 도전 골든벨 — 서버·규칙 검증.
 *
 * 광장 OX(`verify-ox-api`)와 같은 것을 본다: **정답을 미리 볼 수 있는가,
 * 정답을 보고 답을 고칠 수 있는가.** 더해서 골든벨만의 것 두 가지 —
 * **자리는 서른까지**, **우승이 여럿일 수 있다.**
 *
 * 실행: node scripts/verify-bell-api.mjs   (서버가 떠 있어야 한다)
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
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

const S = 'zz-bell-school';
const ROOM = 'hall';
const roomPath = `schools/${S}/bellRooms/${ROOM}`;
/** 자리가 서른까지인지 보려면 서른을 넘겨봐야 한다 */
const KIDS = Array.from({ length: 33 }, (_, i) => `zz-bell-${String(i).padStart(2, '0')}`);
const [A, B, C] = KIDS;

const mk = (uid, name) => adb.collection('users').doc(uid).set({
  displayName: name, role: 'student', pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [S], classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});

const wipe = async () => {
  for (const sub of ['players', 'answers']) {
    const s = await adb.collection(`${roomPath}/${sub}`).get();
    for (const d of s.docs) await d.ref.delete();
  }
  await adb.doc(roomPath).delete().catch(() => {});
  await adb.doc(`schools/${S}/bellGames/${ROOM}`).delete().catch(() => {});
};

await adb.doc(`schools/${S}`).set({
  name: '검증강당', lat: 33, lng: 126, imageUrl: '', tagline: '',
  gradeCount: 1, classPerGrade: 1, assets: [],
});
for (let i = 0; i < KIDS.length; i++) await mk(KIDS[i], `아이${i}`);
await wipe();

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const api = async (uid, action, extra = {}) => {
  const t = await asUser(uid);
  const res = await fetch(`${BASE}/api/bell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ schoolId: S, roomKey: ROOM, action, ...extra }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

// ── 서른셋이 들어온다 ───────────────────────────────────
// 앉은 순서를 확실히 하려고 시각을 직접 준다 (서버가 이 순서로 앉힌다)
for (let i = 0; i < KIDS.length; i++) {
  await adb.doc(`${roomPath}/players/${KIDS[i]}`).set({
    n: `아이${i}`,
    at: new Date(Date.now() - (KIDS.length - i) * 1000),
  });
}
ok('서른셋이 들어와 있다', (await adb.collection(`${roomPath}/players`).get()).size === 33);

const anon = await fetch(`${BASE}/api/bell`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ schoolId: S, roomKey: ROOM, action: 'start' }),
});
ok(`로그인 없이는 못 연다 (${anon.status})`, anon.status === 401);

// ── 판을 연다 ───────────────────────────────────────────
const started = await api(A, 'start', { grade: 5 });
ok(`판이 열린다 (${started.status})`, started.status === 200);

let room = (await adb.doc(roomPath).get()).data();
ok('자리는 서른까지다', room.alive.length === 30);
ok('먼저 온 아이가 앉았다', room.alive.includes(A) && room.alive.includes(B));
ok('늦게 온 아이는 못 앉았다', !room.alive.includes(KIDS[32]));
ok('학년을 골라 열었다', room.grade === 5);
ok('문제가 나왔다', !!room.q && room.status === 'asking');
ok('문제 종류가 적혀 있다', room.kind === 'choice' || room.kind === 'short');

/** **제일 중요한 것** — 판에 정답이 없어야 한다 */
ok('판에 정답이 안 들어 있다', room.answer === null || room.answer === undefined);
ok('판에 해설도 아직 없다', room.why === null || room.why === undefined);
ok('판에 씨앗이 없다', !('seed' in room));
if (room.kind === 'choice') {
  ok('객관식이면 보기는 보여준다', Array.isArray(room.choices) && room.choices.length === 4);
}

await asUser(A);
let readBlocked = false;
try { await getDoc(doc(cdb, `schools/${S}/bellGames/${ROOM}`)); } catch { readBlocked = true; }
ok('문제·정답 문서는 아이가 못 읽는다', readBlocked);
ok('판은 누구나 읽는다', await getDoc(doc(cdb, roomPath)).then((s) => s.exists()).catch(() => false));

// ── 답을 낸다 ───────────────────────────────────────────
const curQ = async () => {
  const g = await adb.doc(`schools/${S}/bellGames/${ROOM}`).get();
  const r = (await adb.doc(roomPath).get()).data();
  return g.data().questions[r.round - 1];
};
const q1 = await curQ();
const right = q1.kind === 'choice' ? q1.answer : q1.answer[0];
const wrong = q1.kind === 'choice' ? (q1.answer + 1) % 4 : '아무말';

await asUser(A);
await setDoc(doc(cdb, `${roomPath}/answers/${A}`), { v: right, round: 1 });
ok('제 시간에는 답을 낼 수 있다', (await adb.doc(`${roomPath}/answers/${A}`).get()).exists);

// 시간 안에는 고쳐 낼 수 있어야 한다 (마지막에 낸 것이 답이다)
await setDoc(doc(cdb, `${roomPath}/answers/${A}`), { v: right, round: 1 });
ok('시간 안에는 고쳐 낼 수 있다', true);

await asUser(B);
await setDoc(doc(cdb, `${roomPath}/answers/${B}`), { v: wrong, round: 1 });
// C 는 아무것도 안 낸다

/**
 * **넷을 더 살려둔다.**
 *
 * 처음엔 A 혼자만 맞히게 했더니 '우승이 여럿일 수 있다' 가 한 명으로도
 * 통과해버렸다 — 아무것도 증명하지 못하는 검증이었다.
 * 여럿이 끝까지 남아야 그 규칙을 진짜로 시험한다.
 */
const alsoRight = KIDS.slice(3, 7);
for (const uid of alsoRight) {
  await adb.doc(`${roomPath}/answers/${uid}`).set({ v: right, round: 1 });
}

await asUser(A);
let denied = false;
await setDoc(doc(cdb, `${roomPath}/answers/${B}`), { v: right, round: 1 }).catch(() => { denied = true; });
ok('남의 판에는 못 쓴다', denied);

denied = false;
await setDoc(doc(cdb, `${roomPath}/answers/${A}`), { v: right, round: 99 }).catch(() => { denied = true; });
ok('지금 문제 번호로만 쓸 수 있다', denied);

denied = false;
await setDoc(doc(cdb, `${roomPath}/answers/${A}`), { v: 'ㅋ'.repeat(200), round: 1 }).catch(() => { denied = true; });
ok('아주 긴 글은 못 쓴다', denied);

// ── 아직 때가 아니면 안 넘어간다 ─────────────────────────
ok('시간 전에는 안 넘어간다', (await api(A, 'advance')).json.moved === false);
room = (await adb.doc(roomPath).get()).data();
ok('그래서 정답도 아직 안 열렸다', room.answer === null || room.answer === undefined);

/**
 * 시간을 지나가게 해서 규칙을 그대로 시험한다.
 * **1분을 뺀다** — 규칙이 보는 건 구글 서버 시계인데 여기 `Date.now()` 는
 * 이 PC 시계다. 이 프로젝트에서 PC 시계가 8초 빨랐던 적이 있다.
 */
const PAST = 60_000;
await adb.doc(roomPath).update({ endsAt: Date.now() - PAST, revealAt: Date.now() - PAST });
await asUser(A);
denied = false;
await setDoc(doc(cdb, `${roomPath}/answers/${A}`), { v: wrong, round: 1 }).catch(() => { denied = true; });
ok('시간이 지나면 답을 못 고친다', denied);

// ── 정답을 연다 ─────────────────────────────────────────
ok('시간이 지나면 넘어간다', (await api(A, 'advance')).json.moved === true);
room = (await adb.doc(roomPath).get()).data();
ok('이제 정답이 열렸다', typeof room.answer === 'string' && room.answer.length > 0);
ok('왜 그런지도 함께 나온다', typeof room.why === 'string' && room.why.length > 3);
ok('맞힌 아이는 남았다', room.alive.includes(A));
ok('맞힌 아이가 여럿이면 여럿 남는다', alsoRight.every((u) => room.alive.includes(u)));
ok('남은 사람이 다섯이다', room.alive.length === 5);
ok('틀린 아이는 물러났다', room.out.includes(B) && !room.alive.includes(B));
ok('아무것도 안 낸 아이도 물러났다', room.out.includes(C) && !room.alive.includes(C));

/** **한 명 남아도 안 끝난다** — 골든벨은 마지막 문제까지 간다 */
ok('아직 안 끝났다', room.status === 'reveal' && room.winners.length === 0);

// ── 마지막 문제까지 밀어본다 ─────────────────────────────
// 남은 아이들이 다 맞히게 해서, **여럿이 함께 우승**하는지 본다
const survivors = [...room.alive];
let guard = 0;
while (guard++ < 40) {
  room = (await adb.doc(roomPath).get()).data();
  if (room.status === 'done') break;

  if (room.status === 'reveal') {
    await adb.doc(roomPath).update({ nextAt: Date.now() - PAST });
    await api(A, 'advance');
    continue;
  }
  // asking — 남은 아이들이 다 맞힌다
  const q = await curQ();
  const v = q.kind === 'choice' ? q.answer : q.answer[0];
  for (const uid of room.alive) {
    await adb.doc(`${roomPath}/answers/${uid}`).set({ v, round: room.round });
  }
  await adb.doc(roomPath).update({ endsAt: Date.now() - PAST, revealAt: Date.now() - PAST });
  await api(A, 'advance');
}

room = (await adb.doc(roomPath).get()).data();
ok('마지막 문제까지 가면 끝난다', room.status === 'done');
ok('문제를 다 냈다', room.round === room.total);
ok(`우승이 여럿일 수 있다 (${room.winners.length}명)`,
  room.winners.length === survivors.length && room.winners.length > 1);
ok('남은 아이가 모두 우승했다', survivors.every((u) => room.winners.includes(u)));
ok('물러난 아이는 우승이 아니다', !room.winners.includes(B) && !room.winners.includes(C));
ok('끝난 판은 더 안 움직인다', (await api(A, 'advance')).json.moved === false);

// ── 다시 열면 지난 답이 안 남아 있다 ─────────────────────
await api(A, 'start');
ok('새 판을 열면 지난 답이 치워진다', (await adb.collection(`${roomPath}/answers`).get()).empty);
room = (await adb.doc(roomPath).get()).data();
ok('물러났던 아이도 새 판에는 앉는다', room.alive.includes(B) && room.out.length === 0);

// ── 치우기 ──────────────────────────────────────────────
await signOut(cauth).catch(() => {});
await wipe();
await adb.doc(`schools/${S}`).delete();
for (const u of KIDS) {
  const l = await adb.collection('accessLogs').where('uid', '==', u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
