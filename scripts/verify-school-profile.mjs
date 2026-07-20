// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

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

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

const SA = 'zz-prof-super';
const TEA = 'zz-prof-teacher';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(SA).set({
  ...base, displayName: '총관리자', role: 'super_admin', schoolIds: [], classIds: [],
});
await adb.collection('users').doc(TEA).set({
  ...base, displayName: '교사', role: 'teacher',
  schoolIds: ['aewol-elementary'], classIds: ['3-1'],
});

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const saToken = await tokenFor(SA);
const teaToken = await tokenFor(TEA);

const post = (path, token, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

console.log('[권한]');
let r = await post('/api/school-profile', null, { name: '애월초등학교' });
ok('비로그인은 401', r.status === 401, `HTTP ${r.status}`);

r = await post('/api/school-profile', teaToken, { name: '애월초등학교' });
ok('교사는 403 (학교 정보는 총관리자만)', r.status === 403, `HTTP ${r.status}`);

r = await post('/api/school-profile', saToken, {});
ok('이름 없으면 400', r.status === 400, `HTTP ${r.status}`);

console.log('\n[조사 — 실제 웹 검색]');
r = await post('/api/school-profile', saToken, { name: '제주 애월초등학교', address: '제주시 애월읍' });
const j = await r.json();
ok('총관리자는 조사 가능', r.ok, `HTTP ${r.status}`);
if (r.ok) {
  const p = j.profile;
  console.log('  결과:', JSON.stringify(p, null, 1).replace(/\n/g, '\n  '));
  ok('profile 키가 모두 있음',
    ['founded', 'motto', 'flower', 'tree', 'note', 'sources'].every((k) => k in p));
  ok('founded 는 연도 4자리이거나 빈 칸',
    p.founded === '' || /^\d{4}$/.test(p.founded), JSON.stringify(p.founded));
  ok('sources 는 http 주소만', p.sources.every((u) => /^https?:\/\//.test(u)));
  ok('못 찾은 항목은 missing 에 들어감', Array.isArray(j.missing), JSON.stringify(j.missing));
  // 핵심: 못 찾았으면 지어내지 말고 비워야 한다
  for (const k of j.missing) {
    ok(`못 찾은 '${k}' 는 빈 칸`, p[k] === '', JSON.stringify(p[k]));
  }
}

console.log('\n[교표 생성]');
r = await post('/api/school-image', teaToken, { kind: 'emblem', name: '애월초등학교' });
ok('교사는 교표 생성 403', r.status === 403, `HTTP ${r.status}`);

r = await post('/api/school-image', saToken, {
  kind: 'emblem', name: '애월초등학교', flower: '동백꽃', tree: '팽나무',
});
const ej = await r.json();
ok('총관리자는 교표 생성 가능', r.ok, `HTTP ${r.status}`);
ok('dataURL 로 돌아옴', typeof ej.dataUrl === 'string' && ej.dataUrl.startsWith('data:image/'),
  String(ej.dataUrl || ej.error).slice(0, 80));

// 정리
for (const uid of [SA, TEA]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
