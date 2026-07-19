// 칠판 API 검증: 권한, 작성자 위조 방지, IP 기록, 클라이언트 직접 쓰기 차단
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';

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

// 검증용 계정 2개
const STU = 'zz-bb-student';   // 3-1 소속 학생
const OUT = 'zz-bb-outsider';  // 3-2 소속 학생 (남의 반)
await adb.collection('users').doc(STU).set({ displayName: '칠판검증학생', role: 'student', classIds: ['3-1'], children: [] });
await adb.collection('users').doc(OUT).set({ displayName: '남의반학생', role: 'student', classIds: ['3-2'], children: [] });

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const post = (token, body) =>
  fetch(`${BASE}/api/blackboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

console.log('[칠판 쓰기 권한]');
// 1) 비로그인
let r = await post(null, { classId: '3-1', kind: 'stroke', points: [[0.1, 0.1]], color: '#fff', width: 5 });
ok('비로그인 쓰기 차단', r.status === 401, `HTTP ${r.status}`);

// 2) 소속 학생 — 허용, 작성자 위조 시도
const stuToken = await tokenFor(STU);
r = await post(stuToken, {
  classId: '3-1', kind: 'text', points: [[0.3, 0.5]], color: '#FFFFFF', width: 6,
  text: '검증용글',
  authorName: '교장선생님',   // 위조 시도
  authorUid: 'someone-else',
});
const created = await r.json();
ok('소속 학생 쓰기 허용', r.ok, `HTTP ${r.status}`);

if (created.id) {
  const snap = await adb.doc(`schools/aewol-elementary/classes/3-1/blackboard/${created.id}`).get();
  const d = snap.data();
  ok('작성자 위조 무시 (실제 계정으로 기록)', d.authorName === '칠판검증학생' && d.authorUid === STU,
    `기록된 작성자: ${d.authorName}`);
  await snap.ref.delete();
}

// 3) 남의 반 학생 — 차단
const outToken = await tokenFor(OUT);
r = await post(outToken, { classId: '3-1', kind: 'stroke', points: [[0.2, 0.2]], color: '#fff', width: 5 });
ok('다른 반 학생 쓰기 차단', r.status === 403, `HTTP ${r.status}`);

// 4) 전체 지우기는 교직원만
r = await fetch(`${BASE}/api/blackboard?classId=3-1`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${stuToken}` },
});
ok('학생의 전체 지우기 차단', r.status === 403, `HTTP ${r.status}`);

console.log('\n[IP 기록]');
const logSnap = await adb.collection('accessLogs').where('uid', '==', STU).get();
ok('접근 기록 생성됨', logSnap.size > 0, `${logSnap.size}건`);
if (logSnap.size > 0) {
  const l = logSnap.docs[0].data();
  ok('IP 필드 기록됨', !!l.ip, l.ip);
  ok('작성자·행동 기록됨', l.displayName === '칠판검증학생' && !!l.action, `${l.displayName} / ${l.action}`);
}

console.log('\n[클라이언트 직접 쓰기 차단]');
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
try {
  await setDoc(doc(cdb, 'schools/aewol-elementary/classes/3-1/blackboard/zz-direct'), {
    kind: 'text', text: '규칙우회', authorName: '가짜', points: [[0.5, 0.5]],
  });
  ok('Firestore 직접 쓰기 차단', false, '통과되면 안 됨');
} catch {
  ok('Firestore 직접 쓰기 차단', true);
}

console.log('\n[접근 기록 열람 권한]');
try {
  await getDocs(collection(cdb, 'accessLogs'));
  ok('학생의 접근 기록 열람 차단', false, '통과되면 안 됨');
} catch {
  ok('학생의 접근 기록 열람 차단', true);
}

await signOut(cauth);
// 정리
for (const d of logSnap.docs) await d.ref.delete();
await adb.collection('users').doc(STU).delete();
await adb.collection('users').doc(OUT).delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
