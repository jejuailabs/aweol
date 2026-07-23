/**
 * 옛 작품을 **아이에게 매단다** (`artistUid`).
 *
 * 선생님이 올린 작품에는 그동안 이름만 남았다. 그러면 아이별로 모을 때
 * 동명이인·개명·오타에 그대로 무너진다. 이제 올릴 때는 명부에서 찾아 매달지만,
 * 이미 올라온 것은 여기서 따라잡는다.
 *
 * **억지로 매달지 않는다.** 같은 반 명부에서 **이름이 정확히 하나** 일치할 때만 잇는다.
 * - 명부에 없는 이름(전학생·손님 작품) → 그대로 둔다
 * - 동명이인 → 누구인지 알 수 없으므로 그대로 둔다
 * 남의 작품이 그 아이 것이 되는 쪽이, 안 이어지는 쪽보다 훨씬 나쁘다.
 *
 * 실행: node scripts/backfill-artwork-artist.mjs        (무엇이 바뀔지만 본다)
 *       node scripts/backfill-artwork-artist.mjs --apply
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeName, studentUidOf } from '../src/lib/student-login.ts';

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

// 명부를 반별로 한 번씩만 읽는다 (작품마다 읽으면 작품 수만큼 읽기가 든다)
const rosterByClass = new Map();
const students = await db.collectionGroup('students').get();
for (const d of students.docs) {
  const p = d.ref.path.split('/'); // schools/{s}/classes/{c}/students/{id}
  const key = `${p[1]}/${p[3]}`;
  const list = rosterByClass.get(key) ?? [];
  list.push({ id: d.id, name: String(d.data().name ?? ''), linkedUid: d.data().linkedUid || null });
  rosterByClass.set(key, list);
}
console.log(`명부 ${students.size}명 · 반 ${rosterByClass.size}개`);

const arts = await db.collectionGroup('artworks').get();
console.log(`작품 ${arts.size}점`);

let linked = 0, already = 0, noRoster = 0, ambiguous = 0, notFound = 0;
let batch = db.batch();
let pending = 0;

for (const d of arts.docs) {
  const v = d.data();
  if (v.artistUid) { already++; continue; }

  const p = d.ref.path.split('/');
  const schoolId = p[1], classId = p[3];
  const roster = rosterByClass.get(`${schoolId}/${classId}`);
  if (!roster || roster.length === 0) { noRoster++; continue; }

  const key = normalizeName(String(v.artistName ?? ''));
  const hit = roster.filter((s) => normalizeName(s.name) === key);
  if (hit.length > 1) { ambiguous++; console.log(`  ? 동명이인이라 건너뜀: ${classId} ${v.artistName} — ${v.title}`); continue; }
  if (hit.length === 0) { notFound++; console.log(`  ? 명부에 없어 건너뜀: ${classId} ${v.artistName} — ${v.title}`); continue; }

  const uid = studentUidOf(schoolId, classId, hit[0]);
  linked++;
  console.log(`  ✓ ${classId} ${v.artistName} — ${v.title} → ${uid}`);
  if (APPLY) {
    batch.update(d.ref, { artistUid: uid });
    pending++;
    if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
}
if (APPLY && pending > 0) await batch.commit();

console.log(`\n이미 매여 있음 ${already}점 · ${APPLY ? '이었음' : '이을 것'} ${linked}점`);
console.log(`건너뜀 — 명부 없는 반 ${noRoster}점 · 동명이인 ${ambiguous}점 · 명부에 없는 이름 ${notFound}점`);
if (!APPLY && linked > 0) console.log('실제로 쓰려면 --apply 를 붙이세요.');
