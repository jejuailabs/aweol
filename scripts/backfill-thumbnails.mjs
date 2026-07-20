// 이미 올라간 작품에 썸네일을 만들어 붙인다.
//
// 썸네일은 업로드 시점부터 생기므로, 그 전에 올라간 작품은 전시실에서 여전히
// 원본을 받는다. 한 번 돌려서 따라잡는다. 여러 번 돌려도 안전하다.
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const THUMB_MAX = 640;
const DRY = !process.argv.includes('--apply');

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


/**
 * Storage 주소 → 버킷 내부 경로.
 * 주의: firebasestorage.googleapis.com 이 storage.googleapis.com 을 문자열로 포함한다.
 * 순서를 바꾸면 엉뚱한 경로가 나온다. (lib/storage-path.ts 와 같은 로직)
 */
function storagePathFromUrl(url) {
  if (typeof url !== 'string' || !url) return '';
  const fb = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (fb) return decodeURIComponent(fb[1]);
  const gcs = url.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/([^?]+)/);
  if (gcs) return decodeURIComponent(gcs[1]);
  return '';
}

const kb = (n) => (n / 1024).toFixed(0) + 'KB';

const snap = await db.collectionGroup('artworks').get();
console.log(`작품 ${snap.size}개 검사${DRY ? ' (미리보기 — 실제로 쓰려면 --apply)' : ''}\n`);

let done = 0, skipped = 0, failed = 0, before = 0, after = 0;

for (const d of snap.docs) {
  const v = d.data();
  const imageUrl = v.imageUrl || '';
  if (!imageUrl) { skipped += 1; continue; }
  // 이미 원본과 다른 썸네일이 있으면 건너뛴다
  if (v.thumbnailUrl && v.thumbnailUrl !== imageUrl) { skipped += 1; continue; }

  const path = storagePathFromUrl(imageUrl);
  if (!path) { skipped += 1; continue; }

  try {
    const [buf] = await bucket.file(path).download();
    const out = await sharp(buf)
      .rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    before += buf.length;
    after += out.length;
    console.log(`  ${path.split('/').pop()}  ${kb(buf.length)} → ${kb(out.length)}`);

    if (!DRY) {
      const thumbPath = path.replace(/\.[^.]+$/, '') + '-thumb.jpg';
      const f = bucket.file(thumbPath);
      await f.save(out, { contentType: 'image/jpeg', resumable: false });
      await f.makePublic();
      await d.ref.set(
        { thumbnailUrl: `https://storage.googleapis.com/${bucket.name}/${thumbPath}` },
        { merge: true }
      );
    }
    done += 1;
  } catch (e) {
    console.log(`  ✗ ${path} — ${String(e.message).slice(0, 60)}`);
    failed += 1;
  }
}

console.log(`\n만듦 ${done} · 건너뜀 ${skipped} · 실패 ${failed}`);
if (done > 0) {
  console.log(`전시실 로딩: ${kb(before)} → ${kb(after)} (${(before / Math.max(1, after)).toFixed(1)}배 감소)`);
}
if (DRY) console.log('\n실제로 적용하려면: node scripts/backfill-thumbnails.mjs --apply');
