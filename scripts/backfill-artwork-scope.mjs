/**
 * 작품에 소속(schoolId·classId)과 공개 범위(visibility)를 채운다.
 *
 * **규칙보다 먼저 돌려야 한다.**
 * 갤러리 조회는 `where('visibility','==','school')` 로 묻는데, Firestore 의 등호는
 * **필드가 없는 문서를 안 집는다.** 그래서 이 필드가 없는 옛 작품은 채우기 전까지
 * 갤러리에서 통째로 사라진다.
 *
 * 전시실에 `visibility` 가 없으면 'school' 로 친다 — 지금까지의 동작이 그것이다.
 * 여러 번 돌려도 안전하다(이미 맞는 문서는 건너뛴다).
 *
 * 실행: node scripts/backfill-artwork-scope.mjs        (무엇이 바뀔지만 본다)
 *       node scripts/backfill-artwork-scope.mjs --apply (실제로 쓴다)
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

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

/** 전시실의 공개 범위. 없으면 학교 공개. */
const visOf = (v) => (v === 'class' ? 'class' : 'school');

// 전시실을 먼저 통째로 읽어둔다 — 작품마다 읽으면 작품 수만큼 읽기가 든다
const acts = await db.collectionGroup('activities').get();
const actVis = new Map();
for (const a of acts.docs) actVis.set(a.ref.path, visOf(a.data().visibility));
console.log(`전시실 ${acts.size}개`);

const arts = await db.collectionGroup('artworks').get();
console.log(`작품 ${arts.size}점`);

let changed = 0;
let already = 0;
let batch = db.batch();
let pending = 0;

for (const d of arts.docs) {
  // schools/{s}/classes/{c}/activities/{a}/artworks/{id}
  const p = d.ref.path.split('/');
  const schoolId = p[1] ?? '';
  const classId = p[3] ?? '';
  const actPath = p.slice(0, 6).join('/');
  const visibility = actVis.get(actPath) ?? 'school';

  const cur = d.data();
  if (cur.schoolId === schoolId && cur.classId === classId && cur.visibility === visibility) {
    already++;
    continue;
  }

  changed++;
  console.log(`  ${changed === 1 ? '' : ''}${classId} · ${cur.title ?? d.id} → ${visibility}`);
  if (APPLY) {
    batch.update(d.ref, { schoolId, classId, visibility });
    pending++;
    // Firestore 배치 상한은 500. 여유 있게 400 에서 끊는다.
    if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
}

if (APPLY && pending > 0) await batch.commit();

console.log(`\n이미 맞음 ${already}점 · ${APPLY ? '고침' : '고칠 것'} ${changed}점`);
if (!APPLY && changed > 0) console.log('실제로 쓰려면 --apply 를 붙이세요.');
