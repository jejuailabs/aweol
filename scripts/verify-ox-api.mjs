/**
 * 광장 OX 퀴즈 — 서버·규칙 검증.
 *
 * **여기서 보는 것은 하나다: 아이가 정답을 미리 알거나, 정답을 보고
 * 답을 바꿀 수 있는가.** 그게 되면 놀이가 끝난다.
 *
 * 실행: node scripts/verify-ox-api.mjs   (서버가 떠 있어야 한다)
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

const S = 'zz-ox-school';
const A = 'zz-ox-a', B = 'zz-ox-b', C = 'zz-ox-c';
const ROOM = 'plaza';
const roomPath = `schools/${S}/oxRooms/${ROOM}`;

const mk = (uid, name) => adb.collection('users').doc(uid).set({
  displayName: name, role: 'student', pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds: [S], classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});

const wipe = async () => {
  for (const sub of ['players', 'picks']) {
    const s = await adb.collection(`${roomPath}/${sub}`).get();
    for (const d of s.docs) await d.ref.delete();
  }
  await adb.doc(roomPath).delete().catch(() => {});
  await adb.doc(`schools/${S}/oxGames/${ROOM}`).delete().catch(() => {});
};

await adb.doc(`schools/${S}`).set({
  name: '검증광장', lat: 33, lng: 126, imageUrl: '', tagline: '',
  gradeCount: 1, classPerGrade: 1, assets: [],
});
for (const [u, n] of [[A, '가'], [B, '나'], [C, '다']]) await mk(u, n);
await wipe();

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const api = async (uid, action, extra = {}) => {
  const t = await asUser(uid);
  const res = await fetch(`${BASE}/api/ox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ schoolId: S, roomKey: ROOM, action, ...extra }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

// ── 로그인 없이는 아무것도 ──────────────────────────────
const anon = await fetch(`${BASE}/api/ox`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ schoolId: S, roomKey: ROOM, action: 'start' }),
});
ok(`로그인 없이는 못 연다 (${anon.status})`, anon.status === 401);

// ── 셋이 광장에 들어온다 ────────────────────────────────
for (const [u, n] of [[A, '가'], [B, '나'], [C, '다']]) {
  await asUser(u);
  await setDoc(doc(cdb, `${roomPath}/players/${u}`), { n });
}
ok('아이가 자기 이름을 적을 수 있다', (await adb.collection(`${roomPath}/players`).get()).size === 3);

// 남의 이름칸에는 못 쓴다
await asUser(A);
let denied = false;
await setDoc(doc(cdb, `${roomPath}/players/${B}`), { n: '가짜' }).catch(() => { denied = true; });
ok('남의 이름칸에는 못 쓴다', denied);

// ── 판을 연다 ───────────────────────────────────────────
const started = await api(A, 'start');
ok(`판이 열린다 (${started.status})`, started.status === 200);

let room = (await adb.doc(roomPath).get()).data();
ok('문제가 나왔다', !!room?.q && room.status === 'asking');
ok('세 명 다 살아 있다', room.alive.length === 3);
ok('문제 번호는 1', room.round === 1);

/**
 * **제일 중요한 것.** 판에 정답이 없어야 한다.
 * 여기 정답이 있으면 아이가 화면 개발자도구로 그냥 본다.
 */
ok('판에 정답이 안 들어 있다', room.answer === null || room.answer === undefined);
ok('판에 해설도 아직 없다', room.why === null || room.why === undefined);
ok('판에 씨앗이 없다', !('seed' in room));

// 문제·정답이 든 서버 문서는 아이가 못 읽는다
await asUser(A);
let readBlocked = false;
try {
  await getDoc(doc(cdb, `schools/${S}/oxGames/${ROOM}`));
} catch { readBlocked = true; }
ok('문제·정답 문서는 아이가 못 읽는다', readBlocked);

// 판 자체는 읽을 수 있어야 한다 (다 같이 보는 것이니까)
const readable = await getDoc(doc(cdb, roomPath)).then((s) => s.exists()).catch(() => false);
ok('판은 누구나 읽는다', readable);

// ── 답을 고른다 ─────────────────────────────────────────
const answerOf = async () => {
  const g = await adb.doc(`schools/${S}/oxGames/${ROOM}`).get();
  const r = (await adb.doc(roomPath).get()).data();
  return g.data().questions[r.round - 1].a;
};
const correct = await answerOf();
const wrong = correct === 'O' ? 'X' : 'O';

await asUser(A);
await setDoc(doc(cdb, `${roomPath}/picks/${A}`), { v: correct, round: 1 });
ok('제 시간에는 답을 낼 수 있다', (await adb.doc(`${roomPath}/picks/${A}`).get()).exists);

await asUser(B);
await setDoc(doc(cdb, `${roomPath}/picks/${B}`), { v: wrong, round: 1 });
// 다(C)는 금 위에 서 있다 — 아무것도 안 낸다

// 남의 답은 못 쓴다
await asUser(A);
denied = false;
await setDoc(doc(cdb, `${roomPath}/picks/${B}`), { v: correct, round: 1 }).catch(() => { denied = true; });
ok('남의 답은 못 고친다', denied);

// 엉뚱한 번호로도 못 쓴다 (지난 문제 답을 남겨두고 버티기 방지)
denied = false;
await setDoc(doc(cdb, `${roomPath}/picks/${A}`), { v: correct, round: 99 }).catch(() => { denied = true; });
ok('지금 문제 번호로만 쓸 수 있다', denied);

// O·X 말고 다른 값은 못 쓴다
denied = false;
await setDoc(doc(cdb, `${roomPath}/picks/${A}`), { v: '정답', round: 1 }).catch(() => { denied = true; });
ok('O·X 말고 다른 값은 못 쓴다', denied);

// ── 아직 때가 아니면 안 넘어간다 ─────────────────────────
const tooEarly = await api(A, 'advance');
ok(`시간 전에는 안 넘어간다 (${tooEarly.json.moved})`, tooEarly.json.moved === false);
room = (await adb.doc(roomPath).get()).data();
ok('그래서 정답도 아직 안 열렸다', room.answer === null || room.answer === undefined);

/**
 * **시간이 지나면 답을 못 바꾼다.**
 * 시간을 지나가게 만들어 규칙을 그대로 시험한다.
 *
 * **1분을 뺀다.** 규칙이 보는 `request.time` 은 구글 서버 시계인데
 * 여기서 빼는 `Date.now()` 는 이 PC 시계다. 이 프로젝트에서 실제로
 * **PC 시계가 8초 빨랐던 적이 있어서**(달리기 검증) 1초만 빼면
 * 서버 기준으로는 아직 미래다 — 처음에 이 검증이 그래서 틀렸다.
 */
const PAST = 60_000;
await adb.doc(roomPath).update({ endsAt: Date.now() - PAST, revealAt: Date.now() - PAST });
await asUser(A);
denied = false;
await setDoc(doc(cdb, `${roomPath}/picks/${A}`), { v: wrong, round: 1 }).catch(() => { denied = true; });
ok('시간이 지나면 답을 못 바꾼다', denied);

// ── 정답을 연다 ─────────────────────────────────────────
const revealed = await api(A, 'advance');
ok(`시간이 지나면 넘어간다 (${revealed.json.moved})`, revealed.json.moved === true);
room = (await adb.doc(roomPath).get()).data();
ok('이제 정답이 열렸다', room.answer === correct);
ok('왜 그런지도 함께 나온다', typeof room.why === 'string' && room.why.length > 3);
ok('맞힌 아이는 남았다', room.alive.includes(A));
ok('틀린 아이는 떨어졌다', room.out.includes(B) && !room.alive.includes(B));
ok('아무 데도 안 간 아이도 떨어졌다', room.out.includes(C) && !room.alive.includes(C));

/**
 * 한 명만 남았으니 판이 끝나야 한다 — **마지막 한 명이 우승**이다.
 */
ok('한 명 남았으니 우승자가 정해졌다', room.winners.length === 1 && room.winners[0] === A);
await adb.doc(roomPath).update({ nextAt: Date.now() - 1000 });
await api(A, 'advance');
room = (await adb.doc(roomPath).get()).data();
ok('판이 끝났다', room.status === 'done');

// 끝난 판은 더 안 움직인다
const afterDone = await api(A, 'advance');
ok('끝난 판은 더 안 움직인다', afterDone.json.moved === false);

// ── 다시 열면 지난 답이 안 남아 있다 ─────────────────────
await api(A, 'start');
const leftover = await adb.collection(`${roomPath}/picks`).get();
ok('새 판을 열면 지난 답이 치워진다', leftover.empty);
room = (await adb.doc(roomPath).get()).data();
ok('떨어졌던 아이도 새 판에는 들어간다', room.alive.length === 3 && room.out.length === 0);

// ── 치우기 ──────────────────────────────────────────────
await signOut(cauth).catch(() => {});
await wipe();
await adb.doc(`schools/${S}`).delete();
for (const u of [A, B, C]) {
  const l = await adb.collection('accessLogs').where('uid', '==', u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
