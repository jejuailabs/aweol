/**
 * 아이 전시실 검증 — **반을 가로질러 모으되, 볼 수 있는 것만.**
 *
 * 여기서 보려는 것:
 * 1. 본인은 자기 작품을 **반이 달라도** 다 본다 (졸업 전시실의 핵심)
 * 2. 남이 보면 **'우리 반만' 작품은 안 보인다** — 잠근 것이 개인 전시실로 새면
 *    C 에서 한 일이 무너진다
 * 3. 승인 안 된 작품이 남에게 안 보인다
 * 4. 질의가 규칙보다 넓지 않다 (넓으면 전시실이 통째로 빈다)
 *
 * 실행: node scripts/verify-student-exhibit.mjs
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collectionGroup, getDocs, query, where } from 'firebase/firestore';

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
const KID = 'zz-exh-kid';
const OTHER = 'zz-exh-other';

/**
 * 한 아이가 **3학년 때와 5학년 때** 만든 작품. 반이 다르다 —
 * 이것이 한 방에 모이는지가 이 기능의 전부다.
 */
const PIECES = [
  { cls: 'zz-exh-3-1', act: 'a1', id: 'p1', title: '3학년 그림', visibility: 'school', status: 'approved' },
  { cls: 'zz-exh-5-2', act: 'a1', id: 'p2', title: '5학년 그림', visibility: 'school', status: 'approved' },
  { cls: 'zz-exh-5-2', act: 'a2', id: 'p3', title: '우리 반만 그림', visibility: 'class', status: 'approved' },
  { cls: 'zz-exh-5-2', act: 'a2', id: 'p4', title: '아직 승인 전', visibility: 'school', status: 'pending' },
];

for (const p of PIECES) {
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}`).set({
    schoolId: SCHOOL, grade: p.cls.split('-')[2], classNumber: 1, year: '2026',
    teacherUid: '', teacherName: '', motto: '', introText: '', isArchived: false, memberUids: [],
  }, { merge: true });
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}/activities/${p.act}`).set({
    title: '검증', description: '', thumbnailUrl: '', order: 0, visibility: p.visibility,
  }, { merge: true });
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}/activities/${p.act}/artworks/${p.id}`).set({
    title: p.title, artistName: '전시실아이', artistUid: KID,
    imageUrl: '', thumbnailUrl: '', type: 'flat', artistComment: '',
    schoolId: SCHOOL, classId: p.cls, visibility: p.visibility,
    uploadedBy: 'zz-teacher', uploadedByRole: 'teacher',
    uploadedAt: new Date(), status: p.status, rejectionReason: null,
  });
}

const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(KID).set({ ...base, displayName: '전시실아이', role: 'student', schoolIds: [SCHOOL], classIds: ['zz-exh-5-2'] });
await adb.collection('users').doc(OTHER).set({ ...base, displayName: '남의반아이', role: 'student', schoolIds: [SCHOOL], classIds: ['3-1'] });

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  if (uid) await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};
const run = async (q) => {
  try { return { titles: (await getDocs(q)).docs.map((d) => d.data().title).sort() }; }
  catch (e) { return { code: e.code || 'unknown' }; }
};

const mineQuery = query(collectionGroup(cdb, 'artworks'), where('artistUid', '==', KID));
const publicQuery = query(
  collectionGroup(cdb, 'artworks'),
  where('artistUid', '==', KID),
  where('status', '==', 'approved'),
  where('visibility', '==', 'school')
);

console.log('[본인 — 반이 달라도 자기 것은 다 본다]');
await asUser(KID);
const mine = await run(mineQuery);
ok('질의가 통과한다', !!mine.titles, mine.titles ? `${mine.titles.length}점` : mine.code);
if (mine.titles) {
  ok('3학년 때 것이 있다', mine.titles.includes('3학년 그림'));
  ok('5학년 때 것도 같이 있다', mine.titles.includes('5학년 그림'));
  ok('우리 반만 작품도 본인에게는 보인다', mine.titles.includes('우리 반만 그림'));
  ok('승인 전 작품도 본인에게는 보인다', mine.titles.includes('아직 승인 전'));
}

console.log('\n[남이 볼 때 — 잠근 것이 새면 안 된다]');
await asUser(OTHER);
const asOther = await run(publicQuery);
ok('공개 질의는 통과한다', !!asOther.titles, asOther.titles ? `${asOther.titles.length}점` : asOther.code);
if (asOther.titles) {
  ok('학교 공개 작품은 보인다', asOther.titles.includes('3학년 그림') && asOther.titles.includes('5학년 그림'));
  ok('우리 반만 작품은 안 보인다', !asOther.titles.includes('우리 반만 그림'), asOther.titles.join(','));
  ok('승인 전 작품도 안 보인다', !asOther.titles.includes('아직 승인 전'));
}
// 남이 본인용 질의를 그대로 쓰면 규칙이 막아야 한다
const otherWide = await run(mineQuery);
ok('남이 조건 없이 물으면 거부된다', otherWide.code === 'permission-denied',
  otherWide.titles ? `${otherWide.titles.length}점이 그냥 왔다` : otherWide.code);

console.log('\n[비로그인]');
await asUser(null);
const anon = await run(publicQuery);
ok('비로그인도 학교 공개는 본다', !!anon.titles && anon.titles.length === 2,
  anon.titles ? anon.titles.join(',') : anon.code);

await signOut(cauth).catch(() => {});

// ---- 치우기 ----
for (const p of PIECES) {
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}/activities/${p.act}/artworks/${p.id}`).delete().catch(() => {});
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}/activities/${p.act}`).delete().catch(() => {});
  await adb.doc(`schools/${SCHOOL}/classes/${p.cls}`).delete().catch(() => {});
}
for (const uid of [KID, OTHER]) await adb.collection('users').doc(uid).delete().catch(() => {});

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
