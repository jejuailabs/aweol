// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';

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

const SCHOOL = 'aewol-elementary';
const CLASS = 'zz-arch-class';
const YEAR = '2019';
const TEA = 'zz-arch-teacher';
const OTHER = 'zz-arch-other';
const KID = 'zz-arch-kid';
const base = {
  pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  children: [], stamps: 0, avatarCustom: { hat: null, accessory: null },
  avatarId: null, preferences: { theme: 'light' },
};
await adb.collection('users').doc(TEA).set({ ...base, displayName: '담임', role: 'teacher', schoolIds: [SCHOOL], classIds: [CLASS] });
await adb.collection('users').doc(OTHER).set({ ...base, displayName: '남의반담임', role: 'teacher', schoolIds: [SCHOOL], classIds: ['3-1'] });
await adb.collection('users').doc(KID).set({ ...base, displayName: '아이', role: 'student', schoolIds: [], classIds: [CLASS] });

const cbase = `schools/${SCHOOL}/classes/${CLASS}`;
await adb.doc(cbase).set({
  schoolId: SCHOOL, grade: '6', classNumber: 9, year: YEAR,
  teacherUid: TEA, teacherName: '담임', motto: '', introText: '',
  isArchived: false, memberUids: [],
});
// 명부 — 갈무리에 이름이 들어가면 안 된다
await adb.doc(`${cbase}/students/s1`).set({ number: 1, name: '비밀이름학생', code: null, linkedUid: null, linkedAt: null });
// 작품 (공개)
await adb.doc(`${cbase}/artworks/a1`).set({
  title: '봄 그림', artistName: '아이', artistUid: KID,
  imageUrl: 'https://example.com/a.jpg', thumbnailUrl: 'https://example.com/t.jpg',
  type: 'flat', artistComment: '', uploadedBy: KID, uploadedByRole: 'student',
  status: 'approved', rejectionReason: null, uploadedAt: new Date(),
});
await adb.doc(`${cbase}/activities/v1`).set({ title: '가을 소풍', description: '', date: '2019-10-01', emoji: '🍁', color: '#E8A33C' });
// 숙제 — 하나는 공개, 하나는 선생님만
await adb.doc(`${cbase}/homeworks/h-open`).set({ title: '공개 숙제', description: '', submitType: 'text', visibility: 'class', dueDate: null, authorUid: TEA, authorName: '담임', createdAt: new Date() });
await adb.doc(`${cbase}/homeworks/h-secret`).set({ title: '선생님만 보는 숙제', description: '', submitType: 'text', visibility: 'teacher', dueDate: null, authorUid: TEA, authorName: '담임', createdAt: new Date() });
await adb.doc(`${cbase}/homeworks/h-open/submissions/${KID}`).set({
  studentUid: KID, studentName: '아이', type: 'text', text: '공개해도 되는 답', imageUrl: '', videoUrl: '', linkUrl: '',
  status: 'approved', moderation: null, publicToClass: true, teacherComment: '', checked: false,
  checkedAt: null, stamp: null, awarded: false, submittedAt: new Date(),
});
await adb.doc(`${cbase}/homeworks/h-secret/submissions/${KID}`).set({
  studentUid: KID, studentName: '아이', type: 'text', text: '비밀숙제내용입니다', imageUrl: '', videoUrl: '', linkUrl: '',
  status: 'approved', moderation: null, publicToClass: false, teacherComment: '', checked: false,
  checkedAt: null, stamp: null, awarded: false, submittedAt: new Date(),
});
// 퀴즈 (문항·정답은 갈무리에서 빠져야 한다)
await adb.doc(`${cbase}/quizzes/q1`).set({ title: '수학 퀴즈', description: '', visibility: 'class', createdAt: new Date() });
await adb.doc(`${cbase}/quizzes/q1/answerKeys/k1`).set({ answerIndex: 2, answerText: '정답은42' });

const tokenFor = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const call = (tok, body) =>
  fetch(`${BASE}/api/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  });

console.log('[권한]');
let r = await call(null, { schoolId: SCHOOL, classId: CLASS });
ok('비로그인 거부', r.status === 401, `HTTP ${r.status}`);
r = await call(await tokenFor(OTHER), { schoolId: SCHOOL, classId: CLASS });
ok('남의 반은 못 옮김', r.status === 403, `HTTP ${r.status}`);
r = await call(await tokenFor(KID), { schoolId: SCHOOL, classId: CLASS });
ok('아이는 못 옮김', r.status === 403, `HTTP ${r.status}`);

console.log('\n[갈무리]');
const teaToken = await tokenFor(TEA);
r = await call(teaToken, { schoolId: SCHOOL, classId: CLASS });
const j = await r.json();
ok('담임은 옮길 수 있음', r.ok, `HTTP ${r.status}`);
ok('작품 수가 맞음', j.counts?.artworks === 1, JSON.stringify(j.counts));

const arch = (await adb.doc(`schools/${SCHOOL}/archives/${YEAR}-${CLASS}`).get()).data();
ok('요약 문서가 생김', !!arch);
ok('연도가 맞음', arch?.year === YEAR, String(arch?.year));
ok('대표 그림이 들어감', !!arch?.coverUrl, String(arch?.coverUrl));
ok('반이 활성 목록에서 빠짐',
  (await adb.doc(cbase).get()).data()?.isArchived === true);
ok('원본 작품은 그대로 있음',
  (await adb.doc(`${cbase}/artworks/a1`).get()).exists);

console.log('\n[갈무리 파일에 사적인 것이 없나 — 이 파일은 공개다]');
const res = await fetch(arch.detailUrl);
ok('파일을 누구나 받을 수 있음 (졸업생용)', res.ok, `HTTP ${res.status}`);
const raw = await res.text();
ok('명부 이름이 없음', !raw.includes('비밀이름학생'));
ok('아이 수는 숫자로만 남음', JSON.parse(raw).studentCount === 1, String(JSON.parse(raw).studentCount));
ok("'선생님만 보기' 제출물이 없음", !raw.includes('비밀숙제내용입니다'));
ok('공개 제출물은 담김', raw.includes('공개해도 되는 답'));
ok('퀴즈 정답이 없음', !raw.includes('정답은42'));
ok('작품은 담김', raw.includes('봄 그림'));
ok('활동은 담김', raw.includes('가을 소풍'));

console.log('\n[포트폴리오 — 내가 옮긴 것만]');
ok('archivedBy 가 담임', arch?.archivedBy === TEA, String(arch?.archivedBy));

await signOut(cauth).catch(() => {});

// 정리
await adb.doc(`schools/${SCHOOL}/archives/${YEAR}-${CLASS}`).delete().catch(() => {});
for (const sub of ['students', 'artworks', 'activities', 'homeworks', 'quizzes']) {
  for (const d of (await adb.collection(`${cbase}/${sub}`).get()).docs) {
    for (const inner of ['submissions', 'answerKeys', 'questions', 'nudges']) {
      for (const x of (await d.ref.collection(inner).get()).docs) await x.ref.delete();
    }
    await d.ref.delete();
  }
}
await adb.doc(cbase).delete().catch(() => {});
for (const uid of [TEA, OTHER, KID]) {
  const logs = await adb.collection('accessLogs').where('uid', '==', uid).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
