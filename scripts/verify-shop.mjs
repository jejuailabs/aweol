// 상점·도장 경제 검증: 잔액 위조, 중복 구매, 미보유 착용, 도장 중복 지급, 재제출 파밍
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, updateDoc, setDoc } from 'firebase/firestore';

const SCHOOL = 'aewol-elementary';
const CLASS = '3-1';
const HW = 'zz-shop-hw';
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

const STU = 'zz-shop-student';
const TEA = 'zz-shop-teacher';

const stuRef = adb.collection('users').doc(STU);
const teaRef = adb.collection('users').doc(TEA);

const resetUsers = async () => {
  await stuRef.set({
    displayName: '상점검증학생', role: 'student', classIds: [CLASS], children: [],
    stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: 'avatar_01',
    preferences: { theme: 'light' },
  });
  await teaRef.set({
    displayName: '상점검증교사', role: 'teacher', classIds: [CLASS], children: [],
    stamps: 0, avatarCustom: { hat: null, accessory: null }, avatarId: 'avatar_01',
    preferences: { theme: 'light' },
  });
};
await resetUsers();

const hwRef = adb.doc(`schools/${SCHOOL}/classes/${CLASS}/homeworks/${HW}`);
await hwRef.set({
  title: '상점 검증 숙제', description: '', submitType: 'text', visibility: 'class',
  dueDate: null, authorUid: TEA, authorName: '상점검증교사',
});

const tokenFor = async (uid) => {
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};

const shop = (token, body) =>
  fetch(`${BASE}/api/shop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const homework = (method, token, body) =>
  fetch(`${BASE}/api/homework`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

const hwBase = { schoolId: SCHOOL, classId: CLASS, homeworkId: HW };
const stamps = async (uid) => (await adb.collection('users').doc(uid).get()).data()?.stamps ?? 0;

console.log('[잔액 위조 차단]');
const stuToken = await tokenFor(STU);
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(STU));
try {
  await updateDoc(doc(cdb, 'users', STU), { stamps: 9999 });
  ok('클라이언트가 잔액 못 고침', false, '통과되면 안 됨');
} catch { ok('클라이언트가 잔액 못 고침', true); }

try {
  await updateDoc(doc(cdb, 'users', STU), { avatarCustom: { hat: 'hat-crown', accessory: null } });
  ok('클라이언트가 착용 아이템 못 고침', false, '통과되면 안 됨');
} catch { ok('클라이언트가 착용 아이템 못 고침', true); }

try {
  await setDoc(doc(cdb, `users/${STU}/inventory/hat-crown`), { itemId: 'hat-crown' });
  ok('클라이언트가 인벤토리 못 씀', false, '통과되면 안 됨');
} catch { ok('클라이언트가 인벤토리 못 씀', true); }

// 이 기능 이전에 만들어진 계정(stamps 필드 없음)도 아바타·설정 저장이 되어야 한다.
// 규칙에서 get(키, 기본값)을 안 쓰면 여기서 막힌다.
await stuRef.update({ stamps: FieldValue.delete() });
try {
  await updateDoc(doc(cdb, 'users', STU), { avatarId: 'avatar_03' });
  ok('stamps 없는 옛 계정도 프로필 수정 가능', true);
} catch (e) { ok('stamps 없는 옛 계정도 프로필 수정 가능', false, String(e).slice(0, 70)); }
await stuRef.set({ stamps: 0 }, { merge: true });
await signOut(cauth);

console.log('\n[도장 지급]');
const teaToken = await tokenFor(TEA);
await homework('POST', stuToken, { ...hwBase, text: '상점 검증 제출' });
let r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: true });
let j = await r.json();
ok('검사완료 시 도장 1개 지급', j.awarded === 1, `awarded=${j.awarded}`);
ok('잔액 반영됨', (await stamps(STU)) === 1, `${await stamps(STU)}개`);

await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: false });
r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: true });
j = await r.json();
ok('재검사해도 두 번 주지 않음', j.awarded === 0 && (await stamps(STU)) === 1, `${await stamps(STU)}개`);

console.log('\n[재제출 파밍 차단]');
await homework('POST', stuToken, { ...hwBase, text: '다시 제출해서 도장 더 받기' });
r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: true });
j = await r.json();
ok('재제출 후 재검사도 추가 지급 없음', j.awarded === 0 && (await stamps(STU)) === 1, `${await stamps(STU)}개`);

console.log('\n[구매]');
r = await shop(stuToken, { action: 'buy', itemId: 'hat-crown' });
ok('도장 부족하면 못 삼 (왕관 10개)', r.status === 400, `HTTP ${r.status}`);

await stuRef.set({ stamps: 5 }, { merge: true });
r = await shop(stuToken, { action: 'buy', itemId: 'hat-ribbon' });
ok('살 수 있으면 구입 성공 (리본 2개)', r.ok, `HTTP ${r.status}`);
ok('가격만큼 차감됨', (await stamps(STU)) === 3, `${await stamps(STU)}개`);

r = await shop(stuToken, { action: 'buy', itemId: 'hat-ribbon' });
ok('같은 걸 두 번 못 삼', r.status === 409, `HTTP ${r.status}`);
ok('중복 구매 시도로 차감 안 됨', (await stamps(STU)) === 3, `${await stamps(STU)}개`);

r = await shop(stuToken, { action: 'buy', itemId: 'stamp-great' });
ok('학생은 교사 도장 못 삼', r.status === 403, `HTTP ${r.status}`);

r = await shop(stuToken, { action: 'buy', itemId: 'zz-not-real' });
ok('없는 물건 404', r.status === 404, `HTTP ${r.status}`);

console.log('\n[착용]');
r = await shop(stuToken, { action: 'equip', slot: 'hat', itemId: 'hat-crown' });
ok('안 산 물건은 못 낌', r.status === 403, `HTTP ${r.status}`);

r = await shop(stuToken, { action: 'equip', slot: 'accessory', itemId: 'hat-ribbon' });
ok('모자를 액세서리 칸에 못 낌', r.status === 400, `HTTP ${r.status}`);

r = await shop(stuToken, { action: 'equip', slot: 'hat', itemId: 'hat-ribbon' });
ok('산 물건은 착용됨', r.ok, `HTTP ${r.status}`);
let ac = (await stuRef.get()).data()?.avatarCustom;
ok('avatarCustom 에 기록됨', ac?.hat === 'hat-ribbon', JSON.stringify(ac));

r = await shop(stuToken, { action: 'equip', slot: 'hat', itemId: null });
ac = (await stuRef.get()).data()?.avatarCustom;
ok('해제됨', r.ok && ac?.hat === null, JSON.stringify(ac));

console.log('\n[교사 도장]');
r = await shop(teaToken, { action: 'buy', itemId: 'stamp-great' });
ok('교사는 도장 도안 받을 수 있음 (무료)', r.ok, `HTTP ${r.status}`);
ok('무료 품목은 잔액 안 건드림', (await stamps(TEA)) === 0, `${await stamps(TEA)}개`);

r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: false });
r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: true, stampId: 'stamp-great' });
ok('보유한 도장은 찍힘', r.ok, `HTTP ${r.status}`);
const subData = (await hwRef.collection('submissions').doc(STU).get()).data();
ok('제출물에 도장 기록됨', subData?.stamp?.itemId === 'stamp-great', JSON.stringify(subData?.stamp));

r = await homework('PATCH', teaToken, { ...hwBase, studentUid: STU, check: true, stampId: 'stamp-best' });
ok('안 가진 도장은 못 찍음', r.status === 403, `HTTP ${r.status}`);

// 정리
for (const c of ['submissions', 'nudges']) {
  const s = await hwRef.collection(c).get();
  for (const d of s.docs) await d.ref.delete();
}
await hwRef.delete();
for (const uid of [STU, TEA]) {
  for (const c of ['inventory', 'stampLedger']) {
    const s = await adb.collection('users').doc(uid).collection(c).get();
    for (const d of s.docs) await d.ref.delete();
  }
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
