// 저장 비용 점검: Storage 사용량, 고아 파일, Firestore 에 박힌 base64
//
// 배포물이 아니라 Firebase 쪽이 요금의 대부분이다. 특히
//  1) 학교 대표 이미지를 새로 올릴 때 옛 파일을 안 지우면 계속 쌓인다
//  2) dataURL(base64)을 Firestore 문서에 그대로 넣으면 읽을 때마다 그 용량을 다시 낸다
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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
const bucket = getStorage().bucket(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

const mb = (b) => (b / 1024 / 1024).toFixed(2) + 'MB';

// ---------- Storage ----------
const [files] = await bucket.getFiles();
let total = 0;
const byPrefix = {};
for (const f of files) {
  const size = Number(f.metadata.size || 0);
  total += size;
  const prefix = f.name.split('/').slice(0, 2).join('/');
  byPrefix[prefix] = byPrefix[prefix] || { count: 0, bytes: 0 };
  byPrefix[prefix].count += 1;
  byPrefix[prefix].bytes += size;
}
console.log(`[Storage] 파일 ${files.length}개 · 합계 ${mb(total)}`);
Object.entries(byPrefix)
  .sort((a, b) => b[1].bytes - a[1].bytes)
  .forEach(([p, v]) => console.log(`  ${p.padEnd(34)} ${String(v.count).padStart(4)}개  ${mb(v.bytes)}`));

// ---------- 참조되지 않는 파일 ----------
const referenced = new Set();
const addUrl = (u) => {
  if (typeof u !== 'string' || !u) return;
  // storage.googleapis.com/<bucket>/<path>  또는  firebasestorage.../o/<encoded path>
  let m = u.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(\?|$)/);
  if (m) { referenced.add(decodeURIComponent(m[1])); return; }
  m = u.match(/\/o\/(.+?)(\?|$)/);
  if (m) referenced.add(decodeURIComponent(m[1]));
};

const schools = await db.collection('schools').get();
schools.docs.forEach((d) => addUrl(d.data().imageUrl));

for (const col of ['artworks', 'submissions', 'questions']) {
  const snap = await db.collectionGroup(col).get().catch(() => null);
  if (!snap) continue;
  snap.docs.forEach((d) => {
    const v = d.data();
    addUrl(v.imageUrl);
    addUrl(v.thumbnailUrl);
  });
}

/**
 * 코드가 직접 주소를 박아 쓰는 파일들은 Firestore 가 가리키지 않는다.
 * (lib/image-urls.ts 의 배경 이미지, 데모 작품 등)
 * 이걸 빼먹으면 멀쩡히 쓰는 이미지를 고아로 잡아 지워버린다.
 */
const CODE_OWNED = /^app-assets\/(?!schools\/)/;

const orphans = files.filter((f) => !referenced.has(f.name) && !CODE_OWNED.test(f.name));
const orphanBytes = orphans.reduce((a, f) => a + Number(f.metadata.size || 0), 0);
console.log(`\n[고아 파일] ${orphans.length}개 · ${mb(orphanBytes)}`);
console.log('  (사용자가 올린 것 중 아무 문서도 가리키지 않는 것.');
console.log('   코드가 주소를 박아 쓰는 app-assets/* 는 애초에 제외한다)');
orphans.slice(0, 20).forEach((f) => console.log(`  ${f.name}  ${mb(Number(f.metadata.size || 0))}`));
if (orphans.length > 20) console.log(`  ... 외 ${orphans.length - 20}개`);

// ---------- Firestore 에 박힌 base64 ----------
console.log('\n[Firestore 안의 base64]');
let fat = 0;
const checkDoc = (path, v) => {
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' && val.startsWith('data:image/')) {
      console.log(`  ⚠ ${path} .${k} — ${mb(val.length)} (문서에 이미지가 통째로 들어 있음)`);
      fat += 1;
    }
  }
};
schools.docs.forEach((d) => checkDoc(`schools/${d.id}`, d.data()));
for (const col of ['artworks', 'submissions', 'questions', 'blackboard']) {
  const snap = await db.collectionGroup(col).get().catch(() => null);
  if (!snap) continue;
  snap.docs.forEach((d) => checkDoc(d.ref.path, d.data()));
}
if (fat === 0) console.log('  없음 ✓');

console.log('\n지우려면: node scripts/audit-storage.mjs --clean');

// ---------- 정리 ----------
if (process.argv.includes('--clean') && orphans.length > 0) {
  for (const f of orphans) await f.delete().catch(() => {});
  console.log(`\n✓ 고아 파일 ${orphans.length}개 삭제 (${mb(orphanBytes)} 회수)`);
}
