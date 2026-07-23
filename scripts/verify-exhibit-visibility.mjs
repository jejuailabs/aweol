/**
 * 전시실 공개 범위 검증 — **규칙만 본다**(서버 API 가 아니라 Firestore 규칙).
 *
 * 여기서 확인하려는 것은 하나다: **'우리 반만' 이 화면에서만 숨는 게 아닌가.**
 * 갤러리 코드를 아무리 고쳐도 규칙이 열려 있으면 주소를 아는 사람은 그대로 본다.
 *
 * 그리고 **질의가 규칙보다 넓으면 안 된다** — Firestore 는 결과 중 하나라도
 * 막히면 질의 전체를 거절한다. 갤러리가 통째로 비는 사고가 그것이라 같이 본다.
 *
 * 실행: node scripts/verify-exhibit-visibility.mjs
 * (규칙 검증이라 배포와 무관하다. 다만 규칙은 배포돼 있어야 한다)
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, collectionGroup, getDocs, getDoc, doc, query, where } from 'firebase/firestore';

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
const CLASS = 'zz-vis-3-9';
const OPEN_ACT = 'zz-vis-open';
const SHUT_ACT = 'zz-vis-shut';

const INSIDER = 'zz-vis-insider';   // 그 반 아이
const OUTSIDER = 'zz-vis-outsider'; // 다른 반 아이
const TEACHER = 'zz-vis-teacher';   // 그 반 담임
const PARENT = 'zz-vis-parent';     // 그 반 아이의 학부모

const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};

// ---- 판 깔기 ----
await adb.doc(`schools/${SCHOOL}/classes/${CLASS}`).set({
  schoolId: SCHOOL, grade: '3', classNumber: 9, year: '2026',
  teacherUid: TEACHER, teacherName: '검증담임', motto: '', introText: '',
  isArchived: false, memberUids: [],
});
for (const [actId, visibility] of [[OPEN_ACT, 'school'], [SHUT_ACT, 'class']]) {
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/activities/${actId}`).set({
    title: `검증 전시실 (${visibility})`, description: '', thumbnailUrl: '',
    order: 0, visibility,
  });
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/activities/${actId}/artworks/zz-art`).set({
    title: `검증 작품 (${visibility})`, artistName: '아무개', artistUid: 'zz-nobody',
    imageUrl: '', thumbnailUrl: '', type: 'flat', artistComment: '',
    schoolId: SCHOOL, classId: CLASS, visibility,
    uploadedBy: 'zz-nobody', uploadedByRole: 'teacher',
    uploadedAt: new Date(), status: 'approved', rejectionReason: null,
  });
}
await adb.collection('users').doc(INSIDER).set({ ...base, displayName: '우리반아이', role: 'student', schoolIds: [SCHOOL], classIds: [CLASS] });
await adb.collection('users').doc(OUTSIDER).set({ ...base, displayName: '다른반아이', role: 'student', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(TEACHER).set({ ...base, displayName: '검증담임', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS] });
/**
 * **학부모는 `classIds` 가 아니라 자녀 쪽에 반이 있다.**
 * 규칙이 `classIds` 만 보면 학부모만 자녀 전시에서 밀려난다 — 그래서
 * 서버가 `childClassIds` 를 따로 적어주고, 여기서 그게 실제로 통하는지 본다.
 */
await adb.collection('users').doc(PARENT).set({
  ...base, displayName: '검증학부모', role: 'parent', schoolIds: [SCHOOL], classIds: [],
  children: [{ studentUid: INSIDER, classId: CLASS, name: '우리반아이' }],
  childClassIds: [CLASS],
});

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  if (uid) await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};

const artPath = (actId) => `schools/${SCHOOL}/classes/${CLASS}/activities/${actId}/artworks/zz-art`;
const canRead = async (path) => {
  try {
    const d = await getDoc(doc(cdb, path));
    return d.exists();
  } catch { return false; }
};

console.log('[전시실을 주소로 바로 열기 — 규칙이 막아야 한다]');
await asUser(null);
ok('비로그인: 학교 공개 전시실은 보인다', await canRead(artPath(OPEN_ACT)));
ok('비로그인: 우리 반만 전시실은 안 보인다', !(await canRead(artPath(SHUT_ACT))));

await asUser(OUTSIDER);
ok('다른 반 아이: 학교 공개는 보인다', await canRead(artPath(OPEN_ACT)));
ok('다른 반 아이: 우리 반만은 안 보인다 (주소를 알아도)', !(await canRead(artPath(SHUT_ACT))));

await asUser(INSIDER);
ok('그 반 아이: 우리 반만도 보인다', await canRead(artPath(SHUT_ACT)));

await asUser(TEACHER);
ok('담임: 우리 반만도 보인다', await canRead(artPath(SHUT_ACT)));

await asUser(PARENT);
ok('학부모: 자녀 반의 우리 반만도 보인다', await canRead(artPath(SHUT_ACT)));

console.log('\n[전시실 화면이 쓰는 질의 — 실제로 아이가 여는 길]');

/**
 * **화면과 똑같이 묻는다.**
 *
 * 전시실 화면은 반 밖에서는 `visibility` 를 걸어서 묻는다. 규칙이 '학교 공개'를
 * 요구하는데 조건 없이 물으면 (잠긴 작품이 하나라도 있을 때) 질의 전체가 거부되기
 * 때문이다. 검증이 화면과 다르게 물으면 **멀쩡한 화면을 고장났다고 하거나
 * 그 반대가 된다.**
 */
const roomDocs = async (actId, member) => {
  const col = collection(cdb, `schools/${SCHOOL}/classes/${CLASS}/activities/${actId}/artworks`);
  const q = member
    ? query(col, where('status', '==', 'approved'))
    : query(col, where('status', '==', 'approved'), where('visibility', '==', 'school'));
  try { return (await getDocs(q)).docs.length; } catch (e) { return e.code || 'unknown'; }
};

await asUser(null);
ok('비로그인: 학교 공개 전시실이 열린다', (await roomDocs(OPEN_ACT, false)) === 1);
// 잠긴 전시실은 '거부' 가 아니라 **빈 결과**로 온다. 화면은 전시실 문서를 보고
// "우리 반만 보는 전시예요" 라고 알려준다 — 빈 방으로 보이면 아이가 헷갈린다.
ok('비로그인: 우리 반만 전시실은 비어 있다', (await roomDocs(SHUT_ACT, false)) === 0);
// 반 밖에서 조건 없이 묻는 것(= 규칙 우회 시도)은 규칙이 막아야 한다
ok('비로그인: 조건 없이 물으면 거부된다', (await roomDocs(SHUT_ACT, true)) === 'permission-denied');

await asUser(OUTSIDER);
ok('다른 반 아이: 우리 반만 전시실은 비어 있다', (await roomDocs(SHUT_ACT, false)) === 0);
ok('다른 반 아이: 조건 없이 물으면 거부된다', (await roomDocs(SHUT_ACT, true)) === 'permission-denied');

await asUser(INSIDER);
ok('그 반 아이: 우리 반만 전시실이 열린다', (await roomDocs(SHUT_ACT, true)) === 1);
await asUser(PARENT);
ok('학부모: 자녀 반 전시실이 열린다', (await roomDocs(SHUT_ACT, true)) === 1);
await asUser(TEACHER);
ok('담임: 우리 반만 전시실이 열린다', (await roomDocs(SHUT_ACT, true)) === 1);

console.log('\n[전체 갤러리 조회 — 질의가 규칙보다 넓으면 통째로 실패한다]');

/**
 * **실패 이유를 뭉뚱그리면 안 된다.**
 *
 * 복합 인덱스가 만들어지는 동안에는 질의가 `failed-precondition` 으로 실패하는데,
 * 그걸 그냥 '거부됨' 으로 세면 "규칙이 잘 막고 있다" 는 **거짓 통과**가 나온다.
 * 실제로 이 스크립트를 처음 돌렸을 때 그 상태였다.
 */
const tryQuery = async (q) => {
  try { return { docs: (await getDocs(q)).docs }; } catch (e) { return { code: e.code || 'unknown' }; }
};
const denied = (r) => r.code === 'permission-denied';
/** 인덱스가 아직이면 판정 자체를 할 수 없다 — 통과로 넘기지 말고 실패로 세운다 */
const indexPending = (r) => r.code === 'failed-precondition';

await asUser(null);
const openOnly = await tryQuery(query(
  collectionGroup(cdb, 'artworks'),
  where('status', '==', 'approved'),
  where('visibility', '==', 'school')
));
if (indexPending(openOnly)) {
  console.log('  ⏳ 복합 인덱스가 아직 만들어지는 중입니다. 몇 분 뒤 다시 돌려주세요.');
}
ok('비로그인: 학교 공개 질의는 통과', !!openOnly.docs,
  openOnly.docs ? `${openOnly.docs.length}점` : openOnly.code);
ok('비로그인: 그 결과에 잠긴 작품이 없다',
  !!openOnly.docs && openOnly.docs.every((d) => d.data().visibility !== 'class'));

/**
 * 예전 갤러리처럼 `status == 'approved'` 하나로만 물으면 어떻게 되는지.
 * **거부(permission-denied)돼야 정상이다.** 통과하면 규칙이 안 걸린 것이고,
 * 인덱스 때문에 실패한 것이면 판정이 안 된 것이다 — 둘을 갈라서 본다.
 */
const tooWide = await tryQuery(query(
  collectionGroup(cdb, 'artworks'),
  where('status', '==', 'approved')
));
ok('비로그인: 넓은 질의는 규칙이 거부한다', denied(tooWide),
  tooWide.docs ? `${tooWide.docs.length}점이 그냥 왔다` : tooWide.code);

await asUser(INSIDER);
const mine = await tryQuery(query(
  collectionGroup(cdb, 'artworks'),
  where('status', '==', 'approved'),
  where('classId', '==', CLASS)
));
ok('그 반 아이: 내 반 질의는 통과', !!mine.docs, mine.docs ? `${mine.docs.length}점` : mine.code);
ok('그 반 아이: 잠긴 우리 반 작품이 들어 있다',
  !!mine.docs && mine.docs.some((d) => d.data().visibility === 'class'));

await asUser(OUTSIDER);
const notMine = await tryQuery(query(
  collectionGroup(cdb, 'artworks'),
  where('status', '==', 'approved'),
  where('classId', '==', CLASS)
));
ok('다른 반 아이: 남의 반 질의는 규칙이 거부한다', denied(notMine),
  notMine.docs ? `${notMine.docs.length}점이 그냥 왔다` : notMine.code);

await signOut(cauth).catch(() => {});

// ---- 치우기 (진짜 학교 문서에 검증 찌꺼기를 남기지 않는다) ----
for (const actId of [OPEN_ACT, SHUT_ACT]) {
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/activities/${actId}/artworks/zz-art`).delete().catch(() => {});
  await adb.doc(`schools/${SCHOOL}/classes/${CLASS}/activities/${actId}`).delete().catch(() => {});
}
await adb.doc(`schools/${SCHOOL}/classes/${CLASS}`).delete().catch(() => {});
for (const uid of [INSIDER, OUTSIDER, TEACHER, PARENT]) {
  await adb.collection('users').doc(uid).delete().catch(() => {});
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
