// 화면을 한 번 열 때 Firestore 문서를 몇 개나 읽는지 실측한다.
// Firestore 는 문서 단위로 과금하므로, getDocs 한 번이 곧 그 컬렉션 문서 수만큼의 읽기다.
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();

const schools = await db.collection('schools').get();
console.log(`학교 ${schools.size}곳\n`);

let totalClasses = 0;
let totalActivities = 0;
let totalArtworks = 0;
let totalStudents = 0;

for (const s of schools.docs) {
  const classes = await s.ref.collection('classes').get();
  totalClasses += classes.size;
  let acts = 0, arts = 0, studs = 0;
  for (const c of classes.docs) {
    const [a, st] = await Promise.all([
      c.ref.collection('activities').get(),
      c.ref.collection('students').get(),
    ]);
    acts += a.size;
    studs += st.size;
    for (const act of a.docs) {
      const w = await act.ref.collection('artworks').get();
      arts += w.size;
    }
  }
  totalActivities += acts;
  totalArtworks += arts;
  totalStudents += studs;
  console.log(`  ${s.data().name}: 반 ${classes.size} · 활동 ${acts} · 작품 ${arts} · 명부 ${studs}`);
}

const users = (await db.collection('users').get()).size;

// 실제로 대기 중인 작품 수 (최적화 후 승인 화면이 읽는 양)
const pending = (
  await db.collectionGroup('artworks').where('status', '==', 'pending').get()
).size;

console.log('\n=== 화면 한 번 열 때 읽는 문서 수 (현재 데이터 기준) ===\n');

const row = (name, before, after, note) =>
  console.log(
    `  ${name.padEnd(26)} ${String(before).padStart(5)} → ${String(after).padStart(5)}   ${note}`
  );

console.log('  화면                          전  →  후');
row('/admin', schools.size + totalClasses + totalActivities + users,
  schools.size + totalClasses + totalActivities + users,
  '조회 횟수만 감소 (문서 수는 같음)');

row('/admin/[schoolId]',
  totalClasses + totalStudents + totalActivities + totalArtworks + users,
  totalClasses + totalStudents + totalActivities + pending + users,
  '작품은 반 펼칠 때만');

row('/admin/*/approval', totalClasses + totalActivities + totalArtworks, pending,
  '대기 문서만');

console.log('\n※ 무료 한도는 하루 50,000 읽기. 유료는 10만 건당 약 $0.06.\n');

console.log('=== 학교가 늘면 (학교당 24반·활동 3개·작품 10점, 대기 5건 가정) ===');
console.log('  규모        /admin 전 → 후        승인화면 전 → 후');
[1, 10, 50].forEach((n) => {
  const classes = n * 24;
  const acts = classes * 3;
  const arts = acts * 10;
  const adminBefore = n + classes + acts;
  const adminAfter = n + classes + acts; // 문서 수는 같고 왕복 횟수가 줄었다
  const apprBefore = classes + acts + arts;
  const apprAfter = 5 * n;
  console.log(
    `  학교 ${String(n).padStart(3)}곳   ${String(adminBefore).padStart(6)} → ${String(adminAfter).padStart(6)}` +
    `      ${String(apprBefore).padStart(6)} → ${String(apprAfter).padStart(5)}`
  );
});
