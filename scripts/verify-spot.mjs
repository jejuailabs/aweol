// 틀린그림 찾기 검증: 정답 좌표 유출 차단, 서버 판정, 시간 위조 차단, 권한
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, getDoc, getDocs, doc, collection } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
const CLASS = '3-1';
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
const ok = (n, c, extra = '') => { console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!c) failed++; };

const STU = 'zz-spot-student';
const TEA = 'zz-spot-teacher';

for (const [uid, name, role] of [[STU, '틀린그림학생', 'student'], [TEA, '틀린그림교사', 'teacher']]) {
  await adb.collection('users').doc(uid).set({
    displayName: name, role, pendingRole: null,
    schoolIds: role === 'teacher' ? [SCHOOL] : [], classIds: [CLASS], children: [],
    stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: null,
    preferences: { theme: 'light' },
  });
}

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const api = (method, token, body, qs = '') =>
  fetch(`${BASE}/api/spot-game${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });

// 1x1 투명 PNG (그림 내용은 검증과 무관하다)
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const stuToken = await tokenFor(STU);
const teaToken = await tokenFor(TEA);

const base = { schoolId: SCHOOL, classId: CLASS };
const SPOTS = [
  { x: 0.2, y: 0.2, r: 0.08 },
  { x: 0.8, y: 0.7, r: 0.08 },
];

console.log('[출제 권한]');
let r = await api('POST', stuToken, {
  ...base, title: '학생이 만든 놀이', originalDataUrl: PNG, variantDataUrl: PNG, spots: SPOTS,
});
ok('학생은 못 만듦', r.status === 403, `HTTP ${r.status}`);

r = await api('POST', teaToken, {
  ...base, title: '검증용 틀린그림', originalDataUrl: PNG, variantDataUrl: PNG,
  layout: 'vertical', spots: SPOTS, visibility: 'class',
});
let j = await r.json();
ok('교사 출제 성공', r.ok, `HTTP ${r.status} ${j.error || ''}`);
const GAME = j.gameId;
ok('찾을 개수는 공개됨', j.spotCount === 2, `${j.spotCount}군데`);

r = await api('POST', teaToken, { ...base, title: '좌표 없는 놀이', originalDataUrl: PNG, variantDataUrl: PNG, spots: [] });
ok('정답 좌표 없으면 거부', r.status === 400, `HTTP ${r.status}`);

const gameRef = adb.doc(`schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}`);

console.log('\n[정답 좌표 유출 차단]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
const gameDoc = await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}`));
ok('학생도 그림·개수는 읽을 수 있음', gameDoc.exists() && gameDoc.data().spotCount === 2);
ok('게임 문서에 좌표가 없음', !('spots' in (gameDoc.data() || {})));

try {
  await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}/answerKey`));
  ok('학생은 정답 좌표 못 읽음', false, '통과되면 안 됨');
} catch { ok('학생은 정답 좌표 못 읽음', true); }

try {
  await getDoc(doc(cdb, `schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}/answerKey/spots`));
  ok('좌표 단건 조회도 차단', false, '통과되면 안 됨');
} catch { ok('좌표 단건 조회도 차단', true); }
await signOut(cauth);

console.log('\n[풀이]');
r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'tap', x: 0.2, y: 0.2 });
ok('시작 전에는 찍을 수 없음', r.status === 409, `HTTP ${r.status}`);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'start' });
ok('시작됨', r.ok, `HTTP ${r.status}`);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'tap', x: 0.5, y: 0.5 });
j = await r.json();
ok('엉뚱한 곳은 오답', j.hit === false);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'tap', x: 0.21, y: 0.19 });
j = await r.json();
ok('정답 근처를 찍으면 맞음', j.hit === true, `index=${j.index}`);
ok('아직 안 끝남', j.done === false && j.foundCount === 1, `${j.foundCount}/${j.total}`);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'tap', x: 0.21, y: 0.19 });
j = await r.json();
ok('같은 곳을 또 찍으면 인정 안 됨', j.hit === false);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'tap', x: 0.8, y: 0.7 });
j = await r.json();
ok('다 찾으면 완료', j.done === true && j.foundCount === 2);
ok('시간이 서버에서 기록됨', typeof j.seconds === 'number' && j.seconds >= 1, `${j.seconds}초`);

const play = (await gameRef.collection('plays').doc(STU).get()).data();
ok('헛짚음도 기록됨', play?.misses === 2, `${play?.misses}회`);
ok('완료 시각 기록됨', !!play?.completedAt);

r = await api('PUT', stuToken, { ...base, gameId: GAME, action: 'start' });
ok('끝낸 뒤 다시 시작 불가 (기록 갈아치우기 차단)', r.status === 409, `HTTP ${r.status}`);

console.log('\n[순위표 열람]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
try {
  const plays = await getDocs(collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}/plays`));
  const leaked = plays.docs.some((d) => 'spots' in d.data());
  ok('순위표는 볼 수 있음', plays.size === 1, `${plays.size}명`);
  ok('순위표에 좌표가 섞이지 않음', !leaked);
} catch (e) { ok('순위표는 볼 수 있음', false, String(e).slice(0, 60)); }
await signOut(cauth);

console.log('\n[삭제]');
r = await api('DELETE', stuToken, null, `?schoolId=${SCHOOL}&classId=${CLASS}&gameId=${GAME}`);
ok('학생은 삭제 못 함', r.status === 403, `HTTP ${r.status}`);

r = await api('DELETE', teaToken, null, `?schoolId=${SCHOOL}&classId=${CLASS}&gameId=${GAME}`);
ok('교사는 삭제 가능', r.ok, `HTTP ${r.status}`);
ok('정답 좌표까지 함께 지워짐', (await gameRef.collection('answerKey').get()).size === 0);
ok('기록도 함께 지워짐', (await gameRef.collection('plays').get()).size === 0);

// 정리
const left = await adb.collection(`schools/${SCHOOL}/classes/${CLASS}/spotGames`).get();
for (const d of left.docs) {
  for (const c of ['answerKey', 'plays']) {
    const s = await d.ref.collection(c).get();
    for (const x of s.docs) await x.ref.delete();
  }
  await d.ref.delete();
}
for (const uid of [STU, TEA]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
